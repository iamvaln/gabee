import type { Op, Prim, MoveDir } from './turtle';

/** Palette keys the child can place (arrows + pick/drop). */
export type PrimKey = 'up' | 'down' | 'left' | 'right' | 'pick' | 'drop';

/**
 * Editor state for the nested program. Slice 1 allows one level of nesting:
 * `active` is the top-level index of the loop currently being filled, or null
 * to append at the top level.
 */
export type ProgramState = { program: Op[]; active: number | null };

export function makePrim(k: PrimKey): Prim {
  if (k === 'pick' || k === 'drop') return { op: k };
  return { op: 'move', dir: k as MoveDir };
}

export function empty(): ProgramState {
  return { program: [], active: null };
}

export function addPrim(s: ProgramState, k: PrimKey): ProgramState {
  const prim = makePrim(k);
  if (s.active === null) return { ...s, program: [...s.program, prim] };
  const program = s.program.map((op, i) => {
    if (i !== s.active || op.op !== 'repeat') return op;
    return { ...op, body: [...op.body, prim] };
  });
  return { ...s, program };
}

export function addLoop(s: ProgramState): ProgramState {
  const program = [...s.program, { op: 'repeat', n: 2, body: [] } as Op];
  return { program, active: program.length - 1 };
}

export function setActive(s: ProgramState, index: number | null): ProgramState {
  return { ...s, active: index };
}

export function setCount(s: ProgramState, index: number, n: number): ProgramState {
  const clamped = Math.max(2, Math.min(5, n));
  const program = s.program.map((op, i) =>
    i === index && op.op === 'repeat' ? { ...op, n: clamped } : op,
  );
  return { ...s, program };
}

export function removeTop(s: ProgramState, index: number): ProgramState {
  const program = s.program.filter((_, i) => i !== index);
  let active = s.active;
  if (active === index) active = null;
  else if (active !== null && active > index) active -= 1;
  return { program, active };
}

export function removeInLoop(s: ProgramState, loopIndex: number, bodyIndex: number): ProgramState {
  const program = s.program.map((op, i) => {
    if (i !== loopIndex || op.op !== 'repeat') return op;
    return { ...op, body: op.body.filter((_, j) => j !== bodyIndex) };
  });
  return { ...s, program };
}

export function blockCount(program: Op[]): number {
  let n = 0;
  for (const op of program) {
    n += 1;
    if (op.op === 'repeat') n += blockCount(op.body);
  }
  return n;
}
