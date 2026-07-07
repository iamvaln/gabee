'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  Language,
  PendingSession,
  InitiationLabel,
  PendingSessionsResponse,
  SkinTone,
  HairColor,
  ShirtColor,
} from '@gabee/types';
import { MintBee } from '../_components/mint-bee';
import { KidAvatar } from '../_components/kid-avatar';

export interface ClassifyKidContext {
  id: string;
  name: string;
  skinTone: SkinTone;
  hairColor: HairColor;
  shirtColor: ShirtColor;
}

interface Props {
  initial: PendingSession[];
  kids: Record<string, ClassifyKidContext>;
  lang: Language;
}

// Module color tokens (parent-data.jsx MODULES).
const MOD_COLOR: Record<string, string> = {
  numbers: '#1F6FEB',
  words: '#D6336C',
  keyboard: '#8B6A0A',
  code: '#7B2FF7',
  translation: '#B05525',
};
const MOD_NAME: Record<string, { fr: string; en: string }> = {
  numbers: { fr: 'Nombres', en: 'Numbers' },
  words: { fr: 'Mots', en: 'Words' },
  keyboard: { fr: 'Clavier', en: 'Keyboard' },
  code: { fr: 'Code', en: 'Code' },
  translation: { fr: 'Traduction', en: 'Translate' },
};

const COPY = {
  exit: { fr: 'Sortir', en: 'Exit' },
  question: (name: string, lang: Language) =>
    lang === 'fr'
      ? [`Cette session, c'était à l'initiative de `, name, `, ou à la vôtre ?`]
      : [`Was this session ${name}'s initiative, or yours?`],
  theyAsked: { fr: 'À son initiative', en: 'Their initiative' },
  theyAskedSub: { fr: 'L’enfant a ouvert Gabee seul·e', en: 'They opened Gabee on their own' },
  iSuggested: { fr: 'À votre initiative', en: 'Your initiative' },
  iSuggestedSub: { fr: 'Vous le lui avez proposé', en: 'You suggested it' },
  notSure: { fr: 'Pas sûr·e', en: 'Not sure' },
  notSureSub: { fr: 'Retiré de la file', en: 'Removed from queue' },
  skipForNow: { fr: "Passer pour l'instant", en: 'Skip for now' },
  whyAsk: { fr: 'Pourquoi on demande', en: 'Why we ask' },
  classifyDone: { fr: 'Tout est revu !', en: 'All reviewed!' },
  classifyDoneSub: {
    fr: "Merci d'avoir pris ce moment avec eux aujourd'hui.",
    en: 'Thanks for taking this moment with them today.',
  },
  classifyRefill: {
    fr: 'On vérifie les dernières sessions…',
    en: 'Checking for any latest sessions…',
  },
  backHome: { fr: "Retour à l'accueil", en: 'Back to home' },
  leaveWordTitle: { fr: 'Et si tu lui laissais un mot ?', en: 'Want to leave them a word?' },
  leaveWordSub: {
    fr: 'Ils le verront à leur prochaine session.',
    en: "They'll see it at their next session.",
  },
  yes: { fr: 'Oui', en: 'Yes' },
  later: { fr: 'Plus tard', en: 'Later' },
  submitFailed: {
    fr: 'Envoi échoué — votre choix est conservé.',
    en: "Submit failed — your choice is preserved.",
  },
  retry: { fr: 'Réessayer', en: 'Retry' },
  whyBody: {
    fr: "Savoir si votre enfant a ouvert Gabee de sa propre initiative — ou si c'est vous qui l'avez proposé — vous aide à rester proche de son apprentissage au quotidien. C'est votre moment pour voir ce qu'il a fait et choisir ce qui vient ensuite. Vos réponses restent privées et n'affectent jamais le contenu de votre enfant.",
    en: "Knowing whether your kid opened Gabee on their own — or you suggested it — helps you stay close to their learning day to day. It's your moment to see what they did and shape what comes next. Your answers stay private and never change your kid's content.",
  },
  gotIt: { fr: 'Compris', en: 'Got it' },
};

