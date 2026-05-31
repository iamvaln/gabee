// admin-messages.jsx — Messages feature-health dashboard (changes-v1 §1.5)
// Read-only. Counts, rates, timestamps, distributions — NEVER message content.

// ---- Sample aggregates (materialised-view stand-ins), keyed by date range ----
const MSG_HEALTH = {
  '7d':  { sent: 142,  delivered: 128,  read: 112,  deleted: 6,  readRatePrev: 0.862,
           medianTTR: 31,  activeSenders: 88,  activeRecipients: 96,  classCoupling: 0.44,
           ttr: [52, 34, 14, 8, 4], freq: [56, 26, 5, 1] },
  '30d': { sent: 612,  delivered: 548,  read: 476,  deleted: 22, readRatePrev: 0.851,
           medianTTR: 38,  activeSenders: 214, activeRecipients: 242, classCoupling: 0.41,
           ttr: [196, 142, 78, 41, 19], freq: [118, 74, 16, 6] },
  '90d': { sent: 1490, delivered: 1340, read: 1138, deleted: 51, readRatePrev: 0.842,
           medianTTR: 45,  activeSenders: 388, activeRecipients: 430, classCoupling: 0.38,
           ttr: [470, 330, 180, 108, 50], freq: [196, 142, 38, 12] },
  'all': { sent: 2210, delivered: 1980, read: 1654, deleted: 78, readRatePrev: null,
           medianTTR: 52,  activeSenders: 512, activeRecipients: 588, classCoupling: 0.36,
           ttr: [640, 470, 280, 170, 94], freq: [262, 186, 48, 16] },
};
// Week-over-week, range-independent
const MSG_ADOPTION = [6, 11, 17, 24, 31, 37, 42, 46];          // % of all parents who ever sent
const MSG_RETENTION = [72, 58, 49, 43];                         // % sender retention N+1…N+4

const RANGES = [
  { id: '7d',  fr: '7 j',   en: '7d' },
  { id: '30d', fr: '30 j',  en: '30d' },
  { id: '90d', fr: '90 j',  en: '90d' },
  { id: 'all', fr: 'Tout',  en: 'All-time' },
];

