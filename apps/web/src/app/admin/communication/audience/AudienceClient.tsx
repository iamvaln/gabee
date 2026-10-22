'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Language } from '@gabee/types';
import type { AudienceReport } from '@/lib/server/content-studio/audience';
import { EmptyState, PageHead, Sparkline } from '../../_shell/primitives';
import { api, reportUnexpected } from '../_components/api';
import { ErrorNotice } from '../_components/ErrorNotice';
import { errorText } from '../_components/errors';
import { PLATFORM_LABEL, addDaysYmd, dayMonth, type Bi } from '../_components/format';

const PERIODS = [7, 30] as const;
type Period = (typeof PERIODS)[number];

const SOURCE_LABEL: Record<string, Bi> = {
  linkedin: { fr: 'LinkedIn', en: 'LinkedIn' },
  tiktok: { fr: 'TikTok', en: 'TikTok' },
  direct: { fr: 'Accès direct', en: 'Direct' },
};

const sourceLabel = (source: string, lang: Language) => SOURCE_LABEL[source]?.[lang] ?? source;

/** One value per day of the period (days without a visit count 0), for the visits sparkline. */
function dailySeries(report: AudienceReport): number[] {
  const byDay = new Map(report.by_day.map((d) => [d.day, d.visits]));
  const out: number[] = [];
  for (let d = report.from; d <= report.to; d = addDaysYmd(d, 1)) out.push(byDay.get(d) ?? 0);
  return out;
}

/**
 * Audience: what the posts bring — visits and sign-ups over the last 7 or 30
 * studio-local days, by source (where people came from) and by post (the
 * tracked link's `utm_content`). First-party measurement: no cookie.
 */