/**
 * C1 client flow (parent spec §6.2). One session card at a time with three
 * large choice buttons and a Skip link; on submit we POST to
 * `/api/classifications` and advance. When the queue empties, we render the
 * thank-you screen with the optional "Leave a word" handoff — clicking Oui
 * navigates to `/parent/messages/new?to=<id>` which is M2's compose form.
 */
export function ClassifyFlow({ initial, kids, lang }: Props) {
  // Queue is seeded from the server snapshot but mutable: when the parent
  // finishes the initial batch we re-poll for any sessions that arrived
  // while they were classifying (kid playing in parallel). Without this,
  // the screen says "all reviewed" but the home badge still shows pending
  // — the exact bug the user flagged.
  const [queue, setQueue] = useState<PendingSession[]>(initial);
  const [idx, setIdx] = useState(0);
  const [sel, setSel] = useState<InitiationLabel | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  // Track all kid ids whose sessions we just classified — used for Leave-a-word.
  const [classifiedKidIds, setClassifiedKidIds] = useState<string[]>([]);
  // 'idle' = ready to refill, 'fetching' = a refill is in flight, 'exhausted'
  // = the last refill returned no new sessions, so it's safe to show the
  // "all reviewed" screen. State machine prevents an infinite refetch loop
  // when the queue legitimately empties.
  const [refillState, setRefillState] = useState<'idle' | 'fetching' | 'exhausted'>('idle');

  const router = useRouter();
  const total = queue.length;
  const current = queue[idx];
  const done = !current && refillState === 'exhausted';
  const refilling = !current && refillState === 'fetching';

  // When the parent runs past the loaded batch, poll once for any sessions
  // that arrived since the page loaded. We use a ref (not a closure-scoped
  // cancel flag) to gate "did we already fire a refill for THIS exhaustion
  // event" — using a flag would race with the effect cleanup that fires on
  // every re-render: setRefillState('fetching') triggers a re-render, the
  // cleanup sets cancelled=true, and the in-flight fetch then refuses to
  // update state on response. That's the "stuck on refill loading forever"
  // bug. The ref resets to false whenever we have items again, so each
  // future emptying can refill once.
  const refillFiredRef = useRef(false);
  useEffect(() => {
    if (current) {
      refillFiredRef.current = false;
      return;
    }
    if (refillFiredRef.current) return;
    if (refillState === 'exhausted') return;
    refillFiredRef.current = true;
    setRefillState('fetching');
    void (async () => {
      try {
        const res = await fetch('/api/classifications/pending');
        if (!res.ok) {
          setRefillState('exhausted');
          return;
        }
        const body = (await res.json()) as PendingSessionsResponse;
        // Dedupe against what's already in the queue — POSTs we just did may
        // still appear if the read replica hasn't caught up.
        const seen = new Set(queue.map((q) => q.session_id));
        const fresh = (body.sessions ?? []).filter((s) => !seen.has(s.session_id));
        if (fresh.length === 0) {
          setRefillState('exhausted');
          return;
        }
        setQueue((q) => [...q, ...fresh]);
        setRefillState('idle');
      } catch {
        setRefillState('exhausted');
      }
    })();
  }, [current, queue, refillState]);

  const advance = useCallback(() => {
    setSel(null);
    setIdx((i) => i + 1);
  }, []);

  const choose = useCallback(
    async (label: InitiationLabel) => {
      if (!current) return;
      setSel(label);
      setSubmitting(true);
      setErrorMsg(null);
      try {
        const res = await fetch('/api/classifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ session_id: current.session_id, label }],
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error?.message ?? 'Submit failed');
        }
        setClassifiedKidIds((arr) =>
          arr.includes(current.profile_id) ? arr : [...arr, current.profile_id],
        );
        // Re-run the server layout so the "Revue" nav badge decrements live as
        // each session is classified (and the dashboard is already correct on
        // return). Soft refresh — keeps this flow's client state intact.
        router.refresh();
        // Brief delay so the user sees their selection highlight (per design).
        setTimeout(advance, 260);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : 'Submit failed');
        setSel(null);
      } finally {
        setSubmitting(false);
      }
    },
    [current, advance, router],
  );

  // ---- Empty / done state -------------------------------------------------
  if (refilling) {
    // Briefly show a quiet refill state while we re-poll. Avoids the false
    // "All reviewed!" flash before learning a kid just finished a session.
    return <RefillLoading lang={lang} />;
  }
  if (done) {
    return <ThankYou kids={kids} classifiedKidIds={classifiedKidIds} lang={lang} />;
  }
  // Narrow `current` for the render below — this branch is the
  // transient "queue empty, refillState 'idle'" moment before the effect
  // flips refillState to 'fetching'. Same RefillLoading screen so the UI
  // doesn't flicker.
  if (!current) return <RefillLoading lang={lang} />;

  const kid = kids[current.profile_id];
  const kidName = kid?.name ?? '—';
  const sessionDate = new Date(current.started_at);
  const dateStr = sessionDate.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'short',
    day: 'numeric',
  });
  const timeStr = sessionDate.toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const modKey = current.first_module ?? 'words';
  const modColor = MOD_COLOR[modKey] ?? 'var(--mint)';
  const modName = MOD_NAME[modKey]?.[lang] ?? modKey;
  const durationMin = current.duration_s != null ? Math.max(1, Math.round(current.duration_s / 60)) : null;

  const qParts = COPY.question(kidName, lang);
  const progressPct = total > 0 ? (idx / total) * 100 : 0;

  return (
    <div className="classify-stage">
      <div className="classify-top">
        <Link href="/parent" className="icon-btn" aria-label={COPY.exit[lang]}>
          <span aria-hidden style={{ fontSize: 20, fontWeight: 900, lineHeight: 1 }}>×</span>
        </Link>
        <div className="classify-progress">
          <i style={{ width: `${progressPct}%` }} />
        </div>
        <span className="classify-count">
          {idx + 1} / {total}
        </span>
      </div>

      <div className="classify-body">
        <div className="classify-inner">
          {errorMsg && (
            <div className="inline-error" style={{ marginBottom: 22 }}>
              <span aria-hidden>!</span>
              {COPY.submitFailed[lang]}
              <button
                type="button"
                className="btn link"
                style={{ marginLeft: 'auto' }}
                onClick={() => setErrorMsg(null)}
              >
                {COPY.retry[lang]}
              </button>
            </div>
          )}

          <div className="classify-kidline">
            <KidAvatar
              skinTone={kid?.skinTone}
              hairColor={kid?.hairColor}
              shirtColor={kid?.shirtColor}
              size={48}
              label={kidName}
            />
            <span className="nm">{kidName}</span>
          </div>
          <div className="classify-meta">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span className="mod-dot" style={{ background: modColor }} />
              {modName}
            </span>
            <span>·</span>
            <span>
              {dateStr} {timeStr}
            </span>
            {durationMin != null && (
              <>
                <span>·</span>
                <span>{durationMin} min</span>
              </>
            )}
          </div>

          <h1 className="classify-q">
            {qParts[0]}
            <b>{qParts[1]}</b>
            {qParts[2]}
          </h1>

          <div className="classify-choices">
            <button
              type="button"
              className={'choice-btn' + (sel === 'child_initiated' ? ' sel' : '')}
              disabled={submitting}
              onClick={() => choose('child_initiated')}
            >
              <span className="ch-ic" aria-hidden>✋</span>
              <span>
                {COPY.theyAsked[lang]}
                <span className="ch-sub">{COPY.theyAskedSub[lang]}</span>
              </span>
            </button>
            <button
              type="button"
              className={'choice-btn' + (sel === 'prompted' ? ' sel' : '')}
              disabled={submitting}
              onClick={() => choose('prompted')}
            >
              <span className="ch-ic" aria-hidden>👉</span>
              <span>
                {COPY.iSuggested[lang]}
                <span className="ch-sub">{COPY.iSuggestedSub[lang]}</span>
              </span>
            </button>
            <button
              type="button"
              className={'choice-btn' + (sel === 'unsure' ? ' sel' : '')}
              disabled={submitting}
              onClick={() => choose('unsure')}
            >
              <span className="ch-ic" aria-hidden>?</span>
              <span>
                {COPY.notSure[lang]}
                <span className="ch-sub">{COPY.notSureSub[lang]}</span>
              </span>
            </button>
          </div>

          <div className="classify-skip">
            <button type="button" className="btn link" onClick={advance}>
              {COPY.skipForNow[lang]}
            </button>
            <button type="button" className="btn link" onClick={() => setShowWhy(true)}>
              {COPY.whyAsk[lang]}
            </button>
          </div>
        </div>
      </div>

      {showWhy && <WhyModal lang={lang} onClose={() => setShowWhy(false)} />}
    </div>
  );
}

