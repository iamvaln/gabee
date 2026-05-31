'use client';

import { useRouter } from 'next/navigation';
import type { Language } from '@gabee/types';

// Writes the `admin_lang` cookie (same convention as the top-bar switcher in the shell)
// then refreshes so server components re-read the preference.
export function LangToggle({ lang }: { lang: Language }) {
  const router = useRouter();

  const set = (l: Language) => {
    if (l === lang) return;
    document.cookie = `admin_lang=${l}; path=/; max-age=31536000`;
    router.refresh();
  };

  return (
    <div className="row gap8">
      <button className={'chip' + (lang === 'fr' ? ' on' : '')} onClick={() => set('fr')}>
        Français
      </button>
      <button className={'chip' + (lang === 'en' ? ' on' : '')} onClick={() => set('en')}>
        English
      </button>
    </div>
  );
}
