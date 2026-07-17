import { useLayoutEffect, useState, type RefObject } from 'react';
import { Icon } from './Icon';

/**
 * A bouncing 👇 anchored just above the current guide target. Reads the target
 * element from the session's anchor registry (a ref Map) and re-measures on
 * resize / scroll / periodic layout shifts. Purely visual — never intercepts taps.
 */
export function GuidePointer({
  anchorsRef,
  targetKey,
}: {
  anchorsRef: RefObject<Map<string, HTMLElement | null>>;
  targetKey: string | undefined;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!targetKey) { setRect(null); return; }
    const measure = () => {
      const el = anchorsRef.current?.get(targetKey) ?? null;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const id = window.setInterval(measure, 300); // catch program-strip growth etc.
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      window.clearInterval(id);
    };
  }, [targetKey, anchorsRef]);

  if (!rect) return null;
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        left: rect.left + rect.width / 2,
        top: rect.top,
        zIndex: 60,
        color: 'var(--color-brand)',
        pointerEvents: 'none',
        animation: 'guide-bounce 0.9s ease-in-out infinite',
        filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.25))',
        transform: 'translateX(-50%)',
      }}
    >
      <Icon name="arrow-down" size={30} />
    </div>
  );
}
