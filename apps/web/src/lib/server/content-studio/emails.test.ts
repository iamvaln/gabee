import test from 'node:test';
import assert from 'node:assert/strict';
import type { DraftDto } from './drafts';
import type { WeekDto } from './weeks';
import {
  budgetAlertEmail,
  dailyDraftsEmail,
  dayReminderEmail,
  jobFailedEmail,
  summariseAudience,
  weekProposalsEmail,
  frenchSpacing,
  weekReminderEmail,
  type EmailContent,
} from './emails';

const LINK = 'https://admin.gabee.app/admin/communication/semaine';
const EVIL = '<script>alert("x")</script> & "q"';

const proposals = [0, 1, 2].map((i) => ({
  title: i === 0 ? EVIL : `Direction ${i}`,
  rationale: `Parce que ${i}`,
  evidence: ['e'],
  sample_angles: ['a'],
}));
const week = { id: 'w', starts_on: '2026-11-03', first_day: '2026-11-03', days_in_week: 7, status: 'proposals_ready', proposals } as unknown as WeekDto;
const report = { headline: EVIL, highlights: [EVIL], watch_outs: ['Peu de visites'] };
const audience = { visits: 120, signups: 4, top_sources: [{ source: EVIL, visits: 50 }] };

const draft = (over: Partial<DraftDto>): DraftDto =>
  ({
    id: 'd',
    slot_id: 's',
    platform: 'linkedin',
    language: 'fr',
    status: 'ready',
    payload: { body: `${'mot '.repeat(80)}https://gabee.app/fr?utm_source=linkedin`, hashtags: [], link_target: 'landing' },
    media: null,
    tracked_url: 'https://gabee.app/fr?utm_source=linkedin',
    error: null,
    ...over,
  }) as DraftDto;

function all(): EmailContent[] {
  return [
    weekProposalsEmail({ week, proposals, report, audience, link: LINK }),
    dailyDraftsEmail({
      day: '2026-10-30',
      topic: EVIL,
      drafts: [
        draft({}),
        draft({ platform: 'tiktok', status: 'failed', error: EVIL, payload: null }),
      ],
      link: 'https://admin.gabee.app/admin/communication',
    }),
    weekReminderEmail({ status: 'proposals_ready', firstDay: '2026-11-03', link: 'https://admin.gabee.app/admin/communication/semaine' }),
    dayReminderEmail({ pending: { approve: 2, publish: 1 }, link: 'https://admin.gabee.app/admin/communication' }),
    budgetAlertEmail({ spentUsd: 41.5, budgetUsd: 50, month: '2026-10', link: 'https://admin.gabee.app/admin/communication/reglages' }),
    jobFailedEmail({ jobKey: 'day.generate', periodKey: '2026-10-30', error: EVIL, link: 'https://admin.gabee.app/admin/communication/journal' }),
  ];
}

