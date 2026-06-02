'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Language } from '@gabee/types';
import { SUPPORT_WHATSAPP_URL } from '@/lib/support';

type Role = 'parent' | 'admin' | 'super_admin';

/**
 * Avatar dropdown — ports the `<TopBar>` avatar menu in `parent-shell.jsx`:
 * `.avatar-btn` with the `.avatar-mono` initials chip + chevron, opening a
 * `.menu-pop` with a `.menu-head` (name / email) and `.menu-item` rows. The
 * design's "Mon profil" / "Famille" rows link to /parent/settings; "Sign out"
 * POSTs `/api/auth/logout` and bounces to `/parent/login` (existing wiring).
 * Click-outside + Escape close — same UX as before.
 */
export function AvatarMenu({
  email,
  role,
  lang,
}: {
  email: string;
  role: Role;
  lang: Language;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const L = lang === 'fr';

  // Initials from the email local-part — same convention as the design handoff.
  const initials =
    (email.split('@')[0] ?? email)
      .replace(/[^a-zA-Z]/g, ' ')
      .trim()
      .split(/\s+/)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .slice(0, 2)
      .join('') || email.slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setOpen(false);
    router.push('/parent/login');
    router.refresh();
  }

  // Display name: the email local-part, prettified. Matches `parent.name` in
  // the design (e.g. "Sandrine Kouassi") — best-effort until milestone-5 wires
  // first/last name on the ParentAccount.
  const displayName = (() => {
    const local = email.split('@')[0] ?? email;
    return local
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : ''))
      .join(' ') || email;
  })();

  const roleLabel =
    role === 'super_admin'
      ? L ? 'Super admin' : 'Super admin'
      : role === 'admin'
        ? L ? 'Admin' : 'Admin'
        : L ? 'Parent' : 'Parent';

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="avatar-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={L ? 'Compte' : 'Account'}
      >
        <span className="avatar-mono">{initials}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m5 9 7 7 7-7" />
        </svg>
      </button>
      {open && (
        <div className="menu-pop" role="menu" onClick={(e) => e.stopPropagation()}>
          <div className="menu-head">
            <div className="nm">{role === 'parent' ? displayName : roleLabel}</div>
            <div className="em">{email}</div>
          </div>
          <Link href="/parent/settings" className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="8" r="3.4" />
              <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
            </svg>
            {L ? 'Mon profil' : 'My profile'}
          </Link>
          <Link href="/parent/settings" className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="9" cy="8" r="3" />
              <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
              <path d="M16 5.4a3 3 0 0 1 0 5.2" />
              <path d="M17.5 13.4A5.5 5.5 0 0 1 20.5 18.5" />
            </svg>
            {L ? 'Famille' : 'Family'}
          </Link>
          <a
            href={process.env.NEXT_PUBLIC_KID_APP_URL ?? 'http://localhost:5173'}
            target="_blank"
            rel="noopener noreferrer"
            className="menu-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="4" width="18" height="13" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
            {L ? "Ouvrir l'espace enfant" : 'Open kids app'}
          </a>
          <a
            href={SUPPORT_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="menu-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4-1L3 20l1-5.5a8.5 8.5 0 0 1-1-4A8.38 8.38 0 0 1 11.5 2 8.5 8.5 0 0 1 21 11.5Z" />
            </svg>
            Support
          </a>
          <hr />
          <button type="button" className="menu-item" onClick={signOut} role="menuitem">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
              <path d="M10 16l4-4-4-4M14 12H3" />
            </svg>
            {L ? 'Se déconnecter' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
