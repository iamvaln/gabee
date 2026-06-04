import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { QuestionValue, LevelProgress, LessonProgress } from '@gabee/types';
import { Bee, type BeeExpression } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { MODULES } from '../content/modules';
import { api } from '../lib/api';
import { enqueueEvent, flushEvents } from '../lib/events';
import { sync } from '../lib/sync';
import { useStore } from '../store';
import { shuffle, displayValue, scalarValue, distractorValue } from '../lib/util';
import { HintLine } from '../components/HintLine';

const TOTAL = 7;

// Words/Read session: read a short passage → answer a comprehension question
// (product §4.2). Seed encodes both passage AND question in `prompt` as
// bilingual strings split by a single newline (passage on top, question last).
// Track dwell from question-shown to first option pick → passage_dwell_ms (§9.2).
// Per-language progress track (§7.3): words_read[lang].
function splitPassageAndQuestion(text: string): { passage: string; question: string } {
  const lines = text.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
  if (lines.length <= 1) return { passage: '', question: text };
  const question = lines[lines.length - 1]!;
  const passage = lines.slice(0, -1).join(' ');
  return { passage, question };
}

export function WordsReadSession({
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
        q.sub_mode === 'read-answer' &&
        q.level === level &&
        (isRevision || q.lesson === lesson),
    );
    if (pool.length === 0) return null;
    return { questions: shuffle(pool).slice(0, Math.min(TOTAL, pool.length)) };
  }, [bundle, level, lesson, isRevision]);

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
  const answerScalar = q ? scalarValue(q.answer as QuestionValue, lang) : null;

  // Curriculum v0.1: passage lives in config.passage; the prompt IS the question.
  // Fall back to the legacy "passage\nquestion" packed prompt if config is absent.
  const promptText = q ? String(displayValue(q.prompt, lang)) : '';
  const { passage, question: comprehensionQ } = useMemo(() => {
    const cfg = q?.config as { passage?: import('@gabee/types').QuestionValue } | undefined;
    if (cfg?.passage) return { passage: String(displayValue(cfg.passage, lang)), question: promptText };
    return splitPassageAndQuestion(promptText);
  }, [q, lang, promptText]);

  const options = useMemo<QuestionValue[]>(
    () => (q ? shuffle([q.answer as QuestionValue, ...q.distractors.map(distractorValue)]) : []),
    [q],
  );

  useEffect(() => {
    if (!session || !q || startedRef.current || !profile) return;
    startedRef.current = true;
    lessonStartRef.current = Date.now();
    const position = nextLessonPosition();
    void enqueueEvent(
      { name: 'lesson_started', module: 'words', sub_mode: 'read-answer', level, lesson, trigger, position_in_session: position },
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
      { name: 'question_shown', module: 'words', sub_mode: 'read-answer', level, lesson, question_id: q.id, type: q.type, attempt_num: attempt },
      ctx,
    );
  }, [q, attempt, session, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(opt: QuestionValue) {
    if (feedback || !q || !session) return;
    const chosen = scalarValue(opt, lang);
    setPicked(chosen);
    const correct = chosen === answerScalar;
    setFeedback(correct ? 'correct' : 'wrong');
    const responseMs = Date.now() - questionStartRef.current;
    void enqueueEvent(
      {
        name: 'question_answered',
        module: 'words',
        sub_mode: 'read-answer',
        level,
        lesson,
        question_id: q.id,
        correct,
        selected_option: chosen,
        response_time_ms: responseMs,
        attempt_num: attempt,
      },
      ctx,
    );
    // Reading-specific signal (§9.2): dwell window passage-shown → first option pick.
    // Re-emitted as question_shown with passage_dwell_ms — analytics dedupe by
    // (question_id, attempt_num) and prefer the variant carrying dwell.
    void enqueueEvent(
      {
        name: 'question_shown',
        module: 'words',
        sub_mode: 'read-answer',
        level,
        lesson,
        question_id: q.id,
        type: q.type,
        attempt_num: attempt,
        passage_dwell_ms: responseMs,
      },
      ctx,
    );
  }

  // Persist progress to the per-language Words/Read track (product §7.3). Optimistic
  // local update + queue for sync (last-write-wins, survives offline).
  async function persistProgress(correctCount: number, ratingStars: number) {
    if (!profile || !session) return;
    const now = new Date().toISOString();
    const trackPair = profile.progress_by_module_per_language.words_read;
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
      words_read: { ...trackPair, [lang]: nextTrack },
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
        { name: 'lesson_completed', module: 'words', sub_mode: 'read-answer', level, lesson, stars, duration_s: Math.round((Date.now() - lessonStartRef.current) / 1000) },
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
          <div className="session-prompt" style={{ flexDirection: 'column', gap: 16 }}>
            {passage && (
              <div
                style={{
                  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
                  fontSize: 26,
                  lineHeight: 1.55,
                  maxWidth: 640,
                  textAlign: 'center',
                  padding: '12px 8px',
                }}
              >
                {passage}
              </div>
            )}
            <div style={{ fontSize: 22, fontWeight: 600, textAlign: 'center', maxWidth: 640 }}>
              {comprehensionQ}
            </div>
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
