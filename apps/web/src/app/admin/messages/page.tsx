import { cookies } from 'next/headers';
import { MessagesHealthRangeSchema, type MessagesHealthRange } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { getMessagesHealth } from '@/lib/server/services/admin-messages-health';
import { PageHead } from '../_shell/primitives';
import { AIcon } from '../_shell/icons';
import { AdminBee } from '../_shell/bee';
import { RangePicker } from './RangePicker';

export const dynamic = 'force-dynamic';

// Messages feature-health dashboard (changes-v1 §1.5). Server-rendered — the DB read
// happens here, the viz is JSX. The only interactive bit (range picker) is a small
// client component that pushes ?range= into the URL.
//
// Privacy contract: the service NEVER selects `text`. This page only consumes the
// counts/rates/timestamps it returns. Never add a `text` read here.
export default async function MessagesHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireAdminPage();
  const lang = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const L = lang === 'fr';

  const rawRange = (await searchParams).range;
  const range: MessagesHealthRange = MessagesHealthRangeSchema.safeParse(rawRange).success
    ? (rawRange as MessagesHealthRange)
    : '30d';
  const d = await getMessagesHealth(range);

  const fmt = (n: number) => n.toLocaleString(L ? 'fr-FR' : 'en-US');
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const allZero =
    d.volume.sent === 0 &&
    d.volume.delivered === 0 &&
    d.volume.read === 0 &&
    d.volume.deleted === 0;

  if (allZero) {
    return (
      <div className="page">
        <PageHead
          title={L ? 'Messages — santé de la feature' : 'Messages — feature health'}
          sub={
            L
              ? 'Adoption et engagement de la messagerie parent → enfant.'
              : 'Adoption and engagement of parent → kid messaging.'
          }
        >
          <span className="privacy-pill">
            <AIcon name="lock" size={13} />
            {L ? 'Comptes & taux — jamais le contenu' : 'Counts & rates — never content'}
          </span>
        </PageHead>
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <AdminBee size={84} expression="idle" />
          <p style={{ marginTop: 12, fontWeight: 600 }}>
            {L
              ? "La feature messages n'a pas encore été utilisée."
              : "The messages feature hasn't been used yet."}
          </p>
        </div>
      </div>
    );
  }

  const deltaPts =
    d.read_rate_prev != null
      ? Math.round((d.read_rate - d.read_rate_prev) * 1000) / 10
      : null;

  const ttrLabels = ['< 5 min', '5–30', '30 m–2 h', '2–24 h', '> 24 h'];
  const freqLabels = ['1', '2–5', '6–10', '10+'];

  const funnelStages = [
    { label: L ? 'Envoyés' : 'Sent', val: d.funnel.sent, color: 'var(--text-2)' },
    { label: L ? 'Délivrés' : 'Delivered', val: d.funnel.delivered, color: 'var(--brand)' },
    { label: L ? 'Lus' : 'Read', val: d.funnel.read, color: 'var(--mascot-admin)' },
  ];

  return (
    <div className="page">
      <PageHead
        title={L ? 'Messages — santé de la feature' : 'Messages — feature health'}
        sub={
          L
            ? 'Est-ce que les parents écrivent, et est-ce que les enfants lisent ? Lecture seule, pour décider — pas pour agir sur des individus.'
            : 'Are parents writing, and are kids reading? Read-only, to inform decisions — not to act on individuals.'
        }
      >
        <span className="privacy-pill">
          <AIcon name="lock" size={13} />
          {L ? 'Comptes & taux — jamais le contenu' : 'Counts & rates — never content'}
        </span>
      </PageHead>

      <div className="range-row mt8">
        <RangePicker range={range} lang={lang} />
      </div>

      {/* Hero: read rate gauge + funnel */}
      <div className="tiles mt8" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
        <div className="card">
          <div className="card-head">
            <h3>{L ? 'Taux de lecture' : 'Read rate'}</h3>
            <span className="card-title-sub">
              {L ? 'lus / délivrés' : 'read / delivered'}
            </span>
          </div>
          <div className="row gap12" style={{ alignItems: 'center', padding: 16 }}>
            <Gauge value={d.read_rate} />
            <div style={{ flex: 1 }}>
              <div className="t-main" style={{ fontSize: 16, fontWeight: 700 }}>
                {L ? 'des messages sont lus' : 'of messages are read'}
              </div>
              <div className="row gap8" style={{ marginTop: 10 }}>
                {deltaPts != null ? (
                  <span className={'badge ' + (deltaPts >= 0 ? 'ok' : 'bad')}>
                    <i className="bdot" />
                    {deltaPts >= 0 ? '+' : ''}
                    {deltaPts} pts
                  </span>
                ) : (
                  <span className="badge neutral">
                    <i className="bdot" />
                    {L ? 'cumul' : 'all-time'}
                  </span>
                )}
                <span className="t-sub">
                  {L ? 'vs période précéd.' : 'vs prev period'}
                </span>
              </div>
              <div
                className="t-mono"
                style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}
              >
                {fmt(d.volume.read)}{' '}
                <span className="t-sub" style={{ fontWeight: 400 }}>
                  / {fmt(d.volume.delivered)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>{L ? 'Entonnoir de distribution' : 'Distribution funnel'}</h3>
          </div>
          <div className="card-pad">
            {funnelStages.map((s, i) => {
              const denom = Math.max(1, d.funnel.sent);
              const w = Math.round((s.val / denom) * 100);
              const prev = i > 0 ? funnelStages[i - 1]!.val : null;
              const drop =
                prev != null && prev > 0
                  ? Math.round(((prev - s.val) / prev) * 100)
                  : null;
              return (
                <div key={s.label} style={{ marginBottom: 12 }}>
                  <div className="row gap8" style={{ justifyContent: 'space-between' }}>
                    <span className="t-sub" style={{ fontWeight: 700 }}>
                      {s.label}
                    </span>
                    <span className="t-mono t-main">{fmt(s.val)}</span>
                  </div>
                  <div className="minibar">
                    <i style={{ width: `${w}%`, background: s.color }} />
                  </div>
                  {drop != null && (
                    <span className="t-sub" style={{ fontSize: 12 }}>
                      <AIcon name="arrow-down-r" size={12} /> {drop}%{' '}
                      {L ? 'de perte' : 'drop-off'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Volume tiles */}
      <div className="section-label mt24">{L ? 'Volume' : 'Volume'}</div>
      <div className="tiles" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <Tile
          label={L ? 'Messages envoyés' : 'Messages sent'}
          num={fmt(d.volume.sent)}
          foot={L ? 'par les parents' : 'by parents'}
        />
        <Tile
          label={L ? 'Délivrés' : 'Delivered'}
          num={fmt(d.volume.delivered)}
          foot={L ? '1ʳᵉ apparition du bandeau' : 'first bandeau shown'}
        />
        <Tile
          label={L ? 'Lus' : 'Read'}
          num={fmt(d.volume.read)}
          foot={L ? 'tap « Continuer »' : '"Continue" tapped'}
        />
        <Tile
          label={L ? 'Supprimés avant lecture' : 'Deleted before read'}
          num={fmt(d.volume.deleted)}
          foot={L ? "rétractés par l'envoyeur" : 'retracted by sender'}
        />
      </div>

      {/* Engagement */}
      <div className="section-label mt24">{L ? 'Engagement' : 'Engagement'}</div>
      <div className="tiles" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <Tile
          label={L ? 'Délai médian de lecture' : 'Median time-to-read'}
          num={`${Math.round(d.median_ttr_minutes)} min`}
          foot={L ? 'délivrance → lecture' : 'delivery → read'}
        />
        <Tile
          label={L ? 'Envoyeurs actifs' : 'Active senders'}
          num={fmt(d.active_senders)}
          foot={L ? 'parents ≥ 1 message' : 'parents with ≥ 1 message'}
        />
        <Tile
          label={L ? 'Destinataires actifs' : 'Active recipients'}
          num={fmt(d.active_recipients)}
          foot={L ? 'enfants ≥ 1 message reçu' : 'kids with ≥ 1 received'}
        />
      </div>

      <div className="tiles mt16" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
        <div className="card">
          <div className="card-head">
            <h3>{L ? 'Délai de lecture' : 'Time-to-read'}</h3>
            <span className="card-title-sub">
              {L ? 'répartition' : 'distribution'}
            </span>
          </div>
          <div className="card-pad">
            <VBars data={d.ttr_histogram} labels={ttrLabels} color="var(--mascot-admin)" />
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h3>{L ? "Fréquence d'envoi" : 'Send frequency'}</h3>
            <span className="card-title-sub">
              {L ? 'messages / envoyeur actif' : 'messages / active sender'}
            </span>
          </div>
          <div className="card-pad">
            <VBars data={d.send_frequency_histogram} labels={freqLabels} color="var(--brand)" />
          </div>
        </div>
      </div>

      {/* Adoption & retention */}
      <div className="section-label mt24">
        {L ? 'Adoption & rétention' : 'Adoption & retention'}
      </div>
      <div className="tiles" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
        <div className="card">
          <div className="card-head">
            <h3>{L ? "Courbe d'adoption" : 'Adoption curve'}</h3>
            <span className="card-title-sub">
              {L ? '% de parents ayant déjà écrit · 8 sem.' : '% of parents who ever sent · 8 wks'}
            </span>
          </div>
          <div className="card-pad">
            <LineChart data={d.adoption_curve_weekly} />
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h3>{L ? 'Rétention des envoyeurs' : 'Sender retention'}</h3>
            <span className="card-title-sub">
              {L ? 'semaines après le 1ᵉʳ envoi' : 'weeks after first send'}
            </span>
          </div>
          <div className="card-pad">
            <HBars
              data={d.sender_retention.map((v, i) => ({ label: `N+${i + 1}`, value: v }))}
            />
          </div>
        </div>
      </div>

      <div className="card mt16">
        <div className="card-head">
          <h3>
            {L ? 'Couplage classification → message' : 'Classification → message'}
          </h3>
        </div>
        <div className="card-pad">
          <div className="t-mono" style={{ fontSize: 32, fontWeight: 700 }}>
            {pct(d.classification_to_message_coupling)}
          </div>
          <p className="t-sub" style={{ marginTop: 6 }}>
            {L
              ? "des parents qui classifient un jour donné laissent aussi un mot ce jour-là — signal que l'invitation en fin de classification fonctionne."
              : 'of parents who classify on a given day also leave a word that day — signal that the end-of-classification invitation works.'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Local viz primitives (server-rendered SVG / divs) ───────────────────────

function Tile({ label, num, foot }: { label: string; num: string; foot: string }) {
  return (
    <div className="card tile">
      <div className="tile-label">{label}</div>
      <div className="tile-num tnum">{num}</div>
      <div className="tile-foot">{foot}</div>
    </div>
  );
}

function Gauge({ value, size = 130, stroke = 12 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-3)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--mascot-admin)"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          fontWeight: 700,
        }}
      >
        {Math.round(value * 100)}
        <i style={{ fontStyle: 'normal', fontSize: 16, marginLeft: 2 }}>%</i>
      </div>
    </div>
  );
}

function VBars({ data, labels, color }: { data: readonly number[]; labels: string[]; color: string }) {
  const max = Math.max(1, ...data);
  return (
    <div className="row gap8" style={{ alignItems: 'flex-end', height: 140 }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span className="t-mono t-sub" style={{ fontSize: 12 }}>{v}</span>
          <div style={{ width: '100%', height: 100, display: 'flex', alignItems: 'flex-end' }}>
            <div
              style={{
                width: '100%',
                height: `${(v / max) * 100}%`,
                background: color,
                borderRadius: 4,
              }}
            />
          </div>
          <span className="t-sub" style={{ fontSize: 11, textAlign: 'center' }}>
            {labels[i]}
          </span>
        </div>
      ))}
    </div>
  );
}

function LineChart({ data, color = 'var(--brand)' }: { data: number[]; color?: string }) {
  const w = 460;
  const h = 140;
  if (data.length < 2) {
    return <svg width={w} height={h} />;
  }
  const max = Math.max(...data);
  const min = 0;
  const rng = max - min || 1;
  const padB = 18;
  const padT = 10;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * (w - 8) + 4,
    h - padB - ((v - min) / rng) * (h - padB - padT),
  ] as const);
  const d = pts
    .map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1))
    .join(' ');
  const lastPt = pts[pts.length - 1]!;
  const firstPt = pts[0]!;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {[0.25, 0.5, 0.75].map((g) => (
        <line
          key={g}
          x1="0"
          x2={w}
          y1={(h - padB) * (1 - g) + padT * g}
          y2={(h - padB) * (1 - g) + padT * g}
          stroke="var(--border)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
      ))}
      <path
        d={`${d} L ${lastPt[0]} ${h - padB} L ${firstPt[0]} ${h - padB} Z`}
        fill={color}
        opacity="0.10"
      />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 4 : 2.4} fill={color} />
      ))}
    </svg>
  );
}

function HBars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.map((row) => (
        <div key={row.label} className="row gap12" style={{ alignItems: 'center' }}>
          <span className="t-sub" style={{ width: 48, fontWeight: 700 }}>
            {row.label}
          </span>
          <div style={{ flex: 1 }}>
            <div className="minibar">
              <i style={{ width: `${(row.value / max) * 100}%`, background: 'var(--mascot-admin)' }} />
            </div>
          </div>
          <span className="t-mono t-main" style={{ width: 56, textAlign: 'right' }}>
            {Math.round(row.value)}%
          </span>
        </div>
      ))}
    </div>
  );
}