// ---------- small chart primitives (admin palette) ----------
function Gauge({ value, size = 150, stroke = 14, color = 'var(--mascot-admin)' }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div className="gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} stroke="var(--surface-3)" strokeWidth={stroke} fill="none" />
        <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - value)} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`} />
      </svg>
      <div className="gauge-center">
        <span className="gauge-pct">{Math.round(value * 100)}<i>%</i></span>
      </div>
    </div>
  );
}

function VBars({ data, labels, color = 'var(--ink)', lang }) {
  const max = Math.max(...data);
  const total = data.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="vbars">
      <div className="vbars-plot">
        {data.map((v, i) => (
          <div key={i} className="vbar-col" title={`${v} · ${Math.round(v/total*100)}%`}>
            <span className="vbar-val">{v}</span>
            <div className="vbar-track">
              <i style={{ height: `${max ? (v / max) * 100 : 0}%`, background: color }} />
            </div>
            <span className="vbar-x">{labels[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({ data, color = 'var(--brand)', h = 132 }) {
  const w = 460;
  const max = Math.max(...data), min = 0;
  const rng = max - min || 1;
  const padB = 18, padT = 10;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * (w - 8) + 4,
    (h - padB) - ((v - min) / rng) * (h - padB - padT),
  ]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return (
    <svg className="linechart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {[0.25, 0.5, 0.75].map(g => (
        <line key={g} x1="0" x2={w} y1={(h - padB) * (1 - g) + padT * g} y2={(h - padB) * (1 - g) + padT * g}
          stroke="var(--border)" strokeWidth="1" strokeDasharray="3 4" />
      ))}
      <path d={`${d} L ${pts[pts.length-1][0]} ${h - padB} L ${pts[0][0]} ${h - padB} Z`} fill={color} opacity="0.10" />
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 4 : 2.4} fill={color} />)}
    </svg>
  );
}

// ---------- funnel ----------
function Funnel({ d, lang }) {
  const L = lang === 'fr';
  const stages = [
    { label: L ? 'Envoyés' : 'Sent', val: d.sent, color: 'var(--text-2)' },
    { label: L ? 'Délivrés' : 'Delivered', val: d.delivered, color: 'var(--brand)' },
    { label: L ? 'Lus' : 'Read', val: d.read, color: 'var(--mascot-admin)' },
  ];
  return (
    <div className="funnel">
      {stages.map((s, i) => {
        const w = Math.round((s.val / d.sent) * 100);
        const prev = i > 0 ? stages[i - 1].val : null;
        const drop = prev != null ? Math.round(((prev - s.val) / prev) * 100) : null;
        return (
          <div key={i} className="funnel-row">
            <div className="funnel-head">
              <span className="funnel-label">{s.label}</span>
              <span className="funnel-val">{s.val.toLocaleString(L ? 'fr-FR' : 'en-US')}</span>
            </div>
            <div className="funnel-track">
              <i style={{ width: `${w}%`, background: s.color }} />
              <span className="funnel-pct">{w}%</span>
            </div>
            {drop != null && (
              <span className="funnel-drop"><AIcon name="arrow-down-r" size={12} />{drop}% {L ? 'de perte' : 'drop-off'}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- empty state ----------
function MessagesHealthEmpty({ lang }) {
  const L = lang === 'fr';
  return (
    <div className="page">
      <PageHead title={L ? 'Messages — santé de la feature' : 'Messages — feature health'}
        sub={L ? 'Adoption et engagement de la messagerie parent → enfant.' : 'Adoption and engagement of parent → kid messaging.'} />
      <div className="card msgh-empty">
        <AdminBee size={84} expression="idle" />
        <p>{L ? 'La feature messages n’a pas encore été utilisée.' : 'The messages feature hasn’t been used yet.'}</p>
      </div>
    </div>
  );
}

// ---------- main ----------
function MessagesHealth({ lang, empty }) {
  const L = lang === 'fr';
  const [range, setRange] = React.useState('30d');
  if (empty) return <MessagesHealthEmpty lang={lang} />;
  const d = MSG_HEALTH[range];
  const readRate = d.read / d.delivered;
  const deltaPts = d.readRatePrev != null ? Math.round((readRate - d.readRatePrev) * 1000) / 10 : null;
  const fmt = (n) => n.toLocaleString(L ? 'fr-FR' : 'en-US');
  const ttrLabels = ['< 5 min', '5–30', '30 m–2 h', '2–24 h', '> 24 h'];
  const freqLabels = L ? ['1', '2–5', '6–10', '10+'] : ['1', '2–5', '6–10', '10+'];

  return (
    <div className="page">
      <PageHead title={L ? 'Messages — santé de la feature' : 'Messages — feature health'}
        sub={L ? 'Est-ce que les parents écrivent, et est-ce que les enfants lisent ? Lecture seule, pour décider — pas pour agir sur des individus.'
               : 'Are parents writing, and are kids reading? Read-only, to inform decisions — not to act on individuals.'}>
        <span className="privacy-pill"><AIcon name="lock" size={13} />{L ? 'Comptes & taux — jamais le contenu' : 'Counts & rates — never content'}</span>
      </PageHead>

      <div className="range-row">
        <div className="filters">
          {RANGES.map(r => (
            <button key={r.id} className={'chip' + (range === r.id ? ' on' : '')} onClick={() => setRange(r.id)}>
              {L ? r.fr : r.en}
            </button>
          ))}
        </div>
      </div>

      {/* Hero: read rate + funnel */}
      <div className="msgh-hero mt8">
        <div className="card msgh-rate">
          <div className="section-label mb0">{L ? 'Taux de lecture' : 'Read rate'}</div>
          <div className="msgh-rate-body">
            <Gauge value={readRate} />
            <div className="msgh-rate-meta">
              <div className="msgh-rate-headline">{L ? 'des messages sont lus' : 'of messages are read'}</div>
              <div className="row gap8" style={{ marginTop: 10 }}>
                {deltaPts != null ? (
                  <span className={'badge ' + (deltaPts >= 0 ? 'ok' : 'bad')}>
                    <AIcon name={deltaPts >= 0 ? 'arrow-up-r' : 'arrow-down-r'} size={12} />{deltaPts >= 0 ? '+' : ''}{deltaPts} pts
                  </span>
                ) : <span className="badge neutral">{L ? 'cumul' : 'all-time'}</span>}
                <span className="hint">{L ? 'lus / délivrés · vs période précéd.' : 'read / delivered · vs prev period'}</span>
              </div>
              <div className="msgh-rate-frac">{fmt(d.read)} <span>/ {fmt(d.delivered)}</span></div>
            </div>
          </div>
        </div>

        <div className="card msgh-funnel">
          <div className="section-label mb0">{L ? 'Entonnoir de distribution' : 'Distribution funnel'}</div>
          <Funnel d={d} lang={lang} />
        </div>
      </div>

      {/* Volume */}
      <div className="section-label mt24">{L ? 'Volume' : 'Volume'}</div>
      <div className="tiles">
        <Tile label={L ? 'Messages envoyés' : 'Messages sent'} num={fmt(d.sent)} foot={L ? 'par les parents' : 'by parents'} />
        <Tile label={L ? 'Délivrés' : 'Delivered'} num={fmt(d.delivered)} foot={L ? '1ʳᵉ apparition du bandeau' : 'first bandeau shown'} />
        <Tile label={L ? 'Lus' : 'Read'} num={fmt(d.read)} foot={L ? 'tap « Continuer »' : '“Continue” tapped'} />
        <Tile label={L ? 'Supprimés avant lecture' : 'Deleted before read'} num={fmt(d.deleted)} foot={L ? 'rétractés par l’envoyeur' : 'retracted by sender'} />
      </div>

      {/* Engagement */}
      <div className="section-label mt24">{L ? 'Engagement' : 'Engagement'}</div>
      <div className="tiles tiles-3">
        <Tile label={L ? 'Délai médian de lecture' : 'Median time-to-read'} num={`${d.medianTTR} min`} foot={L ? 'délivrance → lecture' : 'delivery → read'} />
        <Tile label={L ? 'Envoyeurs actifs' : 'Active senders'} num={fmt(d.activeSenders)} foot={L ? 'parents ≥ 1 message' : 'parents with ≥ 1 message'} />
        <Tile label={L ? 'Destinataires actifs' : 'Active recipients'} num={fmt(d.activeRecipients)} foot={L ? 'enfants ≥ 1 message reçu' : 'kids with ≥ 1 received'} />
      </div>
      <div className="msgh-charts mt16">
        <div className="card">
          <div className="card-head"><h3>{L ? 'Délai de lecture' : 'Time-to-read'}</h3><span className="card-title-sub">{L ? 'répartition' : 'distribution'}</span></div>
          <VBars data={d.ttr} labels={ttrLabels} color="var(--mascot-admin)" lang={lang} />
        </div>
        <div className="card">
          <div className="card-head"><h3>{L ? 'Fréquence d’envoi' : 'Send frequency'}</h3><span className="card-title-sub">{L ? 'messages / sem. / envoyeur actif' : 'messages / wk / active sender'}</span></div>
          <VBars data={d.freq} labels={freqLabels} color="var(--brand)" lang={lang} />
        </div>
      </div>

      {/* Adoption & retention */}
      <div className="section-label mt24">{L ? 'Adoption & rétention' : 'Adoption & retention'}</div>
      <div className="msgh-adopt">
        <div className="card">
          <div className="card-head"><h3>{L ? 'Courbe d’adoption' : 'Adoption curve'}</h3><span className="card-title-sub">{L ? '% de parents ayant déjà écrit · 8 sem.' : '% of parents who ever sent · 8 wks'}</span></div>
          <div className="row gap12" style={{ alignItems: 'baseline', margin: '4px 0 10px' }}>
            <span className="msgh-big">{MSG_ADOPTION[MSG_ADOPTION.length - 1]}%</span>
            <span className="badge ok"><AIcon name="arrow-up-r" size={12} />+{MSG_ADOPTION[MSG_ADOPTION.length - 1] - MSG_ADOPTION[MSG_ADOPTION.length - 2]} pts</span>
          </div>
          <LineChart data={MSG_ADOPTION} color="var(--brand)" />
        </div>
        <div className="card">
          <div className="card-head"><h3>{L ? 'Rétention des envoyeurs' : 'Sender retention'}</h3><span className="card-title-sub">{L ? 'semaines après le 1ᵉʳ envoi' : 'weeks after first send'}</span></div>
          <div className="retention">
            {MSG_RETENTION.map((v, i) => (
              <div key={i} className="ret-col">
                <span className="ret-val">{v}%</span>
                <div className="ret-track"><i style={{ height: `${v}%` }} /></div>
                <span className="ret-x">N+{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card msgh-couple">
          <div className="section-label mb0">{L ? 'Couplage classification → message' : 'Classification → message'}</div>
          <div className="msgh-couple-num">{Math.round(d.classCoupling * 100)}%</div>
          <p className="msgh-couple-sub">
            {L ? 'des parents qui classifient un jour donné laissent aussi un mot ce jour-là — signal que l’invitation en fin de classification fonctionne.'
               : 'of parents who classify on a given day also leave a word that day — signal that the end-of-classification invitation works.'}
          </p>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { MessagesHealth, MSG_HEALTH });
