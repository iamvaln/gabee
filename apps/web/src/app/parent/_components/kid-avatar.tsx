import {
  HAIR_COLOR_HEX,
  HAIR_STYLE_PATHS,
  SHIRT_COLOR_HEX,
  SKIN_TONE_HEX,
  DEFAULT_AVATAR_LOOK,
  type HairColor,
  type HairStyle,
  type ShirtColor,
  type SkinTone,
} from '@gabee/types';

// Shared recolourable avatar for the whole parent surface — replaces the
// per-file `avatar === 'avatar_2' ? …` renders that used to live in kids list,
// kid detail, add/edit modal, classify, messages, etc. Same SVG as the kid
// app's ProfileAvatar; hex values come from the single palette in @gabee/types
// so a swatch and its rendered fill can never drift apart.
export function KidAvatar({
  skinTone,
  hairColor,
  hairStyle,
  shirtColor,
  size = 48,
  label,
}: {
  skinTone?: SkinTone | null;
  hairColor?: HairColor | null;
  hairStyle?: HairStyle | null;
  shirtColor?: ShirtColor | null;
  size?: number;
  label?: string;
}) {
  const skin = SKIN_TONE_HEX[skinTone ?? DEFAULT_AVATAR_LOOK.skinTone];
  const hair = HAIR_COLOR_HEX[hairColor ?? DEFAULT_AVATAR_LOOK.hairColor];
  const shirt = SHIRT_COLOR_HEX[shirtColor ?? DEFAULT_AVATAR_LOOK.shirtColor];
  const style = HAIR_STYLE_PATHS[hairStyle ?? DEFAULT_AVATAR_LOOK.hairStyle];
  const clip = `kidface-${skin.slice(1)}-${hair.slice(1)}-${shirt.slice(1)}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={label ?? 'avatar'}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <clipPath id={clip}>
          <circle cx="50" cy="50" r="48" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="48" fill={shirt} />
      <g clipPath={`url(#${clip})`}>
        <rect x="0" y="80" width="100" height="40" fill={shirt} />
        {/* back hair (long/afro/pigtails/bun) — behind the face */}
        {style.back && <path d={style.back} fill={hair} stroke="#20242E" strokeWidth="1.5" />}
        <ellipse cx="50" cy="56" rx="26" ry="30" fill={skin} stroke="#20242E" strokeWidth="1.5" />
        {/* front hair — over the forehead */}
        <path d={style.front} fill={hair} stroke="#20242E" strokeWidth="1.5" />
        <circle cx="43" cy="57" r="2.2" fill="#20242E" />
        <circle cx="57" cy="57" r="2.2" fill="#20242E" />
        <path d="M 44 70 Q 50 74 56 70" stroke="#20242E" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}
