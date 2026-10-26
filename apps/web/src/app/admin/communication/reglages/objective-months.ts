/**
 * The months the objective card offers, for studio-local `today`
 * (`YYYY-MM-DD`): this month and next, preceded by the month of this week's
 * Monday when the week started in the previous month (a week straddling two
 * months takes the objective of its Monday's month, so the Semaine screen's
 * "Fixer l'objectif" must be able to reach it).
 */
export function objectiveMonths(today: string): { months: string[]; thisMonth: string } {
  const day = new Date(`${today}T00:00:00Z`);
  const monday = new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 7);
  const thisMonth = today.slice(0, 7);
  const [y, m] = thisMonth.split('-').map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { months: monday === thisMonth ? [thisMonth, next] : [monday, thisMonth, next], thisMonth };
}