function WhyModal({ lang, onClose }: { lang: Language; onClose: () => void }) {
  return (
    <div className="scrim" onClick={onClose} role="presentation">
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={COPY.whyAsk[lang]}
      >
        <div className="modal-head">
          <span style={{ color: 'var(--mint-deep)' }} aria-hidden>?</span>
          <h2>{COPY.whyAsk[lang]}</h2>
          <button type="button" className="close-x mh-close" onClick={onClose} aria-label="close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0, fontWeight: 600, lineHeight: 1.6, color: 'var(--text-2)' }}>
            {COPY.whyBody[lang]}
          </p>
        </div>
        <div className="modal-foot">
          <div className="grow" />
          <button type="button" className="btn mint" onClick={onClose}>
            {COPY.gotIt[lang]}
          </button>
        </div>
      </div>
    </div>
  );
}

// Quiet refill screen — shown for the brief window between "the parent
// finished the loaded batch" and "we know whether more arrived". Plain
// centered string + bee so it doesn't read as a separate destination,
// just a moment of "checking".
function RefillLoading({ lang }: { lang: Language }) {
  return (
    <div className="classify-stage">
      <div className="classify-body">
        <div className="classify-inner" style={{ textAlign: 'center' }}>
          <MintBee size={108} expression="focus" />
          <p
            style={{
              marginTop: 20,
              color: 'var(--text-2)',
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            {COPY.classifyRefill[lang]}
          </p>
        </div>
      </div>
    </div>
  );
}

function ThankYou({
  kids,
  classifiedKidIds,
  lang,
}: {
  kids: Record<string, ClassifyKidContext>;
  classifiedKidIds: string[];
  lang: Language;
}) {
  const router = useRouter();

  const classifiedKids = useMemo(
    () => classifiedKidIds.map((id) => kids[id]).filter(Boolean) as ClassifyKidContext[],
    [classifiedKidIds, kids],
  );
  const [pickKid, setPickKid] = useState<string | null>(null);
  const activeKid = pickKid ?? classifiedKids[0]?.id ?? null;

  const goHome = () => router.push('/parent');

  return (
    <div className="classify-stage">
      <div className="classify-body">
        <div className="classify-inner">
          <MintBee size={132} expression="celebrate" />
          <h1 className="classify-q" style={{ marginTop: 18 }}>
            {COPY.classifyDone[lang]}
          </h1>
          <p
            style={{
              color: 'var(--text-2)',
              fontWeight: 600,
              fontSize: 16,
              margin: '0 auto 28px',
              maxWidth: '40ch',
            }}
          >
            {COPY.classifyDoneSub[lang]}
          </p>
          <button type="button" className="btn mint lg" onClick={goHome}>
            <span aria-hidden>⌂</span>
            {COPY.backHome[lang]}
          </button>

          {classifiedKids.length > 0 && (
            <div className="leave-word">
              <div className="lw-title">{COPY.leaveWordTitle[lang]}</div>
              <div className="lw-sub">{COPY.leaveWordSub[lang]}</div>
              {classifiedKids.length > 1 && (
                <div className="lw-kids">
                  {classifiedKids.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      className={'lw-kid' + (activeKid === k.id ? ' on' : '')}
                      onClick={() => setPickKid(k.id)}
                    >
                      <KidAvatar
                        skinTone={k.skinTone}
                        hairColor={k.hairColor}
                        shirtColor={k.shirtColor}
                        size={40}
                        label={k.name}
                      />
                      <span>{k.name}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="lw-actions">
                <button type="button" className="btn ghost" onClick={goHome}>
                  {COPY.later[lang]}
                </button>
                {activeKid && (
                  <Link
                    href={`/parent/messages/new?to=${encodeURIComponent(activeKid)}`}
                    className="btn mint"
                  >
                    <span aria-hidden>✉</span>
                    {COPY.yes[lang]}
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
