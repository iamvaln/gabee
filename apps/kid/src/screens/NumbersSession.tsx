import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { QuestionValue, LevelProgress, LessonProgress } from '@gabee/types';
import { Bee, type BeeExpression } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { GeometryShape, shapeFromConfig, shapeFromLabel } from '../components/GeometryShape';
import { MODULES } from '../content/modules';
import { api } from '../lib/api';
import { enqueueEvent, flushEvents } from '../lib/events';
import { sync } from '../lib/sync';
import { useStore } from '../store';
import { shuffle, displayValue, scalarValue, distractorValue } from '../lib/util';
import type { NumbersSubMode } from './NumbersHub';

const TOTAL = 7;

export function NumbersSession({
  level,
  lesson,
  isRevision,
  trigger,
  onDone,
  onHome,
  onBack,
  subMode = 'arithmetic',
}: {
  level: number;
  /** Real lesson number, or REVISION_LESSON (4) for the revision. */
  lesson: number;
  isRevision: boolean;
  trigger: 'new' | 'replay';
  onDone: (score: number, total: number) => void;
  onHome: () => void;
  onBack: () => void;
  subMode?: NumbersSubMode;
}) {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const play = useStore((s) => s.play);
  const nextLessonPosition = useStore((s) => s.nextLessonPosition);

  const { data: bundle, isLoading } = useQuery({
    queryKey: ['bundle', 'numbers'],
    queryFn: () => api.getBundle('numbers'),
  });

  // The 7-question session. A lesson draws from its own pool; a revision samples across
  // all of the level's lessons (product §4.0). The pool is sub-mode-scoped so the
  // arithmetic and geometry tracks never mix; legacy rows without a sub_mode count
  // toward arithmetic for back-compat.
  const session = useMemo(() => {
    if (!bundle) return null;
    const inSubMode = (q: typeof bundle.questions[number]) =>
      subMode === 'arithmetic' ? q.sub_mode === 'arithmetic' || !q.sub_mode : q.sub_mode === subMode;
    const pool = bundle.questions.filter(
      (q) => inSubMode(q) && q.level === level && (isRevision || q.lesson === lesson),
    );
    if (pool.length === 0) return null;
    return { questions: shuffle(pool).slice(0, Math.min(TOTAL, pool.length)) };
  }, [bundle, level, lesson, isRevision, subMode]);

  const [qIdx, setQIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [attempt, setAttempt] = useState(1);
  const [picked, setPicked] = useState<string | number | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);

  const startedRef = useRef(false);
  const shownRef = useRef<string | null>(null);
  const questionStartRef = useRef(Date.now());
  const lessonStartRef = useRef(Date.now());

  const q = session?.questions[qIdx];
  const ctx = { profileId: profile?.id ?? null, sessionId: play?.id ?? null };
  const answerScalar = q ? scalarValue(q.answer, lang) : null;
  // Options are raw values (rendered per-language at display time), so this doesn't
  // depend on `lang` — only re-shuffle when the question changes.
  const options = useMemo<QuestionValue[]>(
    () => (q ? shuffle([q.answer, ...q.distractors.map(distractorValue)]) : []),
    [q],
  );

  // lesson_started — once, when the session is ready (volition signal, §13.2).
  useEffect(() => {
    if (!session || !q || startedRef.current || !profile) return;
    startedRef.current = true;
    lessonStartRef.current = Date.now();
    const position = nextLessonPosition();
    void enqueueEvent(
      { name: 'lesson_started', module: 'numbers', level, lesson, trigger, position_in_session: position },
      ctx,
    );
  }, [session, q, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  // question_shown — on each new question and each retry.
  useEffect(() => {
    if (!q || !session || !profile) return;
    const key = `${q.id}:${attempt}`;
    if (shownRef.current === key) return;
    shownRef.current = key;
    questionStartRef.current = Date.now();
    void enqueueEvent(
      { name: 'question_shown', module: 'numbers', level, lesson, question_id: q.id, type: q.type, attempt_num: attempt },
      ctx,
    );
  }, [q, attempt, session, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(opt: QuestionValue) {
    if (feedback || !q || !session) return;
    const chosen = scalarValue(opt, lang);
    setPicked(chosen);
    const correct = chosen === answerScalar;
    setFeedback(correct ? 'correct' : 'wrong');
    void enqueueEvent(
      {
        name: 'question_answered',
        module: 'numbers',
        level,
        lesson,
        question_id: q.id,
        correct,
        selected_option: chosen,
        response_time_ms: Date.now() - questionStartRef.current,
        attempt_num: attempt,
      },
      ctx,
    );
  }

  // Persist progress against the Numbers track. Carries a sub-mode breakdown
  // via a `bySubMode` extension on the track object (mirrors the Keyboard
  // pattern in lib/healthy-use neighbouring screens). Phase-1 ProgressByModule
  // doesn't know about `bySubMode`, so the field round-trips locally but the
  // server currently strips it on sync — acceptable until the schema is
  // widened. Arithmetic also writes to the bare `track.levels` for back-compat
  // with older builds that still read it directly.
  async function persistProgress(correctCount: number, ratingStars: number) {
    if (!profile || !session) return;
    const now = new Date().toISOString();
    const track = profile.progress_by_module.numbers as unknown as {
      highest_level: number;
      levels: LevelProgress[];
      bySubMode?: { arithmetic?: { levels: LevelProgress[] }; geometry?: { levels: LevelProgress[] } };
    };

    const subLevels =
      track.bySubMode?.[subMode]?.levels ?? (subMode === 'arithmetic' ? track.levels : []);
    const levels = [...subLevels];
    const idx = levels.findIndex((l) => l.level === level);
    const prevLevel: LevelProgress =
      idx >= 0
        ? levels[idx]!
        : { level, stars: 0, plays: 0, best_time_s: null, last_played: null, seen_question_ids: [], lessons: [] };

    // Per-lesson (lesson = real number, or REVISION_LESSON for the revision).
    const lessons = [...prevLevel.lessons];
    const li = lessons.findIndex((x) => x.lesson === lesson);
    const prevLesson: LessonProgress = li >= 0 ? lessons[li]! : { lesson, stars: 0, plays: 0, last_played: null };
    const updatedLesson: LessonProgress = {
      lesson,
      stars: Math.max(prevLesson.stars, ratingStars),
      plays: prevLesson.plays + 1,
      last_played: now,
    };
    if (li >= 0) lessons[li] = updatedLesson;
    else lessons.push(updatedLesson);

    const seen = Array.from(
      new Set([...prevLevel.seen_question_ids, ...session.questions.map((q) => q.id)]),
    ).slice(-80);
    const updatedLevel: LevelProgress = {
      ...prevLevel,
      level,
      stars: Math.max(prevLevel.stars, ratingStars),
      plays: prevLevel.plays + 1,
      last_played: now,
      seen_question_ids: seen,
      lessons,
    };
    if (idx >= 0) levels[idx] = updatedLevel;
    else levels.push(updatedLevel);

    const bySubMode = {
      ...track.bySubMode,
      [subMode]: { levels },
    };
    const nextTrack = {
      highest_level: Math.max(track.highest_level, level),
      // Bare `levels` mirrors arithmetic for back-compat; geometry lives only
      // under bySubMode.
      levels: subMode === 'arithmetic' ? levels : track.levels,
      bySubMode,
    };
    const progress_by_module = {
      ...profile.progress_by_module,
      numbers: nextTrack as unknown as typeof profile.progress_by_module.numbers,
    };
    const total_stars = profile.total_stars + correctCount;

    // Optimistic: the local profile updates immediately so play never waits on the
    // network. The server push is handled by the resilient sync path — queued in Dexie
    // and replayed last-write-wins, so it survives offline/failure (product §8).
    setProfile({ ...profile, total_stars, progress_by_module });
    await sync.queueProgress({
      profile_id: profile.id,
      updated_at: now,
      progress_by_module,
      total_stars,
    });
  }

  async function next() {
    if (!session) return;
    if (feedback === 'wrong') {
      setFeedback(null);
      setPicked(null);
      setAttempt((a) => a + 1);
      return;
    }
    const newScore = score + 1;
    const isLast = qIdx >= session.questions.length - 1;
    if (isLast) {
      const total = session.questions.length;
      const stars = Math.max(1, Math.min(3, Math.round((newScore / total) * 3)));
      void enqueueEvent(
        { name: 'lesson_completed', module: 'numbers', level, lesson, stars, duration_s: Math.round((Date.now() - lessonStartRef.current) / 1000) },
        ctx,
      );
      await flushEvents();
      await persistProgress(newScore, stars);
      onDone(newScore, total);
      return;
    }
    setScore(newScore);
    setQIdx((i) => i + 1);
    setAttempt(1);
    setFeedback(null);
    setPicked(null);
  }

  const m = MODULES.find((x) => x.id === 'numbers')!;
  const beeExpr: BeeExpression = feedback === 'correct' ? 'correct' : feedback === 'wrong' ? 'encourage' : 'focus';
  const coach = feedback === 'correct' ? t('excellent') : feedback === 'wrong' ? t('youCanDoIt') : t('focus');

  if (isLoading || !session || !q) {
    return (
      <div className="session-screen" data-module="numbers">
        <Chrome lang={lang} setLang={setLang} title={m.label[lang]} onBack={onBack} onHome={onHome} profile={profile} />
        <div className="session-body">
          <div className="skeleton" style={{ height: 200 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="session-screen" data-module="numbers">
      <Chrome lang={lang} setLang={setLang} title={m.label[lang]} onBack={onBack} onHome={onHome} profile={profile} />
      <div className="session-progress">
        <div className="dots" aria-label={`question ${qIdx + 1} of ${session.questions.length}`}>
          {session.questions.map((_, i) => (
            <span key={i} className={`dot ${i < qIdx ? 'done' : i === qIdx ? 'active' : ''}`} />
          ))}
        </div>
        <div className="lesson-label">
          {t('level')} {level} · {isRevision ? t('revision') : `${t('lesson')} ${lesson}`}
        </div>
      </div>
      <div className="session-body">
        <div className="session-stage">
          <div className="session-prompt">
            {(() => {
              // Geometry questions carry a `config.shape` (square, triangle…)
              // that we draw above the textual prompt — see GeometryShape.tsx.
              // Authoring contract: any number question with a shape config
              // gets the SVG; otherwise we keep the existing text-only layout.
              const shapeCfg = subMode === 'geometry' ? shapeFromConfig(q.config) : null;
              if (shapeCfg?.shape) {
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                    <GeometryShape
                      shape={shapeCfg.shape}
                      size={shapeCfg.size ?? 180}
                      fill={shapeCfg.fill}
                      stroke={shapeCfg.stroke}
                    />
                    <div style={{ fontSize: 22, fontWeight: 700, textAlign: 'center', lineHeight: 1.3 }}>
                      {displayValue(q.prompt, lang)}
                    </div>
                  </div>
                );
              }
              if (level === 1) {
                return (
                  <div style={{ fontSize: 32, fontWeight: 800, textAlign: 'center', lineHeight: 1.3 }}>
                    {displayValue(q.prompt, lang)}
                  </div>
                );
              }
              return <span className="big-number">{displayValue(q.prompt, lang)}</span>;
            })()}
          </div>
          {feedback ? (
            <div className={`feedback-strip ${feedback === 'wrong' ? 'retry' : ''}`}>
              <Bee size={56} expression={feedback === 'correct' ? 'correct' : 'encourage'} wings />
              <div style={{ flex: 1 }}>{feedback === 'correct' ? t('correctMsg') : t('tryAgainMsg')}</div>
              <button className="btn" onClick={() => void next()}>
                {feedback === 'correct' ? t('next') : t('retry')} <Icon name="arrow-right" />
              </button>
            </div>
          ) : (
            <div className="session-answers">
              {options.map((opt, i) => {
                const chosen = scalarValue(opt, lang);
                const state = picked === chosen ? (chosen === answerScalar ? 'correct' : 'wrong') : '';
                const label = displayValue(opt, lang);
                // In Geometry, an option whose label matches a known shape
                // (FR or EN, e.g. "Carré" / "Square") is drawn as an SVG —
                // so "Which shape is a square?" actually shows the three
                // shapes to compare instead of being a reading test. Numeric
                // / non-shape answers (e.g. "how many sides?") fall back to
                // the textual label.
                const shape = subMode === 'geometry' ? shapeFromLabel(label) : null;
                return (
                  <button
                    key={i}
                    className={`answer-btn ${state}`}
                    onClick={() => pick(opt)}
                    aria-label={label}
                  >
                    {shape ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <GeometryShape shape={shape} size={84} />
                      </span>
                    ) : (
                      label
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="session-aside">
          <Bee size={120} expression={beeExpr} wings bob />
          <div className="bee-coach-text">{coach}</div>
        </div>
      </div>
    </div>
  );
}
