/**
 * Split a typing target into word runs and single-space runs, keeping each run's
 * start index into the target. The keyboard screen renders one letter per cell;
 * grouping a word's cells in a no-wrap box means a long sentence wraps BETWEEN
 * words ("lait." on the next line) instead of mid-word ("m / ilk.").
 */
export interface WordRun {
  start: number;
  text: string;
  space: boolean;
}

export function wordRuns(target: string): WordRun[] {
  const runs: WordRun[] = [];
  for (let i = 0; i < target.length; i++) {
    const ch = target[i]!;
    const last = runs[runs.length - 1];
    if (ch === ' ') runs.push({ start: i, text: ' ', space: true });
    else if (last && !last.space) last.text += ch;
    else runs.push({ start: i, text: ch, space: false });
  }
  return runs;
}
