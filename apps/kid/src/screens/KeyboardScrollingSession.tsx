import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { LevelProgress, LessonProgress, QuestionRecord } from '@gabee/types';
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

// Per-level scroll speed in px/sec. The L8 starter speed is slow enough for a
// first-time typist (≈4s to cross a 240px word on a standard viewport); L10
// "mastery" doubles it. Mirrors product §4.3 / §9.2.
const SCROLL_SPEED_BY_LEVEL: Record<number, number> = { 8: 60, 9: 80, 10: 120 };

export function KeyboardScrollingSession({
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
    queryKey: ['bundle', 'keyboard'],
    queryFn: () => api.getBundle('keyboard'),
  });

  const session = useMemo(() => {
    if (!bundle) return null;
    const pool = bundle.questions.filter(
      (q) =>
        q.sub_mode === 'scrolling' &&
        q.level === level &&
        (isRevision || q.lesson === lesson),
    );
    if (pool.length === 0) return null;
    return { questions: shuffle(pool).slice(0, Math.min(TOTAL, pool.length)) };
  }, [bundle, level, lesson, isRevision]);

  const speedPxPerS = SCROLL_SPEED_BY_LEVEL[level] ?? 60;

  const [qIdx, setQIdx] = useState(0);
  const [typedLen, setTypedLen] = useState(0);
  const [flash, setFlash] = useState<'ok' | 'err' | null>(null);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  // x = pixel offset of the LEFT edge of the scrolling text. Starts off-stage to
  // the right (= viewport width) and decreases each frame; word "scrolls off"
  // when x < -textWidth.
  const [x, setX] = useState(0);

  const startedRef = useRef(false);
  const shownRef = useRef<string | null>(null);
  const lessonStartRef = useRef(Date.now());
  const wordStartRef = useRef(Date.now());
  const lastKeyTsRef = useRef(Date.now());
  const firstKeyTsRef = useRef<number | null>(null);
  const wordKeystrokesRef = useRef(0);
  const wordErrorsRef = useRef(0);
  const wordErrorCharsRef = useRef<{ expected: string; typed: string }[]>([]);
  const usedBackspaceRef = useRef(false);
  const questionScoreRef = useRef(0);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);

  const q = session?.questions[qIdx];
  const ctx = { profileId: profile?.id ?? null, sessionId: play?.id ?? null };
  const target = useMemo(() => (q ? displayValue(q.prompt, lang) : ''), [q, lang]);

  // lesson_started — once when session is ready.
  useEffect(() => {
    if (!session || !q || startedRef.current || !profile) return;
    startedRef.current = true;
    lessonStartRef.current = Date.now();
    const position = nextLessonPosition();
    void enqueueEvent(
      { name: 'lesson_started', module: 'keyboard', level, lesson, trigger, position_in_session: position },
      ctx,
    );
  }, [session, q, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  // question_shown — reset per-question state + start scroll position off-stage right.
  useEffect(() => {
    if (!q || !session || !profile) return;
    const key = `${q.id}`;
    if (shownRef.current === key) return;
    shownRef.current = key;
    setTypedLen(0);
    setFlash(null);
    setFeedback(null);
    wordStartRef.current = Date.now();
    lastKeyTsRef.current = Date.now();
    firstKeyTsRef.current = null;
    wordKeystrokesRef.current = 0;
    wordErrorsRef.current = 0;
    wordErrorCharsRef.current = [];
    usedBackspaceRef.current = false;
    questionScoreRef.current = 0;
    // Spawn the word at the right edge of its track.
    const trackW = trackRef.current?.getBoundingClientRect().width ?? 800;
    setX(trackW);
    void enqueueEvent(
      { name: 'question_shown', module: 'keyboard', level, lesson, question_id: q.id, type: q.type, attempt_num: 1 },
      ctx,
    );
  }, [q, session, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  async function persistProgress(correctCount: number, ratingStars: number) {
    if (!profile || !session) return;
    const now = new Date().toISOString();
    const track = profile.progress_by_module.keyboard as unknown as {
      highest_level: number;
      levels: LevelProgress[];
      bySubMode?: { static?: { levels: LevelProgress[] }; scrolling?: { levels: LevelProgress[] } };
    };

    const subLevels = track.bySubMode?.scrolling?.levels ?? [];
    const levels = [...subLevels];
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

    const nextTrack = {
      highest_level: Math.max(track.highest_level, level),
      levels: track.levels,
      bySubMode: {
        ...track.bySubMode,
        scrolling: { levels },
      },
    };
    const progress_by_module = {
      ...profile.progress_by_module,
      keyboard: nextTrack as unknown as typeof profile.progress_by_module.keyboard,
    };
    const total_stars = profile.total_stars + correctCount;
    setProfile({ ...profile, total_stars, progress_by_module });
    await sync.queueProgress({
      profile_id: profile.id,
      updated_at: now,
      progress_by_module,
      total_stars,
    });
  }

  function fireWordCompleted(qq: QuestionRecord, completedInTime: boolean) {
    const now = Date.now();
    void enqueueEvent(
      {
        name: 'typing_word_completed',
        level,
        lesson,
        question_id: qq.id,
        target_text: target,
        mode: 'scrolling',
        total_keystrokes: wordKeystrokesRef.current,
        error_count: wordErrorsRef.current,
        error_chars: wordErrorCharsRef.current,
        used_backspace: usedBackspaceRef.current,
        time_to_first_key_ms: Math.max(0, (firstKeyTsRef.current ?? now) - wordStartRef.current),
        duration_ms: Math.max(0, now - wordStartRef.current),
        completed_before_timeout: completedInTime,
      },
      ctx,
    );
  }

  async function finishLesson(finalScore: number) {
    if (!session) return;
    const total = session.questions.length;
    const stars = Math.max(1, Math.min(3, Math.round((finalScore / total) * 3)));
    void enqueueEvent(
      { name: 'lesson_completed', module: 'keyboard', level, lesson, stars, duration_s: Math.round((Date.now() - lessonStartRef.current) / 1000) },
      ctx,
    );
    await flushEvents();
    await persistProgress(finalScore, stars);
    onDone(finalScore, total);
  }

  async function advance(success: boolean) {
    if (!session || !q) return;
    fireWordCompleted(q, success);
    const inc = success ? 1 : 0;
    const newScore = score + inc;
    const isLast = qIdx >= session.questions.length - 1;
    setFeedback(success ? 'correct' : 'wrong');
    setTimeout(async () => {
      if (isLast) {
        await finishLesson(newScore);
        return;
      }
      setScore(newScore);
      setQIdx((i) => i + 1);
    }, 600);
  }

  // RAF scroll loop — moves `x` leftwards at the configured speed; when the
  // word slides past the left edge, treat as a miss and advance.
  useEffect(() => {
    if (!q || !session || feedback) return;
    function frame(ts: number) {
      const prev = lastFrameRef.current ?? ts;
      const dt = (ts - prev) / 1000;
      lastFrameRef.current = ts;
      setX((cur) => {
        const next = cur - speedPxPerS * dt;
        const textW = textRef.current?.getBoundingClientRect().width ?? 200;
        if (next < -textW) {
          // Off-stage — schedule a miss for next tick (can't call setState during render).
          queueMicrotask(() => void advance(false));
          return next;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(frame);
    }
    lastFrameRef.current = null;
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [q, session, feedback, speedPxPerS]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard listener — match next char in target; finishing the word in time = success.
  useEffect(() => {
    if (!q || !session || feedback) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key;
      if (key === 'Backspace') {
        usedBackspaceRef.current = true;
        e.preventDefault();
        return;
      }
      if (key.length !== 1) return;
      if (!q) return;
      e.preventDefault();
      const now = Date.now();
      const pos = typedLen;
      if (pos >= target.length) return;
      const expected = target[pos]!;
      const correct = key.toLowerCase() === expected.toLowerCase();
      const since = now - lastKeyTsRef.current;
      lastKeyTsRef.current = now;
      if (firstKeyTsRef.current === null) firstKeyTsRef.current = now;
      wordKeystrokesRef.current += 1;
      void enqueueEvent(
        {
          name: 'typing_keystroke',
          level,
          lesson,
          question_id: q.id,
          expected_char: expected,
          typed_char: key,
          correct,
          time_since_prev_ms: since,
          position_in_word: pos,
        },
        ctx,
      );
      if (!correct) {
        wordErrorsRef.current += 1;
        wordErrorCharsRef.current.push({ expected, typed: key });
        setFlash('err');
        setTimeout(() => setFlash(null), 140);
        return;
      }
      setFlash('ok');
      setTimeout(() => setFlash(null), 100);
      const nextLen = pos + 1;
      setTypedLen(nextLen);
      if (nextLen === target.length) {
        questionScoreRef.current = 1;
        void advance(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [q, session, feedback, typedLen, target]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = MODULES.find((x) => x.id === 'keyboard')!;
  const beeExpr: BeeExpression = feedback === 'correct' ? 'correct' : feedback === 'wrong' ? 'encourage' : flash === 'err' ? 'encourage' : 'focus';
  const coach = feedback === 'correct' ? t('excellent') : feedback === 'wrong' ? t('youCanDoIt') : flash === 'err' ? t('youCanDoIt') : t('focus');

  if (isLoading || !session || !q) {
    return (
      <div className="session-screen" data-module="keyboard">
        <Chrome lang={lang} setLang={setLang} title={m.label[lang]} onBack={onBack} onHome={onHome} profile={profile} />
        <div className="session-body">
          <div className="skeleton" style={{ height: 200 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="session-screen" data-module="keyboard">
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
            {/* Column wrapper so the track + helper text stack vertically. The
                outer `.session-prompt` defaults to flex-direction row, which
                would lay them side-by-side. */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 12, width: '100%' }}>
            {/* Scrolling track — the word slides from right (off-stage) to left.
                Tape avant qu'il ne disparaisse / Type before it scrolls off. */}
            <div
              ref={trackRef}
              style={{
                position: 'relative',
                width: '100%',
                height: 96,
                overflow: 'hidden',
                background: '#FFFBEC',
                borderRadius: 16,
                border: '2px solid #FCD34D',
              }}
            >
              <div
                ref={textRef}
                style={{
                  position: 'absolute',
                  top: '50%',
                  transform: `translate(${x}px, -50%)`,
                  whiteSpace: 'nowrap',
                  fontSize: 56,
                  fontWeight: 800,
                  letterSpacing: 4,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  lineHeight: 1,
                }}
              >
                {target.split('').map((ch, i) => {
                  const isTyped = i < typedLen;
                  const isCurrent = i === typedLen;
                  const bg = isCurrent
                    ? flash === 'ok'
                      ? 'rgba(110, 231, 183, 0.55)'
                      : flash === 'err'
                        ? 'rgba(252, 165, 165, 0.6)'
                        : 'transparent'
                    : 'transparent';
                  return (
                    <span
                      key={i}
                      style={{
                        display: 'inline-block',
                        padding: '2px 6px',
                        borderRadius: 6,
                        background: bg,
                        color: isTyped ? '#94a3b8' : '#0f172a',
                        borderBottom: isCurrent ? '4px solid #34d399' : '4px solid transparent',
                      }}
                    >
                      {ch === ' ' ? ' ' : ch}
                    </span>
                  );
                })}
              </div>
            </div>
            <div style={{ fontSize: 14, color: '#64748b', textAlign: 'center' }}>
              {lang === 'fr' ? 'Tape avant que ça disparaisse !' : 'Type before it scrolls off!'}
            </div>
            </div>
          </div>
          {feedback ? (
            <div className={`feedback-strip ${feedback === 'wrong' ? 'retry' : ''}`}>
              <Bee size={56} expression={feedback === 'correct' ? 'correct' : 'encourage'} wings />
              <div style={{ flex: 1 }}>{feedback === 'correct' ? t('correctMsg') : t('tryAgainMsg')}</div>
              <Icon name="arrow-right" />
            </div>
          ) : null}
        </div>
        <div className="session-aside">
          <Bee size={120} expression={beeExpr} wings bob />
          <div className="bee-coach-text">{coach}</div>
        </div>
      </div>
    </div>
  );
}
