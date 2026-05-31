'use client';

import { useMemo, useState } from 'react';
import type { Language } from '@gabee/types';
import { MintBee } from '../../_components/mint-bee';
import type {
  KidSessionRow,
  KidModuleAggregate,
} from '@/lib/server/services/parent-kid-detail';

/**
 * K2 client tabs (parent spec §7.3). Owns the tab state and the Activity
 * filter state. Each tab is a pure render of the props the server page passed
 * in — no client-side fetches.
 */

type TabId = 'overview' | 'activity' | 'performance' | 'feedback';

interface OverviewMetrics {
  weekMinutes: number;
  weekSessions: number;
  adherence: number;
  healthy: boolean;
  totalSessions: number;
}

interface FeedbackRow {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  status: string;
  scope: string;
  target: unknown;
}

interface KeyboardMetricsLite {
  total_words: number;
  total_keystrokes: number;
  wpm: number;
  accuracy_pct: number;
  avg_reaction_ms: number | null;
  backspace_pct: number;
  scrolling_on_time_pct: number | null;
  top_error_letters: { letter: string; count: number }[];
  since: string;
  until: string;
}
interface CodeMetricsLite {
  solved_puzzles: number;
  total_runs: number;
  efficiency_ratio: number;
  avg_attempts_per_solve: number;
  wall_hit_rate: number;
  loop_adoption_pct: number;
  conditional_adoption_pct: number;
  median_solve_duration_s: number | null;
  since: string;
  until: string;
}

interface Props {
  lang: Language;
  defaultTab: TabId;
  overview: OverviewMetrics;
  sessions: KidSessionRow[];
  modules: KidModuleAggregate[];
  feedback: FeedbackRow[];
  kidName: string;
  keyboardMetrics: KeyboardMetricsLite | null;
  codeMetrics: CodeMetricsLite | null;
}

const TAB_LABELS: Record<TabId, { fr: string; en: string }> = {
  overview: { fr: 'Aperçu', en: 'Overview' },
  activity: { fr: 'Activité', en: 'Activity' },
  performance: { fr: 'Performance', en: 'Performance' },
  feedback: { fr: 'Retours', en: 'Feedback' },
};

const MOD_COLOR: Record<string, string> = {
  numbers: '#1F6FEB',
  words: '#D6336C',
  keyboard: '#8B6A0A',
  code: '#7B2FF7',
  translation: '#B05525',
};
const MOD_LABEL: Record<string, { fr: string; en: string }> = {
  numbers: { fr: 'Nombres', en: 'Numbers' },
  words: { fr: 'Mots', en: 'Words' },
  keyboard: { fr: 'Clavier', en: 'Keyboard' },
  code: { fr: 'Code', en: 'Code' },
  translation: { fr: 'Traduction', en: 'Translate' },
};

export function KidDetailTabs({
  lang,
  defaultTab,
  overview,
  sessions,
  modules,
  feedback,
  kidName,
  keyboardMetrics,
  codeMetrics,
}: Props) {
  const [tab, setTab] = useState<TabId>(defaultTab);
  const TABS: TabId[] = ['overview', 'activity', 'performance', 'feedback'];

  return (
    <div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={'tab' + (tab === t ? ' on' : '')}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t][lang]}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab lang={lang} metrics={overview} />}
      {tab === 'activity' && (
        <ActivityTab lang={lang} sessions={sessions} kidName={kidName} />
      )}
      {tab === 'performance' && (
        <PerformanceTab
          lang={lang}
          modules={modules}
          keyboardMetrics={keyboardMetrics}
          codeMetrics={codeMetrics}
        />
      )}
      {tab === 'feedback' && (
        <FeedbackTab lang={lang} rows={feedback} kidName={kidName} />
      )}
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────

