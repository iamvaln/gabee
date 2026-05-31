import type { Avatar, Language } from '@gabee/types';
import { GabeeWordmark } from './Bee';
import { Icon } from './Icon';

// Fixed look per avatar id (hair + shirt). Phase-3 recolouring will make these editable.
const AVATAR_LOOKS: Record<Avatar, { hair: string; shirt: string }> = {
  avatar_1: { hair: '#3A2A1A', shirt: '#1F6FEB' },
  avatar_2: { hair: '#E89B3B', shirt: '#7B2FF7' },
  avatar_3: { hair: '#1B1A18', shirt: '#3F7A2E' },
  avatar_4: { hair: '#C44', shirt: '#D6336C' },
};

export interface ProfileLike {
  name: string;
  avatar: Avatar;
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
  const { hair, shirt } = AVATAR_LOOKS[profile.avatar];
  const skin = '#F4C7A1';
  const clip = `face-${profile.avatar}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label={profile.name}>
      <defs>
        <clipPath id={clip}>
          <circle cx="50" cy="50" r="48" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="48" fill={shirt} />
      <g clipPath={`url(#${clip})`}>
        <rect x="0" y="80" width="100" height="40" fill={shirt} />
        <ellipse cx="50" cy="56" rx="26" ry="30" fill={skin} stroke="#20242E" strokeWidth="1.5" />
        <path d="M 24 50 Q 25 26 50 24 Q 75 26 76 50 Q 70 36 50 36 Q 30 36 24 50 Z" fill={hair} stroke="#20242E" strokeWidth="1.5" />
        {expression === 'correct' ? (
          <>
            <path d="M 40 56 Q 43 60 46 56" stroke="#20242E" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M 54 56 Q 57 60 60 56" stroke="#20242E" strokeWidth="2" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="43" cy="57" r="2.2" fill="#20242E" />
            <circle cx="57" cy="57" r="2.2" fill="#20242E" />
          </>
        )}
        <path d="M 44 70 Q 50 74 56 70" stroke="#20242E" strokeWidth="2" fill="none" strokeLinecap="round" />
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
        <div className="lang-toggle" role="group" aria-label={lang === 'fr' ? 'langue' : 'language'}>
          <button
            type="button"
            className={lang === 'fr' ? 'on' : ''}
            aria-pressed={lang === 'fr'}
            aria-label={lang === 'fr' ? 'Français' : 'Switch to French'}
            onClick={() => setLang('fr')}
          >
            FR
          </button>
          <button
            type="button"
            className={lang === 'en' ? 'on' : ''}
            aria-pressed={lang === 'en'}
            aria-label={lang === 'fr' ? 'Anglais' : 'English'}
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
