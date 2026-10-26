'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { Language } from '@gabee/types';
import type { DraftDto, SlotDto, TodayBoard } from '@/lib/server/content-studio/drafts';
import type { PublishContext } from '@/lib/server/content-studio/publish-links';
import type { WeekDto } from '@/lib/server/content-studio/weeks';
import { EmptyState, PageHead } from '../_shell/primitives';
import { AIcon } from '../_shell/icons';
import { api, reportUnexpected } from './_components/api';
import { ErrorNotice, Notice } from './_components/ErrorNotice';
import { errorText } from './_components/errors';
import { FORMAT_LABEL, PLATFORM_LABEL, SLOT_STATUS, longDay } from './_components/format';
import { PendingPostCard, PostCard } from './_components/PostCard';
import { RelaunchProposals, StartWeekButton, launchTarget, weekLooksStuck, type Failure, type WeeksResponse } from './_components/StartWeek';

type Board = TodayBoard & PublishContext;
type Data = { board: Board; weeks: WeeksResponse };

/** While the scheduler writes a draft, re-read the board this often (no faster: it is a 1–2 minute job). */
const GENERATING_POLL_MS = 15_000;
/** After a launch whose answer was cut off, re-read the board this often until its week moves on. */
const LAUNCH_POLL_MS = 15_000;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Aujourd'hui: the day's line and one card per platform, yesterday's
 * unfinished posts on top, and an empty state that says what to do next.
 */
export function TodayClient({ lang }: { lang: Language }) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [launchFailure, setLaunchFailure] = useState<Failure | null>(null);

  const load = useCallback(async () => {
    try {
      const [board, weeks] = await Promise.all([api<Board>('/today'), api<WeeksResponse>('/weeks')]);
      setData({ board, weeks });
      setLoadError(null);
      // The launched week has moved on (proposals ready, or further): the launch's error is history.
      const planned = weeks[launchTarget(weeks).which];
      if (planned && planned.status !== 'proposing') setLaunchFailure(null);
    } catch (err) {
      reportUnexpected(err, { action: 'load-today' });
      setLoadError(errorText(err, lang));
    }
  }, [lang]);

  useEffect(() => {
    void load();
  }, [load]);

  // A draft is being written (its lock is live) by the scheduler, not by a click here: refresh
  // until it lands. A `generating` draft without a live lock is a dead run: no polling, the card
  // offers Réessayer instead.
  const generating = !!data && [data.board.slot, data.board.yesterday].some((s) => s?.drafts.some((d) => d.generating));
  useEffect(() => {
    if (!generating) return;
    const id = window.setInterval(() => void load(), GENERATING_POLL_MS);
    return () => window.clearInterval(id);
  }, [generating, load]);

  // A launch from here lost its answer (connection cut, or the proxy gave up: Cloudflare stops
  // waiting after 100 s) while the Strategist may still be writing: re-read until the week leaves
  // `proposing`. Not once it looks stuck — no run can be live then, and Semaine offers to relaunch.
  const plannedWeek = data ? data.weeks[launchTarget(data.weeks).which] : null;
  const awaitingLaunch =
    !!launchFailure && !launchFailure.ended && plannedWeek?.status === 'proposing' && !weekLooksStuck(plannedWeek);
  useEffect(() => {
    if (!awaitingLaunch) return;
    const id = window.setInterval(() => void load(), LAUNCH_POLL_MS);
    return () => window.clearInterval(id);
  }, [awaitingLaunch, load]);

  /** A card changed its draft: show it at once, then re-read the board (slot status, "all published"). */
  const replaceDraft = (next: DraftDto) => {
    setData((d) => {
      if (!d) return d;
      const swap = (s: SlotDto | null) => (s && s.id === next.slot_id ? { ...s, drafts: s.drafts.map((x) => (x.id === next.id ? next : x)) } : s);
      return { ...d, board: { ...d.board, slot: swap(d.board.slot), yesterday: swap(d.board.yesterday) } };
    });
    void load();
  };

  const head = (
    <PageHead title={t("Aujourd'hui", 'Today')} sub={data ? capitalize(longDay(data.board.day, lang)) : undefined}>
      <Link className="btn secondary" href="/admin/communication/semaine">
        <AIcon name="dashboard" />
        {t('Voir la semaine', 'See the week')}
      </Link>
    </PageHead>
  );

  if (loadError && !data) {
    return (
      <>
        {head}
        <ErrorNotice lang={lang} message={loadError} onRetry={() => void load()} />
      </>
    );
  }
  if (!data) {
    return (
      <>
        {head}
        <div className="studio-skeleton" aria-busy="true" aria-label={t('Chargement', 'Loading')}>
          <div className="skel" style={{ height: 96 }} />
          <div className="studio-cards">
            <div className="skel" style={{ height: 320 }} />
            <div className="skel" style={{ height: 320 }} />
          </div>
        </div>
      </>
    );
  }

  const { board, weeks } = data;
  return (
    <>
      {head}
      {loadError && <ErrorNotice lang={lang} message={loadError} onRetry={() => void load()} />}

      {board.yesterday && (
        <section className="studio-yesterday" aria-labelledby="studio-yesterday-h">
          <h2 id="studio-yesterday-h" className="studio-section-title">
            {t('À terminer depuis hier', 'Left over from yesterday')}
            <span className="card-title-sub"> · {longDay(board.yesterday.date, lang)}</span>
          </h2>
          <p className="studio-muted-text">{board.yesterday.topic}</p>
          <div className="studio-cards">
            {board.yesterday.drafts.map((d) => (
              <PostCard key={d.id} draft={d} lang={lang} onChange={replaceDraft} publish={board} />
            ))}
          </div>
        </section>
      )}

      <TodayBody
        board={board}
        weeks={weeks}
        lang={lang}
        launchFailure={launchFailure}
        onDraft={replaceDraft}
        onStarted={() => router.push('/admin/communication/semaine')}
        onLaunchFailed={(failure) => {
          setLaunchFailure(failure);
          void load();
        }}
        onReload={() => void load()}
      />
    </>
  );
}