function OverviewTab({
  lang,
  metrics,
}: {
  lang: Language;
  metrics: OverviewMetrics;
}) {
  return (
    <div className="stat-grid">
      <div className="tile">
        <p className="t-label">
          <span aria-hidden>⏱</span>
          {lang === 'fr' ? 'Temps cette semaine' : 'Time this week'}
        </p>
        <div className="t-value">{fmtDur(metrics.weekMinutes)}</div>
        <div className="t-delta" style={{ color: 'var(--text-3)' }}>
          {lang === 'fr' ? '7 derniers jours' : 'last 7 days'}
        </div>
      </div>

      <div className="tile">
        <p className="t-label">
          <span aria-hidden>📅</span>
          {lang === 'fr' ? 'Sessions cette semaine' : 'Sessions this week'}
        </p>
        <div className="t-value">{metrics.weekSessions}</div>
        <div className="t-delta" style={{ color: 'var(--text-3)' }}>
          {metrics.totalSessions} {lang === 'fr' ? 'au total' : 'total'}
        </div>
      </div>

      <div className="tile">
        <p className="t-label">
          <span aria-hidden>♥</span>
          {lang === 'fr' ? 'Auto-initiées' : 'Self-initiated'}
        </p>
        <div className="t-value">{Math.round(metrics.adherence * 100)}%</div>
        <div className="t-delta" style={{ color: 'var(--text-3)' }}>
          {lang === 'fr' ? 'des sessions classées' : 'of classified sessions'}
        </div>
      </div>

      <div className="tile">
        <p className="t-label">
          <span aria-hidden>🔥</span>
          {lang === 'fr' ? 'Série' : 'Streak'}
        </p>
        <div className="t-value">
          —{' '}
          <small style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-3)' }}>
            {lang === 'fr' ? 'Phase 2' : 'Phase 2'}
          </small>
        </div>
      </div>

      <div className="tile" style={{ gridColumn: 'span 2' }}>
        <p className="t-label">
          <span aria-hidden>✓</span>
          {lang === 'fr' ? 'Usage sain' : 'Healthy use'}
        </p>
        <div style={{ marginTop: 8 }}>
          <span className={'pill ' + (metrics.healthy ? 'ok' : 'warn')}>
            <span aria-hidden>{metrics.healthy ? '✓' : '!'}</span>
            {metrics.healthy
              ? lang === 'fr'
                ? 'Durées de session saines'
                : 'Healthy session lengths'
              : lang === 'fr'
                ? 'Une session un peu longue cette semaine'
                : 'One slightly long session this week'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Activity ────────────────────────────────────────────────────────────────

function ActivityTab({
  lang,
  sessions,
  kidName,
}: {
  lang: Language;
  sessions: KidSessionRow[];
  kidName: string;
}) {
  const [range, setRange] = useState<'7d' | '30d' | 'all'>('7d');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'classified' | 'pending'>('all');

  const filtered = useMemo(() => {
    const cutoff =
      range === '7d'
        ? Date.now() - 7 * 24 * 60 * 60 * 1000
        : range === '30d'
          ? Date.now() - 30 * 24 * 60 * 60 * 1000
          : 0;
    return sessions.filter((s) => {
      if (new Date(s.started_at).getTime() < cutoff) return false;
      if (moduleFilter !== 'all' && s.module !== moduleFilter) return false;
      if (statusFilter === 'classified' && s.label == null) return false;
      if (statusFilter === 'pending' && s.label != null) return false;
      return true;
    });
  }, [sessions, range, moduleFilter, statusFilter]);

  const modulesPresent = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) if (s.module) set.add(s.module);
    return [...set];
  }, [sessions]);

  if (sessions.length === 0) {
    return (
      <EmptyState
        title={lang === 'fr' ? 'Pas encore de sessions' : 'No sessions yet'}
        body={
          lang === 'fr'
            ? `Dès que ${kidName} aura sa première leçon, tout apparaîtra ici.`
            : `Once ${kidName} starts learning, this will fill up.`
        }
      />
    );
  }

  return (
    <div>
      <div
        className="filters"
        style={{ marginBottom: 18, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <div className="seg">
          {(['7d', '30d', 'all'] as const).map((r) => (
            <button
              key={r}
              type="button"
              className={range === r ? 'on' : ''}
              onClick={() => setRange(r)}
            >
              {r === 'all' ? (lang === 'fr' ? 'Tout' : 'All') : r}
            </button>
          ))}
        </div>
        <select
          className="select"
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          style={{ width: 'auto' }}
        >
          <option value="all">{lang === 'fr' ? 'Tous les modules' : 'All modules'}</option>
          {modulesPresent.map((m) => (
            <option key={m} value={m}>
              {MOD_LABEL[m]?.[lang] ?? m}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'classified' | 'pending')}
          style={{ width: 'auto' }}
        >
          <option value="all">{lang === 'fr' ? 'Tous statuts' : 'All status'}</option>
          <option value="classified">{lang === 'fr' ? 'Classé' : 'Classified'}</option>
          <option value="pending">{lang === 'fr' ? 'En attente' : 'Pending'}</option>
        </select>
      </div>

      <div className="card tbl-wrap">
        {filtered.length === 0 ? (
          <div style={{ padding: 24, color: 'var(--text-2)', fontWeight: 700, textAlign: 'center' }}>
            {lang === 'fr' ? 'Aucune session ne correspond.' : 'No sessions match these filters.'}
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>{lang === 'fr' ? 'Session' : 'Session'}</th>
                <th>{lang === 'fr' ? 'Quand' : 'When'}</th>
                <th className="num">{lang === 'fr' ? 'Durée' : 'Duration'}</th>
                <th>{lang === 'fr' ? 'Classement' : 'Status'}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.session_id}>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800 }}>
                      <span
                        className="mod-dot"
                        style={{
                          background: s.module ? (MOD_COLOR[s.module] ?? 'var(--text-2)') : 'var(--border-strong)',
                        }}
                      />
                      {s.module ? (MOD_LABEL[s.module]?.[lang] ?? s.module) : '—'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-2)', fontWeight: 700 }}>
                    {new Date(s.started_at).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="num">{s.duration_min != null ? `${s.duration_min} min` : '—'}</td>
                  <td>
                    <StatusBadge label={s.label} lang={lang} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Performance ─────────────────────────────────────────────────────────────

function PerformanceTab({
  lang,
  modules,
  keyboardMetrics,
  codeMetrics,
}: {
  lang: Language;
  modules: KidModuleAggregate[];
  keyboardMetrics: KeyboardMetricsLite | null;
  codeMetrics: CodeMetricsLite | null;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    return modules[0] ? { [modules[0].module]: true } : {};
  });

  if (modules.length === 0) {
    return (
      <EmptyState
        title={lang === 'fr' ? 'Pas encore de données' : 'No module data yet'}
        body={
          lang === 'fr'
            ? 'La performance se remplit dès que votre enfant joue dans chaque module.'
            : 'Performance fills in once your kid plays a session in each module.'
        }
      />
    );
  }

  return (
    <div>
      <p style={{ color: 'var(--text-2)', fontWeight: 600, marginTop: 0, marginBottom: 18 }}>
        {lang === 'fr'
          ? 'Une carte par module exploré. Touchez pour déplier.'
          : 'One card per module touched. Tap to expand.'}
      </p>
      {modules.map((m) => {
        const isOpen = !!open[m.module];
        return (
          <div key={m.module} className="perf-card">
            <button
              type="button"
              className="perf-head"
              onClick={() => setOpen((o) => ({ ...o, [m.module]: !o[m.module] }))}
            >
              <span
                className="perf-mod-ic"
                style={{ background: MOD_COLOR[m.module] ?? 'var(--text-2)' }}
                aria-hidden
              />
              <span className="ph-name">{MOD_LABEL[m.module]?.[lang] ?? m.module}</span>
              <span className="ph-meta">
                <span>
                  {m.sessions} {lang === 'fr' ? 'sessions' : 'sessions'}
                </span>
                <span>{fmtDur(m.total_duration_min)}</span>
                <span className="badge mint">
                  {m.highest_level > 0 ? (lang === 'fr' ? `N${m.highest_level}` : `L${m.highest_level}`) : '—'}
                </span>
                <span aria-hidden>{isOpen ? '▾' : '▸'}</span>
              </span>
            </button>
            {isOpen && (
              <div className="perf-body">
                <div className="perf-metrics">
                  <div className="metric">
                    <div className="m-label">{lang === 'fr' ? 'Sessions' : 'Sessions'}</div>
                    <div className="m-value">{m.sessions}</div>
                  </div>
                  <div className="metric">
                    <div className="m-label">{lang === 'fr' ? 'Temps total' : 'Total time'}</div>
                    <div className="m-value">{fmtDur(m.total_duration_min)}</div>
                  </div>
                  <div className="metric">
                    <div className="m-label">
                      {lang === 'fr' ? 'Niveau atteint' : 'Highest level'}
                    </div>
                    <div className="m-value">
                      {m.highest_level > 0
                        ? lang === 'fr'
                          ? `N${m.highest_level}`
                          : `L${m.highest_level}`
                        : '—'}
                    </div>
                  </div>
                </div>
                {m.module === 'keyboard' && keyboardMetrics && (
                  <KeyboardDetailMetrics lang={lang} m={keyboardMetrics} />
                )}
                {m.module === 'code' && codeMetrics && (
                  <CodeDetailMetrics lang={lang} m={codeMetrics} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Process-rich Keyboard metrics ───────────────────────────────────────────

function KeyboardDetailMetrics({ lang, m }: { lang: Language; m: KeyboardMetricsLite }) {
  const L = lang === 'fr';
  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
        {L ? 'Détails frappe' : 'Typing details'}
      </div>
      <div className="perf-metrics">
        <div className="metric">
          <div className="m-label">{L ? 'Vitesse (mots/min)' : 'Speed (WPM)'}</div>
          <div className="m-value">{m.wpm}</div>
        </div>
        <div className="metric">
          <div className="m-label">{L ? 'Précision' : 'Accuracy'}</div>
          <div className="m-value">{m.accuracy_pct}%</div>
        </div>
        <div className="metric">
          <div className="m-label">{L ? 'Réaction moyenne' : 'Avg reaction'}</div>
          <div className="m-value">{m.avg_reaction_ms != null ? `${m.avg_reaction_ms} ms` : '—'}</div>
        </div>
        <div className="metric">
          <div className="m-label">{L ? 'Corrections (backspace)' : 'Self-corrections'}</div>
          <div className="m-value">{m.backspace_pct}%</div>
        </div>
        {m.scrolling_on_time_pct != null && (
          <div className="metric">
            <div className="m-label">{L ? 'Défilement à temps' : 'Scrolling on-time'}</div>
            <div className="m-value">{m.scrolling_on_time_pct}%</div>
          </div>
        )}
      </div>
      {m.top_error_letters.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-3)', marginBottom: 6 }}>
            {L ? 'Lettres les plus difficiles' : 'Most-missed letters'}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {m.top_error_letters.map((el) => (
              <span
                key={el.letter}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 999,
                  background: 'var(--bad-bg)', color: 'var(--bad)',
                  fontWeight: 800, fontSize: 13,
                }}
              >
                <span style={{ fontFamily: 'ui-monospace, monospace' }}>{el.letter}</span>
                <span style={{ fontWeight: 600, opacity: 0.7 }}>×{el.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 10 }}>
        {L
          ? `Sur ${m.total_words} mots / ${m.total_keystrokes} frappes (28 derniers jours).`
          : `Across ${m.total_words} words / ${m.total_keystrokes} keystrokes (last 28 days).`}
      </div>
    </div>
  );
}

// ─── Process-rich Code metrics ───────────────────────────────────────────────

function CodeDetailMetrics({ lang, m }: { lang: Language; m: CodeMetricsLite }) {
  const L = lang === 'fr';
  const efficiencyPct = Math.round(m.efficiency_ratio * 100);
  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
        {L ? 'Détails programmation' : 'Coding details'}
      </div>
      <div className="perf-metrics">
        <div className="metric">
          <div className="m-label">{L ? 'Puzzles résolus' : 'Puzzles solved'}</div>
          <div className="m-value">{m.solved_puzzles}</div>
        </div>
        <div className="metric">
          <div className="m-label">{L ? 'Efficacité' : 'Efficiency'}</div>
          <div className="m-value">{efficiencyPct}%</div>
        </div>
        <div className="metric">
          <div className="m-label">{L ? 'Essais par puzzle' : 'Attempts/puzzle'}</div>
          <div className="m-value">{m.avg_attempts_per_solve}</div>
        </div>
        <div className="metric">
          <div className="m-label">{L ? 'Mur touché / lancement' : 'Wall hits/run'}</div>
          <div className="m-value">{m.wall_hit_rate}</div>
        </div>
        <div className="metric">
          <div className="m-label">{L ? 'Boucles utilisées' : 'Loops used'}</div>
          <div className="m-value">{m.loop_adoption_pct}%</div>
        </div>
        <div className="metric">
          <div className="m-label">{L ? 'Conditions utilisées' : 'Conditionals used'}</div>
          <div className="m-value">{m.conditional_adoption_pct}%</div>
        </div>
        {m.median_solve_duration_s != null && (
          <div className="metric">
            <div className="m-label">{L ? 'Durée médiane' : 'Median solve'}</div>
            <div className="m-value">{m.median_solve_duration_s}s</div>
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 10 }}>
        {L
          ? `Sur ${m.solved_puzzles} puzzles / ${m.total_runs} lancements (28 derniers jours). Efficacité 100 % = programme optimal à chaque fois.`
          : `Across ${m.solved_puzzles} puzzles / ${m.total_runs} runs (last 28 days). 100 % efficiency = always picked the optimal program.`}
      </div>
    </div>
  );
}

// ─── Feedback ────────────────────────────────────────────────────────────────

function FeedbackTab({
  lang,
  rows,
  kidName,
}: {
  lang: Language;
  rows: FeedbackRow[];
  kidName: string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title={lang === 'fr' ? 'Aucun retour' : 'No feedback yet'}
        body={
          lang === 'fr'
            ? `Notez le contenu depuis une session pour le retrouver ici (${kidName}).`
            : `Rate content from a session to see it here for ${kidName}.`
        }
      />
    );
  }
  return (
    <div className="card tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>{lang === 'fr' ? 'Note' : 'Rating'}</th>
            <th>{lang === 'fr' ? 'Commentaire' : 'Comment'}</th>
            <th>{lang === 'fr' ? 'Statut' : 'Status'}</th>
            <th>{lang === 'fr' ? 'Date' : 'Date'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <span style={{ display: 'inline-flex', color: '#FFB400', gap: 1, fontWeight: 900 }}>
                  {Array.from({ length: r.rating }).map((_, i) => (
                    <span key={i} aria-hidden>★</span>
                  ))}
                  {Array.from({ length: Math.max(0, 5 - r.rating) }).map((_, i) => (
                    <span key={i} aria-hidden style={{ color: 'var(--border-strong)' }}>★</span>
                  ))}
                </span>
              </td>
              <td style={{ color: 'var(--text-2)', fontWeight: 600, maxWidth: 280 }}>
                {r.comment ?? (
                  <em style={{ color: 'var(--text-3)' }}>
                    {lang === 'fr' ? 'Aucun commentaire' : 'No comment'}
                  </em>
                )}
              </td>
              <td>
                <span className="badge neutral">{r.status}</span>
              </td>
              <td style={{ color: 'var(--text-3)', fontWeight: 700 }}>
                {new Date(r.created_at).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatusBadge({
  label,
  lang,
}: {
  label: KidSessionRow['label'];
  lang: Language;
}) {
  if (label === 'child_initiated') {
    return (
      <span className="badge ok">
        <span className="bdot" />
        {lang === 'fr' ? 'Il/elle a demandé' : 'They asked'}
      </span>
    );
  }
  if (label === 'prompted') {
    return (
      <span className="badge warn">
        <span className="bdot" />
        {lang === 'fr' ? 'Proposé' : 'Prompted'}
      </span>
    );
  }
  if (label === 'unsure') {
    return (
      <span className="badge neutral">
        <span className="bdot" />
        {lang === 'fr' ? 'Pas sûr·e' : 'Unsure'}
      </span>
    );
  }
  return (
    <span className="badge bad">
      <span className="bdot" />
      {lang === 'fr' ? 'En attente' : 'Pending'}
    </span>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <div className="e-bee">
        <MintBee size={92} expression="idle" />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function fmtDur(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}
