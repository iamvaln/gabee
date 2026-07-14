import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { QuestionValue, LevelProgress, LessonProgress } from '@gabee/types';
import { Bee, type BeeExpression } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { SessionHeader } from '../components/SessionHeader';
import { Icon } from '../components/Icon';
import { MODULES } from '../content/modules';
import { api } from '../lib/api';
import { enqueueEvent, flushEvents } from '../lib/events';
import { sync } from '../lib/sync';
import { useStore } from '../store';
import { selectSession } from '../lib/selectSession';
import { getSeen, markSeen } from '../lib/seen';
import { useResumableProgress, sessionResumeKey } from '../lib/sessionResume';
import { ageFromBirthDate } from '../lib/age';
import { shuffle, displayValue, scalarValue, distractorValue } from '../lib/util';
import { HintLine } from '../components/HintLine';
import { SessionLoader } from '../components/SessionLoader';
import { SessionError } from '../components/SessionError';
import { bundleLoadFailed, isOffline } from '../lib/bundleLoad';

const TOTAL = 7;
// Seed prompts mark the blank with this token (e.g. "The ___ eats an apple.").
const BLANK_TOKEN = '___';

// Words/Fill session: a sentence with one missing word → pick the right word from 3
// options (product §4.2, L1→L10: Subject → Verb → Object → Adverb). Same MCQ-word
// mechanic as Words/Picture but the prompt is text with a styled blank, not an emoji.
export function WordsFillSession({
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

  const { data: bundle, isLoading, isError, refetch } = useQuery({
    queryKey: ['bundle', 'words'],
    queryFn: () => api.getBundle('words'),
  });

  const session = useMemo(() => {
    if (!bundle) return null;
    const pool = bundle.questions.filter((q) => q.sub_mode === 'fill-blank' && q.level === level);
    if (pool.length === 0) return null;
    const seen = getSeen(profile?.id ?? null, 'words:fill-blank', level);
    return { questions: selectSession(pool, ageFromBirthDate(profile?.birth_date ?? null), TOTAL, seen) };
  }, [bundle, level, lesson, isRevision]);

  const resumeKey = sessionResumeKey(profile?.id ?? null, 'words:fill-blank', level, lesson);
  const { qIdx, setQIdx, score, setScore, clear: clearResume } = useResumableProgress(resumeKey);
  const [attempt, setAttempt] = useState(1);
  const [picked, setPicked] = useState<string | number | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);

  const startedRef = useRef(false);
  const shownRef = useRef<string | null>(null);
  const questionStartRef = useRef(Date.now());
  const lessonStartRef = useRef(Date.now());

  const q = session?.questions[qIdx];
  const ctx = { profileId: profile?.id ?? null, sessionId: play?.id ?? null };
  const answerScalar = q ? scalarValue(q.answer as QuestionValue, lang) : null;
  const options = useMemo<QuestionValue[]>(
    () => (q ? shuffle([q.answer as QuestionValue, ...q.distractors.map(distractorValue)]) : []),
    [q],
  );

  // Split the localized sentence around the blank token so we can render it as
  // text + pill + text (the answer word slot is the highlighted gap).
  const promptParts = useMemo(() => {
    if (!q) return null;
    // The sentence-with-blank lives in config.sentence (prompt is the instruction).
    const cfg = q.config as { sentence?: import('@gabee/types').QuestionValue } | undefined;
    const text = String(displayValue(cfg?.sentence ?? q.prompt, lang));
    const idx = text.indexOf(BLANK_TOKEN);
    if (idx < 0) return { before: text, after: '' };
    return { before: text.slice(0, idx), after: text.slice(idx + BLANK_TOKEN.length) };
  }, [q, lang]);

  useEffect(() => {
    if (!session || !q || startedRef.current || !profile) return;
    startedRef.current = true;
    lessonStartRef.current = Date.now();
    const position = nextLessonPosition();
    void enqueueEvent(
      { name: 'lesson_started', module: 'words', sub_mode: 'fill-blank', level, lesson, trigger, position_in_session: position },
      ctx,
    );
  }, [session, q, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!q || !session || !profile) return;
    const key = `${q.id}:${attempt}`;
    if (shownRef.current === key) return;
    shownRef.current = key;
    questionStartRef.current = Date.now();
    void enqueueEvent(
      { name: 'question_shown', module: 'words', sub_mode: 'fill-blank', level, lesson, question_id: q.id, type: q.type, attempt_num: attempt },
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
        module: 'words',
        sub_mode: 'fill-blank',
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

  // Persist progress to the per-language Words/Fill track (product §7.3). Optimistic
  // local update + queue for sync (last-write-wins, survives offline).
  async function persistProgress(correctCount: number, ratingStars: number) {
    if (!profile || !session) return;
    const now = new Date().toISOString();
    const trackPair = profile.progress_by_module_per_language.words_fill;
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

    markSeen(profile.id, 'words:fill-blank', level, session.questions.map((q) => q.id));
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
      words_fill: { ...trackPair, [lang]: nextTrack },
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

  // Enter advances past the feedback strip — same as tapping "Next".
  useEffect(() => {
    if (!feedback) return;
    const onEnter = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void next();
      }
    };
    window.addEventListener('keydown', onEnter);
    return () => window.removeEventListener('keydown', onEnter);
  }, [feedback]); // eslint-disable-line react-hooks/exhaustive-deps

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
        { name: 'lesson_completed', module: 'words', sub_mode: 'fill-blank', level, lesson, stars, duration_s: Math.round((Date.now() - lessonStartRef.current) / 1000) },
        ctx,
      );
      await flushEvents();
      await persistProgress(newScore, stars);
      clearResume();
      onDone(newScore, total);
      return;
    }
    setScore(newScore);
    setQIdx((i) => i + 1);
    setAttempt(1);
    setFeedback(null);
    setPicked(null);
  }

  const m = MODULES.find((x) => x.id === 'words')!;
  const beeExpr: BeeExpression = feedback === 'correct' ? 'correct' : feedback === 'wrong' ? 'encourage' : 'focus';
  const coach = feedback === 'correct' ? t('excellent') : feedback === 'wrong' ? t('youCanDoIt') : t('focus');

  const shell = { module: m.id, title: m.label[lang], lang, setLang, onBack, onHome, profile };
  if (bundleLoadFailed({ isLoading, isError, hasBundle: !!bundle, offline: isOffline() })) {
    return <SessionError {...shell} onRetry={() => void refetch()} level={level} lesson={lesson} />;
  }
  if (isLoading || !session || !q || !promptParts) {
    return <SessionLoader {...shell} />;
  }

  // While picked-but-correct, fill the blank with the chosen word so kids see the
  // completed sentence before advancing. On wrong, keep the blank visible.
  const showFilled = feedback === 'correct' && picked != null;

  return (
    <div className="session-screen" data-module="words">
      <Chrome lang={lang} setLang={setLang} title={m.label[lang]} onBack={onBack} onHome={onHome} profile={profile} />
      <SessionHeader
        total={session.questions.length}
        current={qIdx}
        trigger={trigger}
        level={level}
        lesson={lesson}
        isRevision={isRevision}
      />
      <div className="session-body">
        <div className="session-stage">
          <div className="session-prompt" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-2)' }}>{displayValue(q.prompt, lang)}</span>
            {/* Fill: render config.sentence as text with the missing word as a styled
                pill so the gap is visually obvious. Sized for sentence reading, not emoji. */}
            <span style={{ fontSize: 40, lineHeight: 1.35, fontWeight: 600, display: 'inline-block', maxWidth: 760, textAlign: 'center' }}>
              <span>{promptParts.before}</span>
              <span
                style={{
                  display: 'inline-block',
                  minWidth: 110,
                  padding: '2px 16px',
                  margin: '0 6px',
                  borderRadius: 999,
                  background: showFilled ? 'rgba(34,197,94,0.18)' : 'rgba(0,0,0,0.06)',
                  borderBottom: '3px solid currentColor',
                  textAlign: 'center',
                }}
                aria-label={t('blank') ?? 'blank'}
              >
                {showFilled ? String(picked) : ' '}
              </span>
              <span>{promptParts.after}</span>
            </span>
          </div>
          {feedback ? (
            <div className={`feedback-strip ${feedback === 'wrong' ? 'retry' : ''}`}>
              <Bee size={56} expression={feedback === 'correct' ? 'correct' : 'encourage'} wings />
              <div style={{ flex: 1 }}><HintLine feedback={feedback} hint={q.hint} lang={lang} /></div>
              <button className="btn" onClick={() => void next()}>
                {feedback === 'correct' ? t('next') : t('retry')} <Icon name="arrow-right" />
              </button>
            </div>
          ) : (
            <div className="session-answers">
              {options.map((opt, i) => {
                const chosen = scalarValue(opt, lang);
                const state = picked === chosen ? (chosen === answerScalar ? 'correct' : 'wrong') : '';
                return (
                  <button key={i} className={`answer-btn ${state}`} onClick={() => pick(opt)}>
                    {displayValue(opt, lang)}
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
