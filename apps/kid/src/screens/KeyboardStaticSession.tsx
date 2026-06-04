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
import { HintLine } from '../components/HintLine';

const TOTAL = 7;

// Keyboard / Static typing session (product §4.3, §9.2). The kid types a calm,
// non-scrolling target letter-by-letter; we track per-keystroke timing and
// per-word completion so the parent dashboard can see *process* (errors, speed,
// hesitations), not just a final score. Mirrors NumbersSession for lifecycle
// (lesson_started → question_shown → … → lesson_completed) and reuses the
// Keyboard track persistence shape (see staticLevels() in the level/lesson maps).
export function KeyboardStaticSession({
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
        q.sub_mode === 'static' &&
        q.level === level &&
        (isRevision || q.lesson === lesson),
    );
    if (pool.length === 0) return null;
    return { questions: shuffle(pool).slice(0, Math.min(TOTAL, pool.length)) };
  }, [bundle, level, lesson, isRevision]);

  const [qIdx, setQIdx] = useState(0);
  // Per-question state.
  const [typedLen, setTypedLen] = useState(0);
  const [flash, setFlash] = useState<'ok' | 'err' | null>(null);
  // Lesson-wide score = sum of correctly-typed words across all 7 prompts.
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);

  // Refs (timers + dedupe + per-word telemetry buffers).
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
  // Correctly-typed words contributed by the current question (bumped on space
  // boundary AND on final letter), used to decide stars at lesson end.
  const questionScoreRef = useRef(0);

  const q = session?.questions[qIdx];
  const ctx = { profileId: profile?.id ?? null, sessionId: play?.id ?? null };

  // The target string for the current question, rendered in the active language.
  const target = useMemo(() => (q ? displayValue(q.prompt, lang) : ''), [q, lang]);
  // Word boundaries: indices of every char that closes a word (space chars + final).
  const wordBounds = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < target.length; i++) if (target[i] === ' ') out.push(i);
    if (target.length > 0) out.push(target.length - 1);
    return out;
  }, [target]);

  // lesson_started — once when the session is ready.
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

  // question_shown — on each new prompt; resets per-question typing state.
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
    void enqueueEvent(
      { name: 'question_shown', module: 'keyboard', level, lesson, question_id: q.id, type: q.type, attempt_num: 1 },
      ctx,
    );
  }, [q, session, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist progress against the Keyboard track. Phase 1 carries a sub-mode
  // breakdown via a `bySubMode` extension on the track object (see staticLevels
  // in the level/lesson maps). The Phase-1 ProgressByModule zod schema doesn't
  // know about `bySubMode`, so the field round-trips locally but the server
  // currently strips it on sync — acceptable until the schema is widened.
  // TODO(phase-2): widen TrackProgressSchema with an optional bySubMode shape.
  async function persistProgress(correctCount: number, ratingStars: number) {
    if (!profile || !session) return;
    const now = new Date().toISOString();
    const track = profile.progress_by_module.keyboard as unknown as {
      highest_level: number;
      levels: LevelProgress[];
      bySubMode?: { static?: { levels: LevelProgress[] }; scrolling?: { levels: LevelProgress[] } };
    };

    const subLevels = track.bySubMode?.static?.levels ?? [];
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
        static: { levels },
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

  // Emit a typing_word_completed payload for the just-finished word slice.
  function fireWordCompleted(qq: QuestionRecord, wordText: string) {
    const now = Date.now();
    void enqueueEvent(
      {
        name: 'typing_word_completed',
        level,
        lesson,
        question_id: qq.id,
        target_text: wordText,
        mode: 'static',
        total_keystrokes: wordKeystrokesRef.current,
        error_count: wordErrorsRef.current,
        error_chars: wordErrorCharsRef.current,
        used_backspace: usedBackspaceRef.current,
        time_to_first_key_ms: Math.max(0, (firstKeyTsRef.current ?? now) - wordStartRef.current),
        duration_ms: Math.max(0, now - wordStartRef.current),
      },
      ctx,
    );
    // Reset word-scoped buffers; the next word starts fresh.
    wordStartRef.current = now;
    firstKeyTsRef.current = null;
    wordKeystrokesRef.current = 0;
    wordErrorsRef.current = 0;
    wordErrorCharsRef.current = [];
    usedBackspaceRef.current = false;
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

  // Advance to the next prompt (or end the lesson). Triggered by the user
  // tapping "Next" after the per-question feedback strip.
  async function next() {
    if (!session) return;
    const inc = questionScoreRef.current > 0 ? 1 : 0;
    const newScore = score + inc;
    const isLast = qIdx >= session.questions.length - 1;
    if (isLast) {
      await finishLesson(newScore);
      return;
    }
    setScore(newScore);
    setQIdx((i) => i + 1);
  }

  // Keyboard handler — single global listener while the prompt is active.
  useEffect(() => {
    if (!q || !session || feedback) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key;
      // Backspace: tracked for telemetry but does NOT rewind the visible cursor —
      // the prompt advances linearly; backspace just signals self-correction intent.
      if (key === 'Backspace') {
        usedBackspaceRef.current = true;
        e.preventDefault();
        return;
      }
      // Only handle printable single chars (letters, digits, punctuation, space).
      if (key.length !== 1) return;
      e.preventDefault();
      const now = Date.now();
      const pos = typedLen;
      if (pos >= target.length) return;
      const expected = target[pos]!;
      // Case-insensitive comparison for letters (kids may caps-lock); space matches space.
      const correct = key.toLowerCase() === expected.toLowerCase();
      const since = now - lastKeyTsRef.current;
      lastKeyTsRef.current = now;
      if (firstKeyTsRef.current === null) firstKeyTsRef.current = now;
      wordKeystrokesRef.current += 1;
      // Position within the current word slice = distance from the previous word boundary.
      const lastBoundary = (() => {
        for (let i = pos - 1; i >= 0; i--) if (target[i] === ' ') return i;
        return -1;
      })();
      const positionInWord = pos - lastBoundary - 1;
      void enqueueEvent(
        {
          name: 'typing_keystroke',
          level,
          lesson,
          question_id: q!.id,
          expected_char: expected,
          typed_char: key,
          correct,
          time_since_prev_ms: since,
          position_in_word: positionInWord,
        },
        ctx,
      );
      if (!correct) {
        wordErrorsRef.current += 1;
        wordErrorCharsRef.current.push({ expected, typed: key });
        setFlash('err');
        setTimeout(() => setFlash(null), 140);
        // Don't advance — wait for the right key (keeps frustration low; no skip).
        return;
      }
      // Correct: advance the typed cursor & flash green.
      setFlash('ok');
      setTimeout(() => setFlash(null), 100);
      const nextLen = pos + 1;
      setTypedLen(nextLen);
      // Did we just close a word?
      const closedWord = expected === ' ' || nextLen === target.length;
      if (closedWord) {
        // Slice that word's text out of the target for telemetry.
        const wordEnd = expected === ' ' ? pos : nextLen;
        let wordStartIdx = 0;
        for (let i = wordEnd - 1; i >= 0; i--) {
          if (target[i] === ' ') { wordStartIdx = i + 1; break; }
        }
        const wordText = target.slice(wordStartIdx, wordEnd);
        if (wordText.length > 0) fireWordCompleted(q!, wordText);
        // Don't count empty trailing tokens as a word.
        if (wordText.length > 0) questionScoreRef.current += 1;
      }
      if (nextLen === target.length) {
        // Whole prompt typed → mark this question correct & show feedback.
        setFeedback('correct');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [q, session, feedback, typedLen, target]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = MODULES.find((x) => x.id === 'keyboard')!;
  const beeExpr: BeeExpression = feedback === 'correct' ? 'correct' : flash === 'err' ? 'encourage' : 'focus';
  const coach = feedback === 'correct' ? t('excellent') : flash === 'err' ? t('youCanDoIt') : t('focus');

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
            {/* Wrapper enforces vertical stacking: `.session-prompt` itself uses
                flex-direction row by default, which would lay the prompt and
                the helper text side-by-side. The column wrapper centers them
                cleanly within the larger prompt box. */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, maxWidth: '100%' }}>
            {/* Letter-by-letter target. Typed letters dim; the current letter has a mint
                underline; remaining letters render normal. Flash overlay tints the cell
                green/red on correct/wrong keystrokes for fast feedback. */}
            <div
              style={{
                fontSize: 56,
                fontWeight: 800,
                letterSpacing: 4,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                lineHeight: 1.2,
                display: 'flex',
                gap: 4,
                flexWrap: 'wrap',
                justifyContent: 'center',
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
                      minWidth: ch === ' ' ? 22 : undefined,
                      padding: '2px 6px',
                      borderRadius: 6,
                      background: bg,
                      color: isTyped ? '#94a3b8' : isCurrent ? '#0f172a' : '#0f172a',
                      borderBottom: isCurrent ? '4px solid #34d399' : '4px solid transparent',
                    }}
                  >
                    {ch === ' ' ? ' ' : ch}
                  </span>
                );
              })}
            </div>
            <div style={{ fontSize: 14, color: '#64748b' }}>
              {lang === 'fr' ? 'Tape la lettre allumée' : 'Type the lit letter'}
            </div>
            </div>
          </div>
          {feedback ? (
            <div className={`feedback-strip ${feedback === 'wrong' ? 'retry' : ''}`}>
              <Bee size={56} expression={feedback === 'correct' ? 'correct' : 'encourage'} wings />
              <div style={{ flex: 1 }}><HintLine feedback={feedback} hint={q.hint} lang={lang} /></div>
              <button className="btn" onClick={() => void next()}>
                {t('next')} <Icon name="arrow-right" />
              </button>
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