test('emails escape agent text and contain one admin link', () => {
  for (const e of all()) {
    assert.ok(!e.html.includes('<script>'), e.subject);
    assert.ok(!e.subject.includes('<'), e.subject);
    assert.equal((e.html.match(/<a /g) ?? []).length, 1, e.subject);
    assert.equal((e.text.match(/https?:\/\//g) ?? []).length, 1, e.subject);
    assert.match(e.html, /href="https:\/\/admin\.gabee\.app\/admin\/communication/);
  }
  const proposalsMail = all()[0]!;
  assert.ok(proposalsMail.html.includes('&lt;script&gt;'));
  assert.match(proposalsMail.subject, /Semaine du 3 nov\./);
});

test('no email contains an r2 url', () => {
  for (const e of all()) {
    for (const part of [e.subject, e.text, e.html]) {
      assert.ok(!/r2\.|cloudflarestorage|X-Amz/i.test(part));
    }
  }
});

test('daily email shows excerpt, status and the tiktok video notice', () => {
  const e = dailyDraftsEmail({
    day: '2026-10-30',
    topic: 'Sujet',
    drafts: [draft({}), draft({ platform: 'tiktok', payload: { caption: 'Légende', hashtags: [], on_screen_text: [], mode: 'filming_plan' }, media: null })],
    link: 'https://admin.gabee.app/admin/communication',
  });
  assert.match(e.subject, /vendredi 30 oct\./);
  assert.match(e.text, /vidéo à fournir/);
  assert.ok(!e.text.includes('utm_source'));
  assert.ok(e.text.includes('…'));
});

test('summariseAudience totals visits and signups and keeps top sources', () => {
  const s = summariseAudience({
    bySource: [
      { source: 'a', visits: 5, signups: 1 },
      { source: 'b', visits: 9, signups: 2 },
      { source: 'c', visits: 1, signups: 0 },
      { source: 'd', visits: 1, signups: 0 },
    ],
  });
  assert.deepEqual(s, { visits: 16, signups: 3, top_sources: [{ source: 'b', visits: 9 }, { source: 'a', visits: 5 }, { source: 'c', visits: 1 }] });
});

const NBSP = '\u00a0';
const NNBSP = '\u202f';

test('frenchSpacing puts no-break spaces before : ; ! ? % » and after «, never inside URLs', () => {
  assert.equal(
    frenchSpacing('Sujet : « Lire » ; vite ! Prêt ? 80 %'),
    `Sujet${NBSP}: «${NBSP}Lire${NBSP}»${NNBSP}; vite${NNBSP}! Prêt${NNBSP}? 80${NBSP}%`,
  );
  assert.equal(frenchSpacing('https://gabee.app/fr?utm_source=x'), 'https://gabee.app/fr?utm_source=x');
});

test('every email uses French spacing in its subject, text and html', () => {
  for (const e of all()) {
    for (const part of [e.subject, e.text, e.html]) {
      assert.ok(!/ [:;!?%»]/.test(part.replace(/https?:\/\/\S+/g, '')), `${e.subject}: ${part.slice(0, 120)}`);
    }
  }
  assert.match(all()[1]!.text, new RegExp(`Relire et approuver${NBSP}: https://`));
});

test('the daily email subject reads « Les brouillons du … sont prêts »', () => {
  assert.match(all()[1]!.subject, /^Gabee · Les brouillons du vendredi 30 oct\. sont prêts$/);
});

test('the week reminder names the first planned day, not always Monday', () => {
  const partial = weekReminderEmail({ status: 'proposals_ready', firstDay: '2026-10-29', link: LINK });
  assert.match(partial.text, /aucun brouillon ne sera écrit à partir du jeudi 29 oct\./);
  assert.ok(!/lundi/.test(partial.text));
  const titles = weekReminderEmail({ status: 'titles_ready', firstDay: '2026-11-02', link: LINK });
  assert.match(titles.subject, /titres de la semaine attendent votre validation/);
  assert.match(titles.text, /Sans validation, aucun brouillon ne sera écrit à partir du lundi 2 nov\./);
  assert.match(titles.html, /Valider la semaine/);
});

test('the budget email names the month instead of its ISO key', () => {
  const e = budgetAlertEmail({ spentUsd: 41.5, budgetUsd: 50, month: '2026-10', link: LINK });
  assert.equal(e.subject, `Gabee · Budget IA d’octobre 2026 à 83${NBSP}%`);
  assert.ok(!e.text.includes('2026-10'));
  assert.match(e.text, /41\.50/);
  assert.match(budgetAlertEmail({ spentUsd: 40, budgetUsd: 50, month: '2026-11', link: LINK }).subject, /Budget IA de novembre 2026/);
});

test('a reminder with nothing pending renders no empty block', () => {
  const e = dayReminderEmail({ pending: { approve: 0, publish: 0 }, link: LINK });
  assert.ok(!e.html.includes('<table'), 'no empty table');
  const one = dayReminderEmail({ pending: { approve: 1, publish: 0 }, link: LINK });
  assert.match(one.text, /1 brouillon à relire et approuver/);
  assert.ok(!/publier/.test(one.text));
});
