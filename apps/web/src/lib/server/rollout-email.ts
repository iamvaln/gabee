import { FLAG_KEYS, FLAG_ANNOUNCEMENTS, type FlagKey } from '@gabee/types';

const SUBJECT = `✨ De nouvelles aventures Gabee pour votre enfant / New Gabee adventures for your child`;

const INTRO_FR = `Bonjour ! Vous faites partie d'un petit groupe de familles que nous invitons à découvrir en avant-première les toutes dernières nouveautés de Gabee — avant tout le monde. Voici ce qui vient d'être activé sur le compte de votre enfant :`;
const INTRO_EN = `Hi there! You're part of a small group of families we're inviting to try Gabee's latest features before anyone else. Here's what we've just switched on for your child's account:`;
const OUTRO_FR = `Comme il s'agit d'un aperçu, votre avis compte énormément — répondez simplement à cet e-mail.\n\nÀ bientôt sur Gabee,\nL'équipe Gabee`;
const OUTRO_EN = `Because this is an early preview, your feedback means the world to us — just reply to this email.\n\nSee you on Gabee,\nThe Gabee Team`;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function assembleRolloutEmail(flags: FlagKey[]): { subject: string; text: string; html: string } {
  const ordered = FLAG_KEYS.filter((k) => flags.includes(k) && FLAG_ANNOUNCEMENTS[k] !== undefined);

  const frBlocks = ordered.map((k) => {
    const a = FLAG_ANNOUNCEMENTS[k]!.fr;
    return `${a.title}\n${a.body}`;
  });
  const enBlocks = ordered.map((k) => {
    const a = FLAG_ANNOUNCEMENTS[k]!.en;
    return `${a.title}\n${a.body}`;
  });

  const text =
    `${INTRO_FR}\n\n${frBlocks.join('\n\n')}\n\n${OUTRO_FR}` +
    `\n\n⸻⸻⸻\n\n` +
    `${INTRO_EN}\n\n${enBlocks.join('\n\n')}\n\n${OUTRO_EN}`;

  const htmlBlocks = (keys: FlagKey[], lang: 'fr' | 'en') =>
    keys
      .map((k) => {
        const a = FLAG_ANNOUNCEMENTS[k]![lang];
        return `<p style="margin:16px 0"><strong>${esc(a.title)}</strong><br>${esc(a.body)}</p>`;
      })
      .join('');

  const html =
    `<div style="font-family:system-ui,sans-serif;max-width:560px;line-height:1.5">` +
    `<p>${esc(INTRO_FR)}</p>${htmlBlocks(ordered, 'fr')}<p style="white-space:pre-line">${esc(OUTRO_FR)}</p>` +
    `<hr style="margin:28px 0;border:none;border-top:1px solid #e5e7eb">` +
    `<p>${esc(INTRO_EN)}</p>${htmlBlocks(ordered, 'en')}<p style="white-space:pre-line">${esc(OUTRO_EN)}</p>` +
    `</div>`;

  return { subject: SUBJECT, text, html };
}
