import type { Op, Prim, MoveDir } from './turtle';

export type PrimKey = 'up' | 'down' | 'left' | 'right' | 'pick' | 'drop';
export type Slot = 'body' | 'then' | 'else';
export type Cond = 'wall_up' | 'wall_down' | 'wall_left' | 'wall_right';

/**
 * Nested-program editor state. `active` is the top-level container index being
 * filled (or null for top level); `slot` selects which opening of that container
 * receives placed blocks — a loop 'body', or an if's 'then'/'else'. One level of
 * nesting only (branches/bodies hold primitives).
 */
export type ProgramState = { program: Op[]; active: number | null; slot: Slot };

export function makePrim(k: PrimKey): Prim {
  if (k === 'pick' || k === 'drop') return { op: k };
  return { op: 'move', dir: k as MoveDir };
}

export function empty(): ProgramState {
  return { program: [], active: null, slot: 'body' };
}

export function addPrim(s: ProgramState, k: PrimKey): ProgramState {
  const prim = makePrim(k);
  if (s.active === null) return { ...s, program: [...s.program, prim] };
  const program = s.program.map((op, i) => {
    if (i !== s.active) return op;
    if (op.op === 'repeat') return { ...op, body: [...op.body, prim] };
    if (op.op === 'if') {
      return s.slot === 'else'
        ? { ...op, else: [...(op.else ?? []), prim] }
        : { ...op, then: [...op.then, prim] };
    }
    return op;
  });
  return { ...s, program };
}

export function addLoop(s: ProgramState): ProgramState {
  const program = [...s.program, { op: 'repeat', n: 2, body: [] } as Op];
  return { program, active: program.length - 1, slot: 'body' };
}

export function addIf(s: ProgramState): ProgramState {
  const program = [...s.program, { op: 'if', cond: 'wall_right', then: [], else: [] } as Op];
  return { program, active: program.length - 1, slot: 'then' };
}

export function setActive(s: ProgramState, index: number | null, slot: Slot = 'body'): ProgramState {
  return { ...s, active: index, slot };
}

export function setSlot(s: ProgramState, slot: Slot): ProgramState {
  return { ...s, slot };
}

export function setCount(s: ProgramState, index: number, n: number): ProgramState {
  const clamped = Math.max(2, Math.min(5, n));
  return { ...s, program: s.program.map((op, i) => (i === index && op.op === 'repeat' ? { ...op, n: clamped } : op)) };
}

export function setCond(s: ProgramState, index: number, cond: Cond): ProgramState {
  return { ...s, program: s.program.map((op, i) => (i === index && op.op === 'if' ? { ...op, cond } : op)) };
}

export function removeTop(s: ProgramState, index: number): ProgramState {
  const program = s.program.filter((_, i) => i !== index);
  let active = s.active;
  if (active === index) active = null;
  else if (active !== null && active > index) active -= 1;
  return { program, active, slot: active === null ? 'body' : s.slot };
}

export function removeInside(s: ProgramState, index: number, slot: Slot, bodyIndex: number): ProgramState {
  const program = s.program.map((op, i) => {
    if (i !== index) return op;
    if (op.op === 'repeat' && slot === 'body') return { ...op, body: op.body.filter((_, j) => j !== bodyIndex) };
    if (op.op === 'if' && slot === 'then') return { ...op, then: op.then.filter((_, j) => j !== bodyIndex) };
    if (op.op === 'if' && slot === 'else') return { ...op, else: (op.else ?? []).filter((_, j) => j !== bodyIndex) };
    return op;
  });
  return { ...s, program };
}

export function blockCount(program: Op[]): number {
  let n = 0;
  for (const op of program) {
    n += 1;
    if (op.op === 'repeat') n += blockCount(op.body);
    else if (op.op === 'if') n += blockCount(op.then) + blockCount(op.else ?? []);
  }
  return n;
}
