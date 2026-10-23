import { prisma } from '../db';
import { getStudioTimezone } from '../services/web-visits';
import { localParts, zonedTime } from './clock';
import { budgetAlertEmail } from './emails';
import { notifyOnce, requireDelivered, studioLink, type Sender } from './notify';

/**
 * Communication AI budget (spec "AI layer", Global Constraints): only rows
 * metered for a studio task (`ai_usage.task` not null) count — question
 * authoring does not. Months are studio-local (`YYYY-MM`). Phase 1a alerts at
 * `budgetAlertRatio × monthlyBudgetUsd`, once per month; the hard stop is 1b.
 */

function monthRange(month: string, tz: string): { from: Date; to: Date } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`Invalid budget month "${month}" (expected YYYY-MM).`);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { from: zonedTime(`${month}-01`, 0, tz), to: zonedTime(`${next}-01`, 0, tz) };
}

/** Studio AI spend (USD) during studio-local `month` (`YYYY-MM`). */
export async function monthSpendUsd(month: string, tz?: string): Promise<number> {
  const { from, to } = monthRange(month, tz ?? (await getStudioTimezone()));
  const agg = await prisma.aiUsage.aggregate({
    where: { task: { not: null }, createdAt: { gte: from, lt: to } },
    _sum: { costUsd: true },
  });
  return agg._sum.costUsd ?? 0;
}

/** This studio-local month's Communication spend against the budget (Ops › Usage IA, Réglages). */
export async function studioBudget(now: Date): Promise<{ month: string; spentUsd: number; budgetUsd: number; alertRatio: number }> {
  const settings = await prisma.studioSettings.findUnique({ where: { id: 'default' } });
  const tz = settings?.timezone ?? 'Africa/Douala';
  const month = localParts(now, tz).date.slice(0, 7);
  return {
    month,
    spentUsd: Math.round((await monthSpendUsd(month, tz)) * 1e6) / 1e6,
    budgetUsd: settings?.monthlyBudgetUsd ?? 50,
    alertRatio: settings?.budgetAlertRatio ?? 0.8,
  };
}

export type BudgetCheck = { month: string; spentUsd: number; budgetUsd: number; alerted: boolean };

/**
 * Email the budget alert once the month's spend reaches the threshold — once
 * per month (`StudioSettings.budgetAlertSentFor`, plus the notification row).
 * A failed send throws so the job retries it.
 */
export async function checkBudget(now: Date, send?: Sender): Promise<BudgetCheck> {
  const settings = await prisma.studioSettings.findUnique({ where: { id: 'default' } });
  const tz = settings?.timezone ?? 'Africa/Douala';
  const budgetUsd = settings?.monthlyBudgetUsd ?? 50;
  const ratio = settings?.budgetAlertRatio ?? 0.8;
  const month = localParts(now, tz).date.slice(0, 7);
  const spentUsd = await monthSpendUsd(month, tz);

  if (spentUsd < ratio * budgetUsd || settings?.budgetAlertSentFor === month) return { month, spentUsd, budgetUsd, alerted: false };

  const res = await notifyOnce('budget.alert', month, () => budgetAlertEmail({ spentUsd, budgetUsd, month, link: studioLink('/reglages') }), send);
  requireDelivered(res, `The budget alert for ${month}`);
  await prisma.studioSettings.updateMany({ where: { id: 'default' }, data: { budgetAlertSentFor: month } });
  return { month, spentUsd, budgetUsd, alerted: res.sent > 0 };
}
