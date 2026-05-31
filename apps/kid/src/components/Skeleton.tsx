/**
 * Composite skeletons that mirror the actual layout of the screen they replace
 * while content loads. Better than a flat rectangle because:
 *  - The kid sees the right SHAPE (a level grid looks like a level grid) so
 *    the visual switch from loading → content is non-jarring.
 *  - The shimmer reads as "loading" rather than "broken empty state".
 */

/** Level/Lesson map placeholder — 6 tile-shaped skeletons in the canonical 5-col grid. */
export function SkeletonLevelGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="level-grid" aria-label="loading" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-tile" />
      ))}
    </div>
  );
}

/** Session loading — a prompt-shaped rectangle that fades into the real prompt. */
export function SkeletonSessionStage() {
  return (
    <div className="session-body" aria-label="loading" aria-busy="true">
      <div className="session-stage">
        <div className="skeleton" style={{ flex: 1, minHeight: 200 }} />
      </div>
    </div>
  );
}
