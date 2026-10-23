/**
 * Communication studio data changed (a draft approved, a week validated…):
 * the shell's nav badge re-reads the pending counts. A plain window event, so
 * the shell does not depend on the studio screens' code.
 */
export const STUDIO_CHANGED = 'gabee:studio-changed';

export function notifyStudioChanged(): void {
  window.dispatchEvent(new Event(STUDIO_CHANGED));
}