function TodayBody({
  board,
  weeks,
  lang,
  launchFailure,
  onDraft,
  onStarted,
  onLaunchFailed,
  onReload,
}: {
  board: Board;
  weeks: WeeksResponse;
  lang: Language;
  launchFailure: Failure | null;
  onDraft: (d: DraftDto) => void;
  onStarted: () => void;
  onLaunchFailed: (failure: Failure) => void;
  onReload: () => void;
}) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const weekLink = (
    <Link className="btn" href="/admin/communication/semaine">
      {t('Ouvrir la semaine', 'Open the week')}
    </Link>
  );
  const slot = board.slot;

  // No week covers today.
  if (board.week_status === null) {
    const target = launchTarget(weeks);
    if (target.exists) {
      // Sunday: today's week is over or never ran, next week is already being planned —
      // possibly by a launch from here that just failed.
      const planned = weeks[target.which]!;
      return (
        <div className="card">
          <EmptyState
            icon="🗓️"
            title={t('Rien de prévu aujourd’hui', 'Nothing planned today')}
            body={t('La semaine prochaine est en préparation dans l’écran Semaine.', 'Next week is being planned on the Week screen.')}
            action={launchFailure ? <LaunchFailure week={planned} failure={launchFailure} lang={lang} onDone={onStarted} link={weekLink} /> : weekLink}
          />
        </div>
      );
    }
    return (
      <div className="card">
        <EmptyState
          icon="🗓️"
          title={t('Aucune semaine en cours', 'No week in progress')}
          body={
            target.which === 'next'
              ? t(
                  'Lancez la semaine prochaine : Gabee propose 3 directions, vous en choisissez une, puis les posts arrivent chaque matin.',
                  'Start next week: Gabee proposes 3 directions, you pick one, then the posts arrive every morning.',
                )
              : t(
                  `Lancez la semaine : Gabee propose 3 directions, vous en choisissez une, puis les posts arrivent chaque matin à partir de demain (${target.days} jour${target.days > 1 ? 's' : ''}).`,
                  `Start the week: Gabee proposes 3 directions, you pick one, then the posts arrive every morning from tomorrow (${target.days} day${target.days > 1 ? 's' : ''}).`,
                )
          }
          action={<StartWeekButton lang={lang} onStarted={onStarted} onFailed={onLaunchFailed} />}
        />
      </div>
    );
  }

  if (board.week_status === 'skipped') {
    return (
      <div className="card">
        <EmptyState icon="⏸️" title={t('Semaine sautée', 'Week skipped')} body={t('Aucun post n’est prévu cette semaine.', 'No posts are planned this week.')} />
      </div>
    );
  }

  if (board.week_status !== 'validated') {
    const proposing = weeks.current?.status === 'proposing' ? weeks.current : null;
    return (
      <div className="card">
        <EmptyState
          icon="📝"
          title={t('La semaine n’est pas encore validée', 'The week is not validated yet')}
          body={t(
            'Choisissez une direction et validez les titres : les brouillons du jour seront rédigés juste après.',
            "Pick a direction and validate the titles: the day's drafts are written right after.",
          )}
          action={
            proposing && launchFailure ? <LaunchFailure week={proposing} failure={launchFailure} lang={lang} onDone={onStarted} link={weekLink} /> : weekLink
          }
        />
      </div>
    );
  }

  if (!slot) {
    return (
      <div className="card">
        <EmptyState
          icon="🌙"
          title={t('Rien de prévu aujourd’hui', 'Nothing planned today')}
          body={t('Le prochain post sera rédigé demain matin vers 4 h.', 'The next post will be written tomorrow around 4 am.')}
          action={weekLink}
        />
      </div>
    );
  }

  if (slot.status === 'skipped') {
    return (
      <div className="card">
        <EmptyState
          icon="⏭️"
          title={t('Jour sauté', 'Day skipped')}
          body={slot.skip_reason ? t(`Raison : ${slot.skip_reason}`, `Reason: ${slot.skip_reason}`) : undefined}
          action={weekLink}
        />
      </div>
    );
  }

  const status = SLOT_STATUS[slot.status];
  const missing = slot.platforms.filter((p) => !slot.drafts.some((d) => d.platform === p.platform));
  return (
    <section aria-labelledby="studio-today-topic">
      <div className="card card-pad studio-day">
        <div className="studio-day-meta">
          <span className="chip static">{FORMAT_LABEL[slot.format][lang]}</span>
          {slot.platforms.map((p) => (
            <span key={p.platform} className="chip static">
              {PLATFORM_LABEL[p.platform]} · {p.language.toUpperCase()}
            </span>
          ))}
          {status && (
            <span className={`badge ${status.tone}`}>
              <i className="bdot" />
              {status.label[lang]}
            </span>
          )}
        </div>
        <h2 id="studio-today-topic" className="studio-day-topic">
          {slot.topic}
        </h2>
        {slot.angle && <p className="studio-day-angle">{slot.angle}</p>}
      </div>

      {slot.status === 'done' && (
        <Notice tone="ok">{t('Tous les posts du jour sont publiés. Merci !', "All of today's posts are published. Thank you!")}</Notice>
      )}

      <div className="studio-cards">
        {slot.drafts.map((d) => (
          <PostCard key={d.id} draft={d} lang={lang} onChange={onDraft} publish={board} />
        ))}
        {missing.map((p) => (
          <PendingPostCard key={p.platform} platform={p.platform} language={p.language} lang={lang} />
        ))}
      </div>
      {missing.length > 0 && (
        <p className="studio-muted-text studio-refresh">
          <button type="button" className="btn ghost sm" onClick={onReload}>
            <AIcon name="refresh" size={14} />
            {t('Actualiser', 'Refresh')}
          </button>
        </p>
      )}
    </section>
  );
}

/**
 * A launch from this screen failed and left its week behind. If the answer
 * proves the Strategist run ended, offer to run it again here; otherwise
 * (connection cut: it may still be running) say so next to the week link.
 */
function LaunchFailure({
  week,
  failure,
  lang,
  onDone,
  link,
}: {
  week: WeekDto;
  failure: Failure;
  lang: Language;
  onDone: () => void;
  link: React.ReactNode;
}) {
  if (week.status === 'proposing' && failure.ended) {
    return <RelaunchProposals week={week} lang={lang} failure={failure.message} onDone={onDone} />;
  }
  return (
    <div className="col gap12 studio-start">
      <ErrorNotice lang={lang} message={failure.message} />
      {link}
    </div>
  );
}
