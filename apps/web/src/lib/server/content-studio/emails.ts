import type { ReportNarrative } from '@gabee/types';
import type { DraftDto } from './drafts';
import type { WeekDto } from './weeks';

/**
 * Content Studio emails (spec "Notifications"): pure builders, French in 1a.
 * Each carries exactly ONE call-to-action link to the admin app and never a
 * media (presigned) URL. Every interpolated value is HTML-escaped; text parts
 * never repeat URLs found inside drafts.
 */

export type EmailContent = { subject: string; text: string; html: string };

export type AudienceSummary = { visits: number; signups: number; top_sources: { source: string; visits: number }[] };

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

const dateFmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { ...opts, timeZone: 'UTC' });
const shortDay = (ymd: string) => dateFmt({ day: 'numeric', month: 'short' }).format(new Date(`${ymd}T00:00:00Z`));
const longDay = (ymd: string) => dateFmt({ weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(`${ymd}T00:00:00Z`));
/** `2026-10` → `d’octobre 2026`, `2026-11` → `de novembre 2026`. */
function ofMonth(yyyyMm: string): string {
  const name = dateFmt({ month: 'long', year: 'numeric' }).format(new Date(`${yyyyMm}-01T00:00:00Z`));
  return /^[aeiouy]/i.test(name) ? `d’${name}` : `de ${name}`;
}

/**
 * French typography: a no-break space before « : » « % » « » » and after « « »,
 * a narrow no-break space before « ; ! ? » — so a line never wraps before
 * them. Only a space that is already there is replaced (URLs are untouched).
 */
export function frenchSpacing(s: string): string {
  return s
    .replace(/ ([:%»])/g, '\u00a0$1')
    .replace(/« /g, '«\u00a0')
    .replace(/ ([;!?])/g, '\u202f$1');
}

/** Totals and the three best sources of a `getAudience` result. */
export function summariseAudience(a: { bySource: { source: string; visits: number; signups: number }[] }): AudienceSummary {
  return {
    visits: a.bySource.reduce((n, s) => n + s.visits, 0),
    signups: a.bySource.reduce((n, s) => n + s.signups, 0),
    top_sources: [...a.bySource]
      .sort((x, y) => y.visits - x.visits)
      .slice(0, 3)
      .map((s) => ({ source: s.source, visits: s.visits })),
  };
}

// ── Layout (same inline-style blocks as the weekly digest) ──

type Block = { title?: string; lines: string[] };

function render(subjectIn: string, headingIn: string, blocksIn: Block[], ctaIn: { label: string; href: string }): EmailContent {
  const subject = frenchSpacing(subjectIn);
  const heading = frenchSpacing(headingIn);
  const cta = { label: frenchSpacing(ctaIn.label), href: ctaIn.href };
  // A block with nothing to say is dropped rather than shown empty.
  const blocks = blocksIn
    .filter((b) => b.lines.length > 0)
    .map((b) => ({ title: b.title === undefined ? undefined : frenchSpacing(b.title), lines: b.lines.map(frenchSpacing) }));
  const text = [
    heading,
    ...blocks.map((b) => [b.title ? `\n${b.title}` : '', ...b.lines.map((l) => `- ${l}`)].filter(Boolean).join('\n')),
    `\n${cta.label}\u00a0: ${cta.href}`,
  ].join('\n');
  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
  <h2 style="margin:0 0 14px">${escapeHtml(heading)}</h2>
${blocks
  .map(
    (b) => `  <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:14px 16px;margin-bottom:16px">
${b.title ? `    <div style="font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#475569;margin-bottom:6px">${escapeHtml(b.title)}</div>\n` : ''}    <table style="width:100%;border-collapse:collapse">
${b.lines.map((l) => `      <tr><td style="padding:5px 0;font-size:14px">${escapeHtml(l)}</td></tr>`).join('\n')}
    </table>
  </div>`,
  )
  .join('\n')}
  <a href="${escapeHtml(cta.href)}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:10px;font-size:14px">${escapeHtml(cta.label)} →</a>
  <div style="color:#94a3b8;font-size:11px;margin-top:18px">Message automatique · Gabee Communication</div>
</div>`;
  return { subject, text, html };
}

// ── Builders ──

export function weekProposalsEmail(input: {
  week: WeekDto;
  proposals: NonNullable<WeekDto['proposals']>;
  report: ReportNarrative;
  audience: AudienceSummary;
  link: string;
}): EmailContent {
  const { week, proposals, report, audience, link } = input;
  const sources = audience.top_sources.map((s) => `${s.source} (${s.visits})`).join(', ');
  const blocks: Block[] = [
    {
      title: 'Bilan de la semaine passée',
      lines: [
        report.headline,
        `${audience.visits} visites, ${audience.signups} inscriptions${sources ? ` — sources : ${sources}` : ''}`,
        ...report.highlights,
        ...report.watch_outs.map((w) => `À surveiller : ${w}`),
      ],
    },
    {
      title: 'Trois directions proposées',
      lines: proposals.map((p, i) => `${i + 1}. ${p.title} — ${p.rationale}`),
    },
  ];
  return render(
    `Gabee · Semaine du ${shortDay(week.starts_on)} — ${proposals.length} directions à choisir`,
    `Choisissez la direction de la semaine du ${shortDay(week.starts_on)}`,
    blocks,
    { label: 'Choisir une direction', href: link },
  );
}

const EXCERPT = 200;
function excerptOf(payload: DraftDto['payload']): string {
  if (!payload) return '';
  const raw = 'body' in payload ? payload.body : payload.caption;
  const clean = raw.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  return clean.length > EXCERPT ? `${clean.slice(0, EXCERPT).trimEnd()}…` : clean;
}

const PLATFORM_LABEL: Record<string, string> = { linkedin: 'LinkedIn', tiktok: 'TikTok' };
const STATUS_LABEL: Record<string, string> = {
  ready: 'prêt à relire',
  approved: 'approuvé',
  stale: 'à revoir (le sujet a changé)',
  generating: 'en cours d’écriture',
  published: 'publié',
};

function draftLine(d: DraftDto): string {
  const head = `${PLATFORM_LABEL[d.platform] ?? d.platform} (${d.language.toUpperCase()})`;
  if (d.status === 'failed') return `${head} — échec : ${d.error ?? 'raison inconnue'}. Ouvrez la page pour relancer.`;
  const notes = [STATUS_LABEL[d.status] ?? d.status];
  if (d.platform === 'tiktok' && !d.media) notes.push('vidéo à fournir');
  const ex = excerptOf(d.payload);
  return `${head} — ${notes.join(', ')}${ex ? ` : « ${ex} »` : ''}`;
}

export function dailyDraftsEmail(input: { day: string; topic: string; drafts: DraftDto[]; link: string }): EmailContent {
  const { day, topic, drafts, link } = input;
  return render(
    `Gabee · Les brouillons du ${longDay(day)} sont prêts`,
    `Les brouillons du ${longDay(day)} sont prêts`,
    [{ title: `Sujet : ${topic}`, lines: drafts.map(draftLine) }],
    { label: 'Relire et approuver', href: link },
  );
}

/**
 * Sunday reminder for next week, still waiting on the owner: a direction to
 * pick (`proposals_ready`, `direction_set`) or titles to validate
 * (`titles_ready`). `firstDay` is the week's first planned day.
 */
export function weekReminderEmail(input: { status: string; firstDay: string; link: string }): EmailContent {
  const from = `à partir du ${longDay(input.firstDay)}`;
  if (input.status === 'titles_ready') {
    return render(
      'Gabee · Les titres de la semaine attendent votre validation',
      'La semaine n’est pas encore validée',
      [{ lines: [`Les titres de chaque jour sont prêts. Sans validation, aucun brouillon ne sera écrit ${from}.`] }],
      { label: 'Valider la semaine', href: input.link },
    );
  }
  return render(
    'Gabee · La direction de la semaine attend votre choix',
    'La semaine n’a pas encore de direction',
    [{ lines: [`Trois directions sont proposées. Sans choix, aucun brouillon ne sera écrit ${from}.`] }],
    { label: 'Choisir une direction', href: input.link },
  );
}

export function dayReminderEmail(input: { pending: { approve: number; publish: number }; link: string }): EmailContent {
  const { approve, publish } = input.pending;
  const lines: string[] = [];
  if (approve > 0) lines.push(`${approve} brouillon${approve > 1 ? 's' : ''} à relire et approuver`);
  if (publish > 0) lines.push(`${publish} post${publish > 1 ? 's' : ''} approuvé${publish > 1 ? 's' : ''} à publier`);
  return render('Gabee · Il reste des posts à traiter aujourd’hui', 'Il reste des posts à traiter', [{ lines }], {
    label: 'Ouvrir les brouillons',
    href: input.link,
  });
}

/** `month` is `YYYY-MM` (studio-local); the email names it (« d’octobre 2026 »). */
export function budgetAlertEmail(input: { spentUsd: number; budgetUsd: number; month: string; link: string }): EmailContent {
  const pct = input.budgetUsd > 0 ? Math.round((input.spentUsd / input.budgetUsd) * 100) : 0;
  const month = ofMonth(input.month);
  return render(
    `Gabee · Budget IA ${month} à ${pct} %`,
    `Le budget IA ${month} est à ${pct} %`,
    [{ lines: [`${input.spentUsd.toFixed(2)} $ dépensés sur ${input.budgetUsd.toFixed(2)} $.`, 'Pour continuer, relevez le budget dans les réglages.'] }],
    { label: 'Ouvrir les réglages', href: input.link },
  );
}

export function jobFailedEmail(input: { jobKey: string; periodKey: string; error: string; link: string }): EmailContent {
  return render(
    `Gabee · La tâche ${input.jobKey} a échoué`,
    `La tâche ${input.jobKey} a échoué (${input.periodKey})`,
    [{ lines: [input.error, 'Ouvrez le journal pour la relancer.'] }],
    { label: 'Ouvrir le journal', href: input.link },
  );
}
