import { useTranslation } from 'react-i18next';
import {
  AVATAR_BG,
  HAIR_COLOR_HEX,
  HAIR_STYLE_PATHS,
  SHIRT_COLOR_HEX,
  SKIN_TONE_HEX,
  DEFAULT_AVATAR_LOOK,
  FACE_PATHS,
  type HairColor,
  type HairStyle,
  type Language,
  type ShirtColor,
  type SkinTone,
  type Gender,
} from '@gabee/types';

const INK = '#20242E';
import { GabeeWordmark } from './Bee';
import { Icon } from './Icon';

// Recolourable look — skin/hair colour+shape/shirt each picked independently.
// Palettes + hair-shape paths are the shared source of truth in @gabee/types
// (same values feed the parent picker). Falls back to the default look.
export interface ProfileLike {
  name: string;
  skin_tone?: SkinTone | null;
  hair_color?: HairColor | null;
  hair_style?: HairStyle | null;
  shirt_color?: ShirtColor | null;
  gender?: Gender | null;
}

export function ProfileAvatar({
  profile,
  size = 96,
  expression = 'idle',
}: {
  profile: ProfileLike;
  size?: number;
  expression?: 'idle' | 'correct';
}) {
  const skin = SKIN_TONE_HEX[profile.skin_tone ?? DEFAULT_AVATAR_LOOK.skinTone];
  const hair = HAIR_COLOR_HEX[profile.hair_color ?? DEFAULT_AVATAR_LOOK.hairColor];
  const shirt = SHIRT_COLOR_HEX[profile.shirt_color ?? DEFAULT_AVATAR_LOOK.shirtColor];
  const style = HAIR_STYLE_PATHS[profile.hair_style ?? DEFAULT_AVATAR_LOOK.hairStyle];
  const face = FACE_PATHS[profile.gender ?? 'boy'];
  const clip = `face-${profile.name.replace(/\W/g, '')}-${skin.slice(1)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label={profile.name}>
      <defs>
        <clipPath id={clip}>
          <circle cx="50" cy="50" r="48" />
        </clipPath>
      </defs>
      {/* neutral disc — shirt colour dresses the shoulders, not the bg */}
      <circle cx="50" cy="50" r="48" fill={AVATAR_BG} />
      <g clipPath={`url(#${clip})`}>
        <path d="M 12 100 Q 13 78 34 74 Q 42 72 50 72 Q 58 72 66 74 Q 87 78 88 100 Z" fill={shirt} stroke={INK} strokeWidth="1.5" />
        <path d="M 44 66 L 44 76 Q 50 80 56 76 L 56 66 Z" fill={skin} stroke={INK} strokeWidth="1.2" />
        <path d={style.back} fill={hair} stroke={INK} strokeWidth="1.5" />
        <circle cx="31" cy="53" r="4.5" fill={skin} stroke={INK} strokeWidth="1.2" />
        <circle cx="69" cy="53" r="4.5" fill={skin} stroke={INK} strokeWidth="1.2" />
        <path d={face} fill={skin} stroke={INK} strokeWidth="1.5" />
        <path d={style.fringe} fill={hair} stroke={INK} strokeWidth="1.2" />
        {expression === 'correct' ? (
          <>
            <path d="M 40 50 Q 43 54 46 50" stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M 54 50 Q 57 54 60 50" stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="43" cy="50" r="2.3" fill={INK} />
            <circle cx="57" cy="50" r="2.3" fill={INK} />
          </>
        )}
        <path d="M 50 53 Q 52 58 49 59" fill="none" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
        <path d="M 44 63 Q 50 67 56 63" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function Chrome({
  lang,
  setLang,
  title,
  onHome,
  onBack,
  onSettings,
  showWordmark = false,
  hideHome = false,
  profile = null,
}: {
  lang: Language;
  setLang: (l: Language) => void;
  title?: string;
  onHome?: () => void;
  onBack?: () => void;
  onSettings?: () => void;
  showWordmark?: boolean;
  hideHome?: boolean;
  profile?: ProfileLike | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="chrome">
      <div className="chrome-left">
        {onBack && (
          <button className="icon-btn" onClick={onBack} aria-label="back">
            <Icon name="back" />
          </button>
        )}
        {showWordmark ? <GabeeWordmark height={28} /> : <span className="chrome-title">{title}</span>}
      </div>
      <div className="chrome-right">
        {profile &&
          (onSettings ? (
            <button className="profile-chip" onClick={onSettings} aria-label={`${profile.name} settings`}>
              <ProfileAvatar profile={profile} size={32} />
              <span>{profile.name}</span>
            </button>
          ) : (
            <div className="profile-chip" aria-hidden>
              <ProfileAvatar profile={profile} size={32} />
              <span>{profile.name}</span>
            </div>
          ))}
        <div className="lang-toggle" role="group" aria-label={t('chrome.language')}>
          <button
            type="button"
            className={lang === 'fr' ? 'on' : ''}
            aria-pressed={lang === 'fr'}
            aria-label={t('chrome.toFrench')}
            onClick={() => setLang('fr')}
          >
            FR
          </button>
          <button
            type="button"
            className={lang === 'en' ? 'on' : ''}
            aria-pressed={lang === 'en'}
            aria-label={t('chrome.toEnglish')}
            onClick={() => setLang('en')}
          >
            EN
          </button>
        </div>
        {onHome && !hideHome && (
          <button className="icon-btn" onClick={onHome} aria-label="home">
            <Icon name="home" />
          </button>
        )}
      </div>
    </div>
  );
}

export function ProgressRing({
  value,
  size = 36,
  stroke = 4,
  color = 'rgba(255,255,255,0.95)',
  bg = 'rgba(255,255,255,0.25)',
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  bg?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(1, value)));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke={bg} strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

export function Confetti({ count = 24 }: { count?: number }) {
  const colors = ['#FFB400', '#2BD4E6', '#D6336C', '#1F6FEB', '#7B2FF7', '#3F7A2E'];
  const pieces = Array.from({ length: count }).map((_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * -3,
    duration: 2.4 + Math.random() * 1.5,
    color: colors[i % colors.length],
    rotate: Math.random() * 360,
  }));
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}
