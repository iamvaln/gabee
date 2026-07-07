import Link from 'next/link';
import { MintBee } from './mint-bee';

// H1 §5.2 — one .pulse-row per kid: mascot, name, today's activity, per-module
// pip row. All visuals come from parent.css — see .section-label, .pulse-row,
// .pulse-main, .pulse-name, .age, .pulse-activity, .pip-row, .pip.
// Mirrors parent-home.jsx KidsPulse().
const MODULES: { id: string; nameFr: string; nameEn: string; color: string }[] = [
  { id: 'numbers', nameFr: 'Nombres', nameEn: 'Numbers', color: 'var(--module-numbers)' },
  { id: 'words', nameFr: 'Mots', nameEn: 'Words', color: 'var(--module-words)' },
  { id: 'keyboard', nameFr: 'Clavier', nameEn: 'Keyboard', color: 'var(--module-keyboard)' },
  { id: 'code', nameFr: 'Code', nameEn: 'Code', color: 'var(--module-code)' },
  { id: 'translation', nameFr: 'Traduction', nameEn: 'Translate', color: 'var(--module-translation)' },
];

export interface KidPulse {
  id: string;
  name: string;
  age: number | null;
  todaySessions: number;
  todayMinutes: number;
  modulesPlayedToday: Set<string>;
}

export function HomeKidsPulse({ lang, kids }: { lang: 'fr' | 'en'; kids: KidPulse[] }) {
  const isFr = lang === 'fr';

  if (kids.length === 0) {
    // The empty-no-kids state lives in the page (welcome hero) — unreachable
    // in practice when wired through page.tsx.
    return null;
  }

  // Phase-1 narrative: the kid with the most sessions today gets a one-liner
  // celebrating activity ; otherwise "quiet day". (parent spec §5.4 — the
  // deterministic ruleset is Phase 2; here we keep two simple branches.)
  const mostActive = kids.reduce<KidPulse | null>((best, k) => {
    if (!best) return k;
    return k.todaySessions > best.todaySessions ? k : best;
  }, null);
  const noPlay = !mostActive || mostActive.todaySessions === 0;
  const narrativeHtml = noPlay
    ? isFr ? 'Journée calme aujourd’hui.' : 'Quiet day today.'
    : isFr
      ? `<b>${mostActive!.name}</b> est super actif·ve aujourd’hui (${mostActive!.todaySessions} sessions · ${mostActive!.todayMinutes} min)`
      : `<b>${mostActive!.name}</b> was super active today (${mostActive!.todaySessions} sessions · ${mostActive!.todayMinutes} min)`;

  return (
    <div>
      <div className="section-label">
        {isFr ? 'Vos enfants aujourd’hui' : 'Your kids today'}
        <span className="ln" />
      </div>

      {kids.map((k) => {
        const played = k.todaySessions > 0;
        return (
          <Link
            key={k.id}
            href={`/parent/kids/${k.id}`}
            className="pulse-row"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <MintBee size={54} expression={played ? 'correct' : 'idle'} />
            <div className="pulse-main">
              <div className="pulse-name">
                {k.name}
                {k.age != null && (
                  <span className="age">
                    {k.age} {isFr ? 'ans' : 'yo'}
                  </span>
                )}
              </div>
              <div className={'pulse-activity' + (played ? '' : ' quiet')}>
                {played
                  ? isFr
                    ? `${k.todaySessions} sessions · ${k.todayMinutes} min`
                    : `${k.todaySessions} sessions · ${k.todayMinutes} min`
                  : `${k.name} ${isFr ? 'n’a pas appris aujourd’hui' : 'didn’t learn today'}`}
              </div>
              <div
                className="pip-row"
                aria-label={isFr ? 'modules abordés aujourd’hui' : 'modules touched today'}
              >
                {MODULES.map((m) => {
                  const on = k.modulesPlayedToday.has(m.id);
                  return (
                    <span
                      key={m.id}
                      className={'pip' + (on ? ' on' : '')}
                      title={isFr ? m.nameFr : m.nameEn}
                      style={on ? { background: m.color } : undefined}
                    />
                  );
                })}
              </div>
            </div>
            <span aria-hidden="true" style={{ color: 'var(--text-3)', fontSize: 20, fontWeight: 700 }}>
              ›
            </span>
          </Link>
        );
      })}

      {/* Phase-2 narrative card — one sentence about the day. */}
      <div className="narrative">
        <MintBee size={40} expression="celebrate" wings={false} />
        <div className="nv-text" dangerouslySetInnerHTML={{ __html: narrativeHtml }} />
      </div>
    </div>
  );
}
