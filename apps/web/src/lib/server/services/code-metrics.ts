import { prisma } from '../db';
import { accessibleKidIds } from '../kid-access';

/**
 * Process-rich Code metrics (product §9.2). Computed from the two code events
 * the kid app emits during puzzle play:
 *   - `code_run` for every program execution attempt (blocks used, optimal,
 *     wall hits, attempt number, result).
 *   - `code_level_solved` for the puzzle completion summary (efficiency,
 *     loop/conditional usage, total attempts, hints used, duration).
 *
 * What we compute:
 *   - Solved puzzles: number of `code_level_solved` events in the window.
 *   - Efficiency ratio: mean(optimal/final_blocks_used) across solved puzzles.
 *     1.0 = always picked the shortest program; lower = used extra blocks.
 *   - Avg attempts to solve: mean(total_attempts) across solved puzzles.
 *     A high number means lots of trial-and-error; not bad, but watch the
 *     trend over time.
 *   - Wall hit rate: total_wall_hits / total runs. Lower = better planner.
 *   - Loop adoption %: of solved puzzles where the kid used a loop.
 *   - Conditional adoption %: same, for if-obstacle blocks. Together they
 *     signal "the kid is starting to think in abstractions".
 *   - Avg solve duration: median(duration_ms) so a single rage-quit doesn't
 *     blow the mean.
 *
 * Scope: pass `parentId` + optional `kidId` (single kid) or omit (union of
 * accessible kids — admin-style aggregate).
 */

export interface CodeMetrics {
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

interface SolvedPayload {
  used_loop?: boolean;
  used_conditional?: boolean;
  total_attempts?: number;
  efficiency_ratio?: number;
  duration_ms?: number;
  total_wall_hits?: number;
  hints_used?: number;
}

interface RunPayload {
  result?: 'success' | 'hit_wall' | 'wrong_position';
  wall_hits?: number;
  blocks_used?: number;
  optimal_blocks?: number;
}

const DAYS = 24 * 60 * 60 * 1000;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

export async function getCodeMetrics(
  parentId: string,
  opts: { kidId?: string; days?: number } = {},
): Promise<CodeMetrics | null> {
  const days = opts.days ?? 28;
  const since = new Date(Date.now() - days * DAYS);
  const until = new Date();

  let profileIds: string[];
  if (opts.kidId) {
    const access = await accessibleKidIds(parentId);
    if (!access.includes(opts.kidId)) return null;
    profileIds = [opts.kidId];
  } else {
    profileIds = await accessibleKidIds(parentId);
    if (profileIds.length === 0) return null;
  }

  return computeCodeMetrics(profileIds, since, until);
}

/**
 * Admin variant — aggregates across ALL kids in the system. Bypasses the
 * parent/co-parent access scope because admin dashboards are global by design.
 */
export async function getCodeMetricsForAdmin(days = 28): Promise<CodeMetrics | null> {
  const since = new Date(Date.now() - days * DAYS);
  const until = new Date();
  return computeCodeMetrics(null, since, until);
}

async function computeCodeMetrics(
  profileIds: string[] | null,
  since: Date,
  until: Date,
): Promise<CodeMetrics | null> {
  const profileFilter = profileIds ? { profileId: { in: profileIds } } : {};
  const [solved, runs] = await Promise.all([
    prisma.event.findMany({
      where: {
        name: 'code_level_solved',
        ...profileFilter,
        serverTs: { gte: since, lte: until },
      },
      select: { payload: true },
    }),
    prisma.event.findMany({
      where: {
        name: 'code_run',
        ...profileFilter,
        serverTs: { gte: since, lte: until },
      },
      select: { payload: true },
    }),
  ]);

  if (solved.length === 0 && runs.length === 0) return null;

  let effSum = 0;
  let effN = 0;
  let attemptsSum = 0;
  let loopUses = 0;
  let condUses = 0;
  const durations: number[] = [];
  for (const e of solved) {
    const p = e.payload as SolvedPayload;
    if (typeof p.efficiency_ratio === 'number') {
      effSum += p.efficiency_ratio;
      effN += 1;
    }
    if (typeof p.total_attempts === 'number') attemptsSum += p.total_attempts;
    if (p.used_loop) loopUses += 1;
    if (p.used_conditional) condUses += 1;
    if (typeof p.duration_ms === 'number') durations.push(p.duration_ms);
  }

  let totalWallHits = 0;
  for (const e of runs) {
    const p = e.payload as RunPayload;
    if (typeof p.wall_hits === 'number') totalWallHits += p.wall_hits;
  }

  const efficiencyRatio = effN > 0 ? effSum / effN : 0;
  const avgAttempts = solved.length > 0 ? attemptsSum / solved.length : 0;
  const wallHitRate = runs.length > 0 ? totalWallHits / runs.length : 0;
  const loopAdoptionPct = solved.length > 0 ? (loopUses / solved.length) * 100 : 0;
  const conditionalAdoptionPct = solved.length > 0 ? (condUses / solved.length) * 100 : 0;
  const medianDurationMs = median(durations);

  return {
    solved_puzzles: solved.length,
    total_runs: runs.length,
    efficiency_ratio: Math.round(efficiencyRatio * 100) / 100,
    avg_attempts_per_solve: Math.round(avgAttempts * 10) / 10,
    wall_hit_rate: Math.round(wallHitRate * 100) / 100,
    loop_adoption_pct: Math.round(loopAdoptionPct * 10) / 10,
    conditional_adoption_pct: Math.round(conditionalAdoptionPct * 10) / 10,
    median_solve_duration_s: medianDurationMs == null ? null : Math.round(medianDurationMs / 1000),
    since: since.toISOString(),
    until: until.toISOString(),
  };
}
