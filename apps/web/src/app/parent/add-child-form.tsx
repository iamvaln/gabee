'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const AVATARS = ['avatar_1', 'avatar_2', 'avatar_3', 'avatar_4'] as const;

export function AddChildForm({ lang = 'fr' }: { lang?: 'fr' | 'en' }) {
  const isFr = lang === 'fr';
  const router = useRouter();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<(typeof AVATARS)[number]>('avatar_1');
  const [language, setLanguage] = useState<'fr' | 'en'>(lang);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, avatar, language }),
    });
    if (res.ok) {
      setName('');
      router.refresh();
      setBusy(false);
      return;
    }
    const body = await res.json().catch(() => null);
    setError(
      body?.error?.message ??
        (isFr ? "Impossible d'ajouter le profil." : 'Could not add profile.'),
    );
    setBusy(false);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border p-4"
      style={{ borderColor: 'var(--border)' }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm font-bold">{isFr ? "Prénom de l'enfant" : "Child's first name"}</span>
        <input
          required
          minLength={2}
          maxLength={20}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-[var(--radius-md)] border px-3 py-2"
          style={{ borderColor: 'var(--border)' }}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-bold">Avatar</span>
        <select
          value={avatar}
          onChange={(e) => setAvatar(e.target.value as (typeof AVATARS)[number])}
          className="rounded-[var(--radius-md)] border px-3 py-2"
          style={{ borderColor: 'var(--border)' }}
        >
          {AVATARS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-bold">{isFr ? 'Langue' : 'Language'}</span>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as 'fr' | 'en')}
          className="rounded-[var(--radius-md)] border px-3 py-2"
          style={{ borderColor: 'var(--border)' }}
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded-[var(--radius-lg)] px-5 py-2 font-extrabold disabled:opacity-50"
        style={{ background: 'var(--color-brand)', color: 'var(--color-ink)' }}
      >
        {busy ? '…' : isFr ? "Ajouter l'enfant" : 'Add child'}
      </button>
      {error && (
        <p className="w-full" style={{ color: 'var(--feedback-retry)' }}>
          {error}
        </p>
      )}
    </form>
  );
}
