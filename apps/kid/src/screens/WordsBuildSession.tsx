import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { LevelProgress, LessonProgress } from '@gabee/types';
import { Bee, type BeeExpression } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { MODULES } from '../content/modules';
import { api } from '../lib/api';
import { enqueueEvent, flushEvents } from '../lib/events';
import { sync } from '../lib/sync';
import { useStore } from '../store';
import { shuffle, displayValue } from '../lib/util';

const TOTAL = 7;

// Words/Build the sentence session: tap shuffled word tiles into the right order
// to reconstruct the target sentence (product §4.2). Mirrors WordsPictureSession
// but the mechanic is a tap-based word cloud builder (no drag-and-drop). Reads/
// writes the per-language Words/Build track (language-DEPENDENT — §7.3).
export function WordsBuildSession({
  level,
  lesson,
  isRevision,
  trigger,
  onDone,
  onHome,
  onBack,
}: {
  level: number;
  lesson: number;
  isRevision: boolean;
  trigger: 'new' | 'replay';
  onDone: (score: number, total: number) => void;
  onHome: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const play = useStore((s) => s.play);
  const nextLessonPosition = useStore((s) => s.nextLessonPosition);

  const { data: bundle, isLoading } = useQuery({
    queryKey: ['bundle', 'words'],
    queryFn: () => api.getBundle('words'),
  });

  const session = useMemo(() => {
    if (!bundle) return null;
    const pool = bundle.questions.filter(
      (q) =>
        q.sub_mode === 'build' &&
        q.level === level &&
        (isRevision || q.lesson === lesson),
    );
    if (pool.length === 0) return null;
    return { questions: shuffle(pool).slice(0, Math.min(TOTAL, pool.length)) };
  }, [bundle, level, lesson, isRevision]);

  const [qIdx, setQIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [attempt, setAttempt] = useState(1);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  // Selected indices reference positions in the stable shuffled `tiles` array; tiles
  // not in `selection` form the bank. Indices (not strings) so duplicate words still
  // address unique tiles.
  const [selection, setSelection] = useState<number[]>([]);

  const startedRef = useRef(false);
  const shownRef = useRef<string | null>(null);
  const questionStartRef = useRef(Date.now());
  const lessonStartRef = useRef(Date.now());
  // Process-rich counters for the `sentence_build` event (product §9.2).
  const placementsRef = useRef(0);
  const removalsRef = useRef(0);
  const wrongPositionsRef = useRef<Set<number>>(new Set());
  const firstTryRef = useRef(true);

  const q = session?.questions[qIdx];
  const ctx = { profileId: profile?.id ?? null, sessionId: play?.id ?? null };

  // Target words come from the seed `answer` (no trailing punctuation) split on
  // whitespace; `prompt` carries the punctuated reference sentence used as the
  // visible goal hint.
  const targetWords = useMemo<string[]>(() => {
    if (!q) return [];
    const s = displayValue(q.answer, lang);
    return s.trim().split(/\s+/);
  }, [q, lang]);

  // Stable shuffled tile order for this question+attempt (re-shuffled on retry).
  const tiles = useMemo<string[]>(() => shuffle(targetWords), [q?.id, attempt, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!session || !q || startedRef.current || !profile) return;
    startedRef.current = true;
    lessonStartRef.current = Date.now();
    const position = nextLessonPosition();
    void enqueueEvent(
      {
        name: 'lesson_started',
        module: 'words',
        sub_mode: 'build',
        level,
        lesson,
        trigger,
        position_in_session: position,
      },
      ctx,
    );
  }, [session, q, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!q || !session || !profile) return;
    const key = `${q.id}:${attempt}`;
    if (shownRef.current === key) return;
    shownRef.current = key;
    questionStartRef.current = Date.now();
    // Reset per-attempt build telemetry.
    placementsRef.current = 0;
    removalsRef.current = 0;
    if (attempt === 1) {
      wrongPositionsRef.current = new Set();
      firstTryRef.current = true;
    }
    void enqueueEvent(
      {
        name: 'question_shown',
        module: 'words',
        sub_mode: 'build',
        level,
        lesson,
        question_id: q.id,
        type: q.type,
        attempt_num: attempt,
      },
      ctx,
    );
  }, [q, attempt, session, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-check when the answer row is full.
  useEffect(() => {
    if (!q || !session || feedback) return;
    if (selection.length !== targetWords.length || targetWords.length === 0) return;
    const chosenWords = selection.map((i) => tiles[i]!);
    const correct = chosenWords.every((w, i) => w === targetWords[i]);
    if (!correct) {
      firstTryRef.current = false;
      chosenWords.forEach((w, i) => {
        if (w !== targetWords[i]) wrongPositionsRef.current.add(i);
      });
    }
    setFeedback(correct ? 'correct' : 'wrong');
    const responseMs = Date.now() - questionStartRef.current;
    void enqueueEvent(
      {
        name: 'question_answered',
        module: 'words',
        sub_mode: 'build',
        level,
        lesson,
        question_id: q.id,
        correct,
        selected_option: chosenWords.join(' '),
        response_time_ms: responseMs,
        attempt_num: attempt,
      },
      ctx,
    );
    void enqueueEvent(
      {
        name: 'sentence_build',
        level,
        lesson,
        question_id: q.id,
        target_sentence: targetWords.join(' '),
        placements: placementsRef.current,
        removals: removalsRef.current,
        first_try_success: correct && firstTryRef.current,
        wrong_positions: Array.from(wrongPositionsRef.current).sort((a, b) => a - b),
        duration_ms: responseMs,
      },
      ctx,
    );
  }, [selection, targetWords, tiles, q, session, feedback, attempt, level, lesson]); // eslint-disable-line react-hooks/exhaustive-deps

  function tapBank(idx: number) {
    if (feedback) return;
    if (selection.includes(idx)) return;
    placementsRef.current += 1;
    setSelection((cur) => [...cur, idx]);
  }

  function tapAnswer(slot: number) {
    if (feedback) return;
    removalsRef.current += 1;
    setSelection((cur) => cur.filter((_, i) => i !== slot));
  }

  // Persist progress to the per-language Words/Build track (product §7.3). Optimistic
  // local update + queue for sync (last-write-wins, survives offline).
  async function persistProgress(correctCount: number, ratingStars: number) {
    if (!profile || !session) return;
    const now = new Date().toISOString();
    const trackPair = profile.progress_by_module_per_language.words_build;
    const track = trackPair[lang];
    const levels = [...track.levels];
    const idx = levels.findIndex((l) => l.level === level);
    const prevLevel: LevelProgress =
      idx >= 0
        ? levels[idx]!
        : { level, stars: 0, plays: 0, best_time_s: null, last_played: null, seen_question_ids: [], lessons: [] };

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

    const nextTrack = { highest_level: Math.max(track.highest_level, level), levels };
    const progress_by_module_per_language = {
      ...profile.progress_by_module_per_language,
      words_build: { ...trackPair, [lang]: nextTrack },
    };
    const total_stars = profile.total_stars + correctCount;

    setProfile({ ...profile, total_stars, progress_by_module_per_language });
    await sync.queueProgress({
      profile_id: profile.id,
      updated_at: now,
      progress_by_module: profile.progress_by_module,
      progress_by_module_per_language,
      total_stars,
    });
  }

  async function next() {
    if (!session) return;
    if (feedback === 'wrong') {
      setFeedback(null);
      setSelection([]);
      setAttempt((a) => a + 1);
      return;
    }
    const newScore = score + 1;
    const isLast = qIdx >= session.questions.length - 1;
    if (isLast) {
      const total = session.questions.length;
      const stars = Math.max(1, Math.min(3, Math.round((newScore / total) * 3)));
      void enqueueEvent(
        {
          name: 'lesson_completed',
          module: 'words',
          sub_mode: 'build',
          level,
          lesson,
          stars,
          duration_s: Math.round((Date.now() - lessonStartRef.current) / 1000),
        },
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
    setSelection([]);
  }

  const m = MODULES.find((x) => x.id === 'words')!;
  const beeExpr: BeeExpression = feedback === 'correct' ? 'correct' : feedback === 'wrong' ? 'encourage' : 'focus';
  const coach = feedback === 'correct' ? t('excellent') : feedback === 'wrong' ? t('youCanDoIt') : t('focus');

  if (isLoading || !session || !q) {
    return (
      <div className="session-screen" data-module="words">
        <Chrome lang={lang} setLang={setLang} title={m.label[lang]} onBack={onBack} onHome={onHome} profile={profile} />
        <div className="session-body">
          <div className="skeleton" style={{ height: 200 }} />
        </div>
      </div>
    );
  }

  const selectedSet = new Set(selection);
  const answerRowStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    minHeight: 64,
    padding: 12,
    borderRadius: 16,
    background: 'rgba(255,255,255,0.55)',
    border: '2px dashed rgba(0,0,0,0.15)',
    marginBottom: 18,
  };
  const bankRowStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    padding: 8,
  };
  const tileStyle: React.CSSProperties = {
    fontSize: 22,
    padding: '10px 16px',
    borderRadius: 12,
    border: '2px solid rgba(0,0,0,0.12)',
    background: '#fff',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: 600,
  };
  const placeholderStyle: React.CSSProperties = {
    ...tileStyle,
    background: 'transparent',
    border: '2px dashed rgba(0,0,0,0.15)',
    color: 'rgba(0,0,0,0.25)',
    cursor: 'default',
  };

  return (
    <div className="session-screen" data-module="words">
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
            {/* Goal sentence (punctuated) shown as the target for the child to reconstruct. */}
            <span style={{ fontSize: 30, lineHeight: 1.2, fontWeight: 600 }}>
              {displayValue(q.prompt, lang)}
            </span>
          </div>
          <div style={answerRowStyle} aria-label="answer row">
            {Array.from({ length: targetWords.length }).map((_, slot) => {
              const tileIdx = selection[slot];
              if (tileIdx === undefined) {
                return <span key={slot} style={placeholderStyle}>·</span>;
              }
              return (
                <button
                  key={slot}
                  style={tileStyle}
                  onClick={() => tapAnswer(slot)}
                  disabled={!!feedback}
                  aria-label={`remove ${tiles[tileIdx]}`}
                >
                  {tiles[tileIdx]}
                </button>
              );
            })}
          </div>
          <div style={bankRowStyle} aria-label="word bank">
            {tiles.map((w, i) => {
              const used = selectedSet.has(i);
              return (
                <button
                  key={i}
                  style={{
                    ...tileStyle,
                    visibility: used ? 'hidden' : 'visible',
                  }}
                  onClick={() => tapBank(i)}
                  disabled={used || !!feedback}
                  aria-label={`pick ${w}`}
                >
                  {w}
                </button>
              );
            })}
          </div>
          {feedback && (
            <div className={`feedback-strip ${feedback === 'wrong' ? 'retry' : ''}`}>
              <Bee size={56} expression={feedback === 'correct' ? 'correct' : 'encourage'} wings />
              <div style={{ flex: 1 }}>{feedback === 'correct' ? t('correctMsg') : t('tryAgainMsg')}</div>
              <button className="btn" onClick={() => void next()}>
                {feedback === 'correct' ? t('next') : t('retry')} <Icon name="arrow-right" />
              </button>
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
