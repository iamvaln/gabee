'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Language } from '@gabee/types';
import { ConfirmDialog } from './Dialog';

/**
 * While `dirty`, leaving the page asks first: the browser's own prompt on
 * reload / close / external navigation (`beforeunload`), and a confirm dialog
 * for in-app links (sidebar, crumbs…), caught before Next's router sees the
 * click. Returns the dialog to render.
 */
export function useUnsavedGuard(dirty: boolean, lang: Language): React.ReactNode {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers need a returnValue to show the prompt.
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return; // external: beforeunload covers it
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setPending(url.pathname + url.search + url.hash);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    // Capture on the document runs before React's root listener (where next/link navigates).
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  if (!pending) return null;
  const L = lang === 'fr';
  return (
    <ConfirmDialog
      lang={lang}
      title={L ? 'Quitter sans enregistrer ?' : 'Leave without saving?'}
      body={
        L
          ? 'Certaines modifications de cette page ne sont pas enregistrées. Si vous partez, elles seront perdues.'
          : 'Some changes on this page are not saved. If you leave, they will be lost.'
      }
      confirmLabel={L ? 'Quitter sans enregistrer' : 'Leave without saving'}
      danger
      onConfirm={() => {
        const to = pending;
        setPending(null);
        router.push(to);
      }}
      onClose={() => setPending(null)}
    />
  );
}