export function AudienceClient({ lang }: { lang: Language }) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const [period, setPeriod] = useState<Period>(7);
  const [report, setReport] = useState<AudienceReport | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Studio-local today, as the server's default range (the last 7 days) ends on it.
  const today = useRef<string | null>(null);

  // Switching period quickly can answer out of order: only the latest request may update the screen.
  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      let next: AudienceReport;
      if (period === 7 || !today.current) {
        next = await api<AudienceReport>('/audience');
        today.current = next.to;
      }
      if (period !== 7) next = await api<AudienceReport>(`/audience?from=${addDaysYmd(today.current, -(period - 1))}&to=${today.current}`);
      if (mine !== seq.current) return;
      setReport(next!);
      setLoadError(null);
    } catch (err) {
      if (mine !== seq.current) return;
      reportUnexpected(err, { action: 'load-audience', period });
      setLoadError(errorText(err, lang));
    }
  }, [lang, period]);

  useEffect(() => {
    void load();
  }, [load]);

  const head = (
    <PageHead
      title={t('Audience', 'Audience')}
      sub={t(
        'Ce que les publications rapportent : visites de gabee.app et inscriptions, par source et par post. Mesure sans cookie.',
        'What the posts bring: gabee.app visits and sign-ups, by source and by post. Measured without cookies.',
      )}
    >
      <div className="studio-filter" role="group" aria-label={t('Période', 'Period')}>
        {PERIODS.map((p) => (
          <button key={p} type="button" className={'chip' + (period === p ? ' on' : '')} aria-pressed={period === p} onClick={() => setPeriod(p)}>
            {L ? `${p} derniers jours` : `Last ${p} days`}
          </button>
        ))}
      </div>
    </PageHead>
  );

  if (!report) {
    return (
      <>
        {head}
        {loadError ? (
          <ErrorNotice lang={lang} message={loadError} onRetry={() => void load()} />
        ) : (
          <div className="studio-skeleton" aria-busy="true" aria-label={t('Chargement', 'Loading')}>
            <div className="tiles studio-tiles">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skel" style={{ height: 104 }} />
              ))}
            </div>
            <div className="skel" style={{ height: 200 }} />
          </div>
        )}
      </>
    );
  }

  const visits = report.by_day.reduce((s, d) => s + d.visits, 0);
  const signups = report.by_source.reduce((s, r) => s + r.signups, 0);
  const top = report.by_source[0] ?? null;
  const range = `${dayMonth(report.from, lang)} – ${dayMonth(report.to, lang)}`;
  const nf = (n: number) => n.toLocaleString(L ? 'fr-FR' : 'en-GB');

  return (
    <>
      {head}
      {loadError && <ErrorNotice lang={lang} message={loadError} onRetry={() => void load()} />}

      <div className="tiles studio-tiles">
        <div className="card tile" role="group" aria-label={t('Visites', 'Visits')}>
          <div className="tile-label" aria-hidden>
            {t('Visites', 'Visits')}
          </div>
          <div className="studio-tile-row">
            <div className="tile-num">{nf(visits)}</div>
            <Sparkline data={dailySeries(report)} w={110} h={34} color="var(--info)" fill />
          </div>
          <div className="tile-foot">{range}</div>
        </div>
        <div className="card tile" role="group" aria-label={t('Inscriptions', 'Sign-ups')}>
          <div className="tile-label" aria-hidden>
            {t('Inscriptions', 'Sign-ups')}
          </div>
          <div className="tile-num">{nf(signups)}</div>
          <div className="tile-foot">{t('comptes parents dont la source est connue', 'parent accounts with a known source')}</div>
        </div>
        <div className="card tile" role="group" aria-label={t('Première source', 'Top source')}>
          <div className="tile-label" aria-hidden>
            {t('Première source', 'Top source')}
          </div>
          <div className="tile-num studio-tile-text">{top ? sourceLabel(top.source, lang) : '—'}</div>
          <div className="tile-foot">
            {top
              ? L
                ? `${nf(top.visits)} visite${top.visits > 1 ? 's' : ''} · ${nf(top.signups)} inscription${top.signups > 1 ? 's' : ''}`
                : `${nf(top.visits)} visit${top.visits === 1 ? '' : 's'} · ${nf(top.signups)} sign-up${top.signups === 1 ? '' : 's'}`
              : t('aucune visite sur la période', 'no visit in this period')}
          </div>
        </div>
      </div>

      {report.by_source.length === 0 ? (
        <div className="card mt16">
          <EmptyState
            icon="📈"
            title={t('Pas encore de visite mesurée', 'No visit measured yet')}
            body={t(
              'Les visites apparaissent dès que quelqu’un ouvre gabee.app, par exemple depuis le lien suivi d’un post ou la bio TikTok.',
              'Visits appear as soon as someone opens gabee.app, for example from a post’s tracked link or the TikTok bio.',
            )}
          />
        </div>
      ) : (
        <div className="studio-audience-grid mt16">
          <div className="card tbl-wrap">
            <div className="card-head">
              <h2 id="aud-source" className="studio-card-title">
                {t('Par source', 'By source')}
              </h2>
            </div>
            <table className="tbl" aria-labelledby="aud-source">
              <thead>
                <tr>
                  <th scope="col">{t('Source', 'Source')}</th>
                  <th scope="col" className="num">
                    {t('Visites', 'Visits')}
                  </th>
                  <th scope="col" className="num">
                    {t('Inscriptions', 'Sign-ups')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.by_source.map((r) => (
                  <tr key={r.source}>
                    <td className="t-main studio-cell-wrap">{sourceLabel(r.source, lang)}</td>
                    <td className="num t-mono">{nf(r.visits)}</td>
                    <td className="num t-mono">{nf(r.signups)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card tbl-wrap">
            <div className="card-head">
              <h2 id="aud-post" className="studio-card-title">
                {t('Par publication', 'By post')}
              </h2>
            </div>
            {report.by_post.length === 0 ? (
              <p className="studio-journal-empty">
                {t('Aucune visite venue du lien suivi d’un post sur la période.', 'No visit came from a post’s tracked link in this period.')}
              </p>
            ) : (
              <table className="tbl" aria-labelledby="aud-post">
                <thead>
                  <tr>
                    <th scope="col">{t('Publication', 'Post')}</th>
                    <th scope="col" className="num">
                      {t('Visites', 'Visits')}
                    </th>
                    <th scope="col" className="num">
                      {t('Inscriptions', 'Sign-ups')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.by_post.map((r) => (
                    <tr key={r.content}>
                      <td className="studio-cell-wrap">
                        <PostCell post={r} lang={lang} />
                      </td>
                      <td className="num t-mono">{nf(r.visits)}</td>
                      <td className="num t-mono">{nf(r.signups)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function PostCell({ post, lang }: { post: AudienceReport['by_post'][number]; lang: Language }) {
  const L = lang === 'fr';
  if (post.draft) {
    return (
      <>
        <span className="t-main">{post.draft.topic}</span>
        <span className="t-sub studio-cell-sub">
          {PLATFORM_LABEL[post.draft.platform as 'linkedin' | 'tiktok'] ?? post.draft.platform} · {dayMonth(post.draft.date, lang)}
        </span>
      </>
    );
  }
  if (post.content === 'bio') {
    return (
      <>
        <span className="t-main">{L ? 'Lien de la bio TikTok' : 'TikTok bio link'}</span>
        <span className="t-sub studio-cell-sub">{L ? 'TikTok ne permet pas de lien par post' : 'TikTok has no per-post link'}</span>
      </>
    );
  }
  return (
    <>
      <span className="t-main">{post.content}</span>
      <span className="t-sub studio-cell-sub">{L ? 'Post introuvable (supprimé ou lien d’une autre campagne)' : 'Post not found (deleted, or another campaign’s link)'}</span>
    </>
  );
}
