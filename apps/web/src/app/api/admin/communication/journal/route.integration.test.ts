import '../../../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContentDraft, createContentSlot, createContentWeek, createTestClient, resetDb, seedContentStudio } from '@gabee/db/testing';
import { createLoginableParent } from '@/test/factories';
import { adminCookie, parentCookie, parentToken, webRequest } from '@/test/auth';
import { GET as journal } from './route';

const prisma = createTestClient();
const U = 'http://localhost/api/admin/communication/journal';
let cookie: { name: string; value: string };

beforeEach(async () => {
  await resetDb(prisma);
  await seedContentStudio(prisma);
  const { parent } = await createLoginableParent(prisma, { role: 'admin' });
  cookie = adminCookie(await parentToken(parent.id, parent.email));
});
after(() => prisma.$disconnect());

const at = (iso: string) => new Date(iso);

async function versionOf(agentKey: string): Promise<string> {
  return (await prisma.agentVersion.findFirstOrThrow({ where: { agentKey } })).id;
}

test('journal requires an admin', async () => {
  assert.equal((await journal(webRequest(U, { method: 'GET' }), undefined)).status, 401);
  const { parent } = await createLoginableParent(prisma, { role: 'parent' });
  const pc = parentCookie(await parentToken(parent.id, parent.email));
  assert.equal((await journal(webRequest(U, { method: 'GET', cookie: pc }), undefined)).status, 403);
});

test('journal lists job and agent runs newest first, with duration, cost and the full error', async () => {
  await prisma.jobRun.createMany({
    data: [
      { jobKey: 'week.email', periodKey: 'week:2026-10-26', status: 'succeeded', attempts: 0, startedAt: at('2026-10-25T06:00:00Z'), finishedAt: at('2026-10-25T06:00:04Z') },
      {
        jobKey: 'day.generate',
        periodKey: 'day:2026-10-28',
        status: 'abandoned',
        attempts: 4,
        error: 'AI unavailable: claude-opus-5-5: overloaded',
        startedAt: at('2026-10-28T03:40:00Z'),
        finishedAt: at('2026-10-28T03:41:30Z'),
      },
      { jobKey: 'day.notify', periodKey: 'day:2026-10-28', status: 'running', attempts: 0, startedAt: at('2026-10-28T04:00:00Z') },
      // An hourly budget check that went fine says nothing: it is left out (24 a day would bury the rest).
      { jobKey: 'budget.check', periodKey: 'hour:2026-10-28T05', status: 'succeeded', startedAt: at('2026-10-28T04:30:00Z'), finishedAt: at('2026-10-28T04:30:01Z') },
      { jobKey: 'budget.check', periodKey: 'hour:2026-10-28T06', status: 'failed', attempts: 1, error: 'boom', startedAt: at('2026-10-28T05:30:00Z'), finishedAt: at('2026-10-28T05:30:01Z') },
    ],
  });

  const week = await createContentWeek(prisma, { startsOn: at('2026-10-26'), firstDay: at('2026-10-26'), status: 'validated' });
  const slot = await createContentSlot(prisma, week.id, { date: at('2026-10-28'), topic: 'Compter les courses' });
  const draft = await createContentDraft(prisma, slot.id, { platform: 'linkedin' });

  const failedRun = await prisma.agentRun.create({
    data: {
      agentKey: 'writer_linkedin',
      agentVersionId: await versionOf('writer_linkedin'),
      origin: 'scheduled_job',
      subjectKind: 'draft',
      subjectId: draft.id,
      inputHash: 'h1',
      input: {},
      status: 'invalid_output',
      errorCode: 'schema_mismatch',
      errorMessage: 'The AI answer did not match the expected format. '.repeat(10).trim(),
      latencyMs: 41_000,
      startedAt: at('2026-10-28T03:40:10Z'),
      finishedAt: at('2026-10-28T03:40:51Z'),
    },
  });
  const okRun = await prisma.agentRun.create({
    data: {
      agentKey: 'strategist',
      agentVersionId: await versionOf('strategist'),
      origin: 'user_action',
      subjectKind: 'week_titles',
      subjectId: week.id,
      inputHash: 'h2',
      input: {},
      status: 'succeeded',
      latencyMs: 62_000,
      startedAt: at('2026-10-25T09:00:00Z'),
      finishedAt: at('2026-10-25T09:01:02Z'),
    },
  });
  const usage = (agentRunId: string, costUsd: number, status = 'succeeded') => ({
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    purpose: 'post_linkedin',
    task: 'post_linkedin',
    agentRunId,
    costUsd,
    status,
  });
  await prisma.aiUsage.createMany({ data: [usage(failedRun.id, 0.0123, 'invalid_output'), usage(failedRun.id, 0.0101, 'invalid_output'), usage(okRun.id, 0.3)] });

  const res = await journal(webRequest(U, { method: 'GET', cookie }), undefined);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.timezone, 'Africa/Douala');

  assert.deepEqual(
    body.jobs.map((j: { job_key: string; status: string }) => [j.job_key, j.status]),
    [
      ['budget.check', 'failed'],
      ['day.notify', 'running'],
      ['day.generate', 'abandoned'],
      ['week.email', 'succeeded'],
    ],
  );
  const abandoned = body.jobs.find((j: { status: string }) => j.status === 'abandoned');
  assert.equal(abandoned.error, 'AI unavailable: claude-opus-5-5: overloaded');
  assert.equal(abandoned.alert, 'none', 'no alert row recorded');
  assert.equal(body.jobs.find((j: { job_key: string }) => j.job_key === 'week.email').alert, null, 'only abandoned jobs carry an alert status');
  assert.equal(abandoned.attempts, 4);
  assert.equal(abandoned.duration_ms, 90_000);
  assert.equal(abandoned.period_key, 'day:2026-10-28');
  assert.equal(body.jobs.find((j: { status: string }) => j.status === 'running').duration_ms, null);

  assert.deepEqual(
    body.agents.map((a: { agent_key: string }) => a.agent_key),
    ['writer_linkedin', 'strategist'],
  );
  const [failed, ok] = body.agents;
  assert.equal(failed.status, 'invalid_output');
  assert.equal(failed.error_code, 'schema_mismatch');
  assert.equal(failed.error_message.length, 'The AI answer did not match the expected format. '.repeat(10).trim().length, 'the message is not cut');
  assert.equal(failed.cost_usd, 0.0224);
  assert.equal(failed.ai_calls, 2);
  assert.equal(failed.duration_ms, 41_000);
  assert.deepEqual(failed.subject, { kind: 'draft', id: draft.id, date: '2026-10-28', platform: 'linkedin', topic: 'Compter les courses' });
  assert.equal(ok.cost_usd, 0.3);
  assert.deepEqual(ok.subject, { kind: 'week_titles', id: week.id, date: '2026-10-26', platform: null, topic: null });
});

