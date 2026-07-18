import { kidInstallHref } from '@/components/landing/parent-app-links';

/**
 * Parent-home encart nudging the parent to install the kid PWA on the child's
 * device — often it's the parent who installs, not the child. Deep-links to the
 * kid app with `?install=1` (the install prompt can only fire on the kid
 * origin, so we can't trigger it from here) and carries the iOS "Add to Home
 * Screen" hint inline, since Safari has no install API.
 */
export function InstallKidBanner({ lang }: { lang: 'fr' | 'en' }) {
  const isFr = lang === 'fr';
  return (
    <div className="banner mint install-kid-banner">
      <span className="ikb-icon" aria-hidden>
        📲
      </span>
      <div className="ikb-copy">
        <strong>
          {isFr
            ? "Installe Gabee sur l'appareil de ton enfant"
            : "Install Gabee on your kid's device"}
        </strong>
        <span className="ikb-hint">
          {isFr
            ? 'Ouvre ce lien sur sa tablette / son ordi, puis « Installer ». Sur iPhone/iPad : Partager ▸ « Sur l’écran d’accueil ».'
            : 'Open this link on their tablet / computer, then “Install”. On iPhone/iPad: Share ▸ “Add to Home Screen”.'}
        </span>
      </div>
      <a
        className="btn mint ikb-cta"
        href={kidInstallHref()}
        target="_blank"
        rel="noopener noreferrer"
      >
        {isFr ? 'Installer' : 'Install'}
      </a>
    </div>
  );
}
