'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }
  return (
    <button
      onClick={logout}
      className="rounded-[var(--radius-md)] border px-4 py-2 text-sm font-bold"
      style={{ borderColor: 'var(--border)' }}
    >
      Log out
    </button>
  );
}
