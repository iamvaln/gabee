'use client';

import Link from 'next/link';
import type { ContentPlatform, Language } from '@gabee/types';
import { AIcon } from '../../_shell/icons';
import { copyText, copyTextNow } from './copy';

const SETTINGS = '/admin/communication/reglages';

/**
 * « Copier et ouvrir LinkedIn » / « Copier la légende et ouvrir TikTok »:
 * copies the post, then opens the platform's publish page in a new tab.
 *
 * Order: copy first, then open, all inside the tap. This is a real
 * `<a target="_blank">`, so the tab opens as the link's own default action
 * once the click handler returns: no `window.open`, no popup blocker, and
 * nothing awaited before it (iOS Safari drops the user gesture after an
 * `await`, and only allows clipboard writes inside it). The handler copies
 * synchronously (`copyTextNow`), so the text is in the clipboard before the
 * new tab takes focus; only if the browser refuses that does it start the
 * Clipboard API (`copyText`, called synchronously too, so its write begins
 * inside the gesture) and report its outcome when it settles.
 */
export function OpenPlatformLink({
  platform,
  url,
  text,
  lang,
  primary,
  onCopied,
}: {
  platform: ContentPlatform;
  url: string;
  text: string;
  lang: Language;
  primary: boolean;
  onCopied: (ok: boolean) => void;
}) {
  const L = lang === 'fr';
  const label =
    platform === 'linkedin' ? (L ? 'Copier et ouvrir LinkedIn' : 'Copy and open LinkedIn') : L ? 'Copier la légende et ouvrir TikTok' : 'Copy the caption and open TikTok';
  return (
    <a
      className={'btn ' + (primary ? 'studio-primary' : 'secondary')}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        // Never awaited: the link opens the tab right after this handler returns (see above).
        if (copyTextNow(text)) onCopied(true);
        else void copyText(text).then(onCopied);
      }}
    >
      <AIcon name="external" />
      {label}
    </a>
  );
}

/** No publish link set for this platform: say where to add it (a link for a super-admin). */
export function MissingPublishLink({ platform, lang, canEdit }: { platform: ContentPlatform; lang: Language; canEdit: boolean }) {
  const L = lang === 'fr';
  const what =
    platform === 'linkedin'
      ? L
        ? 'Ajoutez le lien de votre page dans Réglages'
        : 'Add your page link in Settings'
      : L
        ? 'Ajoutez le lien TikTok dans Réglages'
        : 'Add the TikTok link in Settings';
  if (canEdit) {
    return (
      <Link className="btn secondary" href={SETTINGS}>
        <AIcon name="external" />
        {what}
      </Link>
    );
  }
  return (
    <span className="studio-muted-text studio-publish-missing">
      {what} {L ? '(un super-admin peut le faire).' : '(a super-admin can do it).'}
    </span>
  );
}
