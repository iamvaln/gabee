import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type {
  Language,
  LessonProgress,
  LevelProgress,
  QuestionRecord,
  QuestionValue,
  TranslationDirection,
} from '@gabee/types';
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
import { sfx, speak, speakSuccess, stopSpeaking, warmVoice } from '../lib/audio';
import { AssetGlyph } from '../components/AssetGlyph';
import { HintLine } from '../components/HintLine';
import { SessionLoader } from '../components/SessionLoader';
import { SessionError } from '../components/SessionError';
import { bundleLoadFailed, isOffline } from '../lib/bundleLoad';

const TOTAL = 7;

// Stable, deterministic hash of a question id → bit. Fallback only: the seed
// usually encodes the intended direction via which side of `prompt` matches
// `answer`. This guards against an ambiguous prompt where both fr and en
// happen to be equal strings.
function hashBit(id: string): 0 | 1 {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h ^ id.charCodeAt(i)) * 16777619) >>> 0;
  }
  return (h & 1) as 0 | 1;
}

// Per-question direction: the seed answers are already scalar strings in the
// target language. Comparing answer to each side of the bilingual prompt picks
// the direction the question was authored as — giving "mixed within level"
// (product §4.5) directly from the data, with a deterministic fallback.
function directionFor(q: QuestionRecord): TranslationDirection {
  // Curriculum v0.1: direction is explicit in config (and the sub_mode key).
  const dir = (q.config as { direction?: string } | undefined)?.direction ?? q.sub_mode;
  if (dir === 'fr-en') return 'fr_to_en';
  if (dir === 'en-fr') return 'en_to_fr';
  // Legacy fallback: infer from which prompt side equals the scalar answer.
  const ans = String(q.answer);
  const p = q.prompt;
  if (typeof p === 'object' && p !== null) {
    if (ans === p.en && ans !== p.fr) return 'fr_to_en';
    if (ans === p.fr && ans !== p.en) return 'en_to_fr';
  }
  return hashBit(q.id) ? 'fr_to_en' : 'en_to_fr';
}

function sourceLang(dir: TranslationDirection): Language {
  return dir === 'fr_to_en' ? 'fr' : 'en';
}

// The direction SLUG a question belongs to ('fr-en' / 'en-fr') — the form used
// by `q.sub_mode`, `config.direction`, the URL, and the `direction` prop below.
// Reuses `directionFor`'s config/sub_mode read + deterministic fallback so a
// direction-scoped session never accidentally pulls the other direction's cards.
type DirectionSlug = 'fr-en' | 'en-fr';
function directionSlugFor(q: QuestionRecord): DirectionSlug {
  return directionFor(q) === 'fr_to_en' ? 'fr-en' : 'en-fr';
}

function badgeLabel(dir: TranslationDirection): string {
  return dir === 'fr_to_en' ? 'FR → EN' : 'EN → FR';
}