test('journal keeps the last 50 of each', async () => {
  const base = Date.parse('2026-10-01T00:00:00Z');
  await prisma.jobRun.createMany({
    data: Array.from({ length: 55 }, (_, i) => ({
      jobKey: 'day.remind',
      periodKey: `day:2026-10-01@${String(i).padStart(2, '0')}`,
      status: 'succeeded',
      startedAt: new Date(base + i * 60_000),
      finishedAt: new Date(base + i * 60_000 + 1000),
    })),
  });
  const body = await (await journal(webRequest(U, { method: 'GET', cookie }), undefined)).json();
  assert.equal(body.jobs.length, 50);
  assert.equal(body.jobs[0].period_key, 'day:2026-10-01@54', 'newest first');
});

test('journal says whether the abandoned job’s alert email really left', async () => {
  const at2 = (iso: string) => new Date(iso);
  await prisma.jobRun.createMany({
    data: [
      { jobKey: 'day.generate', periodKey: 'day:2026-10-28', status: 'abandoned', attempts: 4, error: 'x', startedAt: at2('2026-10-28T03:00:00Z'), finishedAt: at2('2026-10-28T03:01:00Z') },
      { jobKey: 'week.propose', periodKey: 'week:2026-10-26', status: 'abandoned', attempts: 4, error: 'y', startedAt: at2('2026-10-25T05:00:00Z'), finishedAt: at2('2026-10-25T05:01:00Z') },
    ],
  });
  // One recipient failed, one got it → sent; the other job's only alert failed → failed.
  await prisma.studioNotification.createMany({
    data: [
      { kind: 'job.failed', periodKey: 'day.generate|day:2026-10-28', recipient: 'a@gabee.app', status: 'failed', error: 'Mailgun 502' },
      { kind: 'job.failed', periodKey: 'day.generate|day:2026-10-28', recipient: 'b@gabee.app', status: 'sent' },
      { kind: 'job.failed', periodKey: 'week.propose|week:2026-10-26', recipient: 'a@gabee.app', status: 'failed', error: 'Mailgun 502' },
      // Another kind on the same period is not the alert.
      { kind: 'day.ready', periodKey: 'day:2026-10-28', recipient: 'a@gabee.app', status: 'sent' },
    ],
  });
  const body = await (await journal(webRequest(U, { method: 'GET', cookie }), undefined)).json();
  const alertOf = (key: string) => body.jobs.find((j: { job_key: string }) => j.job_key === key).alert;
  assert.equal(alertOf('day.generate'), 'sent');
  assert.equal(alertOf('week.propose'), 'failed');
});
