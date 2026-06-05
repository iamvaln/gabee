import { useTranslation } from 'react-i18next';
import { Bee } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { MODULES } from '../content/modules';
import { useStore } from '../store';

// The two Code sub-modes the kid app exposes (product §4.4). Both are seeded and playable:
//  - find_path: arrange movement blocks (up/down/left/right) on a grid with obstacles
//  - building_blocks: same engine + loop and conditional blocks
// They do not mix within a single game and keep their progression independent.
// Curriculum v0.1 §4: three Code worlds, one unified turtle model. Each ramps the
// same concepts (sequences → conditions → loops → combo → debug) in its universe.
export type CodeSubMode = 'maze' | 'draw' | 'actions';

const SUB_MODES: { id: CodeSubMode; label: { fr: string; en: string }; sub: { fr: string; en: string }; icon: string }[] = [
  {
    id: 'maze',
    label: { fr: 'Parcours', en: 'Maze' },
    sub: { fr: 'Aide Gabee à atteindre l’étoile', en: 'Guide Gabee to the star' },
    icon: '🧭',
  },
  {
    id: 'draw',
    label: { fr: 'Tracé', en: 'Draw' },
    sub: { fr: 'Programme Gabee pour dessiner', en: 'Program Gabee to draw' },
    icon: '✏️',
  },
  {
    id: 'actions',
    label: { fr: 'Actions', en: 'Actions' },
    sub: { fr: 'Ramasse, déplace et pose', en: 'Pick up, move and drop' },
    icon: '🧺',
  },
];

// Code sub-hub (product §4.4): a tile per sub-mode. Mirrors WordsHub. The Code module
// itself is language-agnostic (product §7.3); only the UI labels translate.
export function CodeHub({
  onSubMode,
  onHome,
  onBack,
}: {
  onSubMode: (sub: CodeSubMode) => void;
  onHome: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const profile = useStore((s) => s.profile);

  const m = MODULES.find((x) => x.id === 'code')!;

  return (
    <div className="levelmap-screen" data-module="code">
      <Chrome lang={lang} setLang={setLang} title={m.label[lang]} onBack={onBack} onHome={onHome} profile={profile} />
      <div className="levelmap-hero" data-module="code">
        <Bee size={72} expression="focus" wings />
        <div>
          <h1>{m.tagline[lang]}</h1>
          <p>{t('pickLevel')}</p>
        </div>
      </div>
      <div className="level-body">
        <div className="module-grid">
          {SUB_MODES.map((s) => (
            <button
              key={s.id}
              className="module-tile"
              data-module="code"
              onClick={() => onSubMode(s.id)}
            >
              <div className="icon" style={{ color: 'white', fontSize: 30, lineHeight: 1 }}>{s.icon}</div>
              <div>
                <div className="label">{s.label[lang]}</div>
                <div className="sub">{s.sub[lang]}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