// Translation session: read the prompt in the source language, pick the right
// word in the target language. Direction is mixed within each level (product
// §4.5). Per-language progress is on `translation` (product §7.3).
export function TranslationSession({
  direction,
  level,
  lesson,
  isRevision,
  trigger,
  onDone,
  onHome,
  onBack,
}: {
  /** Which direction this session plays. Scopes both question sampling and the
   *  progress key so the two directions never cross (product §4.5 rework). */
  direction: DirectionSlug;
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
    queryKey: ['bundle', 'translation'],
    queryFn: () => api.getBundle('translation'),
  });

  const session = useMemo(() => {
    if (!bundle) return null;
    // One-direction sessions (rework): sample ONLY this direction's cards at the
    // level. `direction` is the slug ('fr-en'/'en-fr'); match it against each
    // question's own direction slug.
    const pool = bundle.questions.filter((q) => q.level === level && directionSlugFor(q) === direction);
    if (pool.length === 0) return null;
    const seen = getSeen(profile?.id ?? null, `translation:${direction}`, level);
    return { questions: selectSession(pool, ageFromBirthDate(profile?.birth_date ?? null), TOTAL, seen) };
  }, [bundle, level, lesson, isRevision, direction]);

  // Seen/resume namespaces are per-direction (track = '<module>:<sub>', like
  // 'words:picture') so the two directions don't collide at the same level/lesson.
  const resumeKey = sessionResumeKey(profile?.id ?? null, `translation:${direction}`, level, lesson);
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
  const dir: TranslationDirection | null = q ? directionFor(q) : null;
  const src = dir ? sourceLang(dir) : lang;
  // Options live in the target language already (scalars in the seed); compare
  // the picked scalar against the answer scalar without going through lang.
  const answerScalar = q ? String(q.answer) : null;
  const options = useMemo<QuestionValue[]>(
    () => (q ? shuffle([q.answer as QuestionValue, ...q.distractors.map(distractorValue)]) : []),
    [q],
  );

  // Voiceover moment 1 (audio spec §5): read the source word in ITS language.
  // Image questions (all of L1) have no source word — and speaking anything
  // word-shaped could leak the answer — so they read the INSTRUCTION in the
  // kid's UI language instead ("Traduis ce mot en anglais."): pre-readers on
  // L1 are exactly who can't read that line. Its own effect with
  // stop-on-cleanup so narration halts on question change AND unmount (must not
  // leak onto hub/map), and survives StrictMode's dev double-mount — a
  // ref-guarded speak would be cancelled by the replayed cleanup and never
  // re-fire. Re-narrates on retry (attempt), matching question_shown.
  useEffect(() => {
    if (!q || !session || !profile) return;
    const cfg = q.config as { image?: string; source?: string } | undefined;
    if (cfg?.image) {
      // Per-card instruction was too chatty (QA 2026-07-14): read it once
      // before the exercises, then let the pictures speak for themselves.
      if (qIdx === 0 && attempt === 1) speak(displayValue(q.prompt, lang), lang);
    } else {
      speak(cfg?.source ?? displayValue(q.prompt, src), src);
    }
    return () => stopSpeaking();
  }, [q?.id, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!session || !q || startedRef.current || !profile) return;
    startedRef.current = true;
    lessonStartRef.current = Date.now();
    const position = nextLessonPosition();
    void enqueueEvent(
      { name: 'lesson_started', module: 'translation', level, lesson, trigger, position_in_session: position },
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
      { name: 'question_shown', module: 'translation', level, lesson, question_id: q.id, type: q.type, attempt_num: attempt },
      ctx,
    );
  }, [q, attempt, session, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(opt: QuestionValue) {
    if (feedback || !q || !session) return;
    stopSpeaking(); // answering interrupts narration instantly (spec §5)
    warmVoice();
    const chosen = scalarValue(opt, lang);
    setPicked(chosen);
    const correct = String(chosen) === answerScalar;
    setFeedback(correct ? 'correct' : 'wrong');
    sfx(correct ? 'correct' : 'wrong');
    if (correct && answerScalar) {
      // Voiceover moment 2: the answer in the TARGET language, then praise in
      // the UI language.
      const dst = src === 'fr' ? 'en' : 'fr';
      speakSuccess(answerScalar, dst, t('excellent'), lang);
    }
    void enqueueEvent(
      {
        name: 'question_answered',
        module: 'translation',
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

  // Persist to the per-language Translation track (product §7.3). Same shape as
  // Words/Picture's persistProgress, swapped onto the `translation` key.
  async function persistProgress(correctCount: number, ratingStars: number) {
    if (!profile || !session) return;
    const now = new Date().toISOString();
    // Persist to THIS direction's per-language track. Slug 'fr-en' → key
    // 'translation_fr_en' (underscore infix inside the identifier).
    const dirKey = `translation_${direction.replace('-', '_')}` as
      | 'translation_fr_en'
      | 'translation_en_fr';
    const trackPair = profile.progress_by_module_per_language[dirKey];
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

    markSeen(profile.id, `translation:${direction}`, level, session.questions.map((q) => q.id));
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
      [dirKey]: { ...trackPair, [lang]: nextTrack },
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
        { name: 'lesson_completed', module: 'translation', level, lesson, stars, duration_s: Math.round((Date.now() - lessonStartRef.current) / 1000) },
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

  const m = MODULES.find((x) => x.id === 'translation')!;
  const beeExpr: BeeExpression = feedback === 'correct' ? 'correct' : feedback === 'wrong' ? 'encourage' : 'focus';
  const coach = feedback === 'correct' ? t('excellent') : feedback === 'wrong' ? t('youCanDoIt') : t('focus');

  const shell = { module: m.id, title: m.label[lang], lang, setLang, onBack, onHome, profile };
  if (bundleLoadFailed({ isLoading, isError, hasBundle: !!bundle, offline: isOffline() })) {
    return <SessionError {...shell} onRetry={() => void refetch()} level={level} lesson={lesson} />;
  }
  if (isLoading || !session || !q || !dir) {
    return <SessionLoader {...shell} />;
  }

  return (
    <div className="session-screen" data-module="translation">
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
          <div className="session-prompt">
            {/* Direction badge — themed via data-module="translation". */}
            <span
              aria-label={badgeLabel(dir)}
              style={{
                display: 'inline-block',
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: 0.5,
                padding: '4px 10px',
                marginBottom: 12,
                borderRadius: 999,
                background: 'var(--module, var(--color-brand))',
                color: 'var(--module-text, white)',
              }}
            >
              {badgeLabel(dir)}
            </span>
            {/* Source to translate: an image (L1) or the source-language word/phrase
                (config.source). The prompt is the instruction, shown small below. */}
            {(() => {
              const cfg = q.config as { image?: string; source?: string } | undefined;
              if (cfg?.image) return <AssetGlyph name={cfg.image} size={120} />;
              return (
                <div style={{ fontSize: 56, lineHeight: 1.1, fontWeight: 700 }}>
                  {cfg?.source ?? displayValue(q.prompt, src)}
                </div>
              );
            })()}
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-2)', marginTop: 10 }}>
              {displayValue(q.prompt, lang)}
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
                const state = picked === chosen ? (String(chosen) === answerScalar ? 'correct' : 'wrong') : '';
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
