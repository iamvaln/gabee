import { Bee } from './Bee';
import { Chrome } from './Chrome';

type ChromeProps = React.ComponentProps<typeof Chrome>;

export interface SessionShellProps {
  module: string;
  title: string;
  lang: ChromeProps['lang'];
  setLang: ChromeProps['setLang'];
  onBack: () => void;
  onHome: () => void;
  profile: ChromeProps['profile'];
}

/**
 * Loading state for every session screen — the real Bee mascot with its gentle
 * `bob` float. Shown while the bundle loads, during per-question setup, and for
 * the rare empty-pool case. Deliberately no "no content" text.
 */
export function SessionLoader({ module, title, lang, setLang, onBack, onHome, profile }: SessionShellProps) {
  return (
    <div className="session-screen" data-module={module}>
      <Chrome lang={lang} setLang={setLang} title={title} onBack={onBack} onHome={onHome} profile={profile} />
      <div className="session-body session-loading" aria-busy="true">
        <div aria-hidden="true"><Bee size={112} expression="idle" wings bob /></div>
        <div className="session-loading-dots" aria-hidden="true"><span /><span /><span /></div>
      </div>
    </div>
  );
}
