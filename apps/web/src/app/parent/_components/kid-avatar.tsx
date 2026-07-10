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
  type ShirtColor,
  type SkinTone,
  type Gender,
} from '@gabee/types';

const INK = '#20242E';

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
  gender,
  size = 48,
  label,
}: {
  skinTone?: SkinTone | null;
  hairColor?: HairColor | null;
  hairStyle?: HairStyle | null;
  shirtColor?: ShirtColor | null;
  gender?: Gender | null;
  size?: number;
  label?: string;
}) {
  const skin = SKIN_TONE_HEX[skinTone ?? DEFAULT_AVATAR_LOOK.skinTone];
  const hair = HAIR_COLOR_HEX[hairColor ?? DEFAULT_AVATAR_LOOK.hairColor];
  const shirt = SHIRT_COLOR_HEX[shirtColor ?? DEFAULT_AVATAR_LOOK.shirtColor];
  const style = HAIR_STYLE_PATHS[hairStyle ?? DEFAULT_AVATAR_LOOK.hairStyle];
  const face = FACE_PATHS[gender ?? 'boy'];
  const clip = `kidface-${skin.slice(1)}-${hair.slice(1)}-${shirt.slice(1)}-${hairStyle ?? ''}-${gender ?? ''}`;
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
      {/* neutral disc — the shirt colour now dresses the shoulders, not the bg */}
      <circle cx="50" cy="50" r="48" fill={AVATAR_BG} />
      <g clipPath={`url(#${clip})`}>
        {/* shoulders / shirt */}
        <path d="M 12 100 Q 13 78 34 74 Q 42 72 50 72 Q 58 72 66 74 Q 87 78 88 100 Z" fill={shirt} stroke={INK} strokeWidth="1.5" />
        {/* neck */}
        <path d="M 44 66 L 44 76 Q 50 80 56 76 L 56 66 Z" fill={skin} stroke={INK} strokeWidth="1.2" />
        {/* back hair silhouette (frames top + sides) */}
        <path d={style.back} fill={hair} stroke={INK} strokeWidth="1.5" />
        {/* ears */}
        <circle cx="31" cy="53" r="4.5" fill={skin} stroke={INK} strokeWidth="1.2" />
        <circle cx="69" cy="53" r="4.5" fill={skin} stroke={INK} strokeWidth="1.2" />
        {/* face */}
        <path d={face} fill={skin} stroke={INK} strokeWidth="1.5" />
        {/* fringe over the forehead */}
        <path d={style.fringe} fill={hair} stroke={INK} strokeWidth="1.2" />
        {/* front-facing features */}
        <circle cx="43" cy="50" r="2.3" fill={INK} />
        <circle cx="57" cy="50" r="2.3" fill={INK} />
        <path d="M 50 53 Q 52 58 49 59" fill="none" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
        <path d="M 44 63 Q 50 67 56 63" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
      </g>
    </svg>
  );
}
