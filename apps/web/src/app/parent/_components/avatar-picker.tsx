'use client';

import {
  SKIN_TONES,
  HAIR_COLORS,
  HAIR_STYLES,
  SHIRT_COLORS,
  type Gender,
  type HairColor,
  type HairStyle,
  type Language,
  type ShirtColor,
  type SkinTone,
} from '@gabee/types';
import { KidAvatar } from './kid-avatar';

// Parent-facing avatar customiser: a live preview + colour rows (skin / hair /
// shirt) and a hairstyle row (mini-avatar shape previews). Shared by the add +
// edit kid forms. Palettes + shapes come from @gabee/types so a swatch always
// matches its rendered fill.

const LABELS: Record<'gender' | 'skin' | 'hair' | 'style' | 'shirt', { fr: string; en: string }> = {
  gender: { fr: 'Genre', en: 'Gender' },
  skin: { fr: 'Peau', en: 'Skin' },
  hair: { fr: 'Couleur cheveux', en: 'Hair colour' },
  style: { fr: 'Coiffure', en: 'Hairstyle' },
  shirt: { fr: 'Habit', en: 'Shirt' },
};

const GENDER_LABELS: Record<Gender, { fr: string; en: string }> = {
  boy: { fr: 'Garçon', en: 'Boy' },
  girl: { fr: 'Fille', en: 'Girl' },
};

export interface AvatarLook {
  skinTone: SkinTone;
  hairColor: HairColor;
  hairStyle: HairStyle;
  shirtColor: ShirtColor;
  gender: Gender | null;
}

export function AvatarPicker({
  value,
  onChange,
  lang,
  name,
}: {
  value: AvatarLook;
  onChange: (next: AvatarLook) => void;
  lang: Language;
  name?: string;
}) {
  return (
    <div className="avatar-picker">
      <div className="avatar-picker-preview">
        <KidAvatar
          skinTone={value.skinTone}
          hairColor={value.hairColor}
          hairStyle={value.hairStyle}
          shirtColor={value.shirtColor}
          gender={value.gender}
          size={88}
          label={name || 'avatar'}
        />
      </div>
      <div className="avatar-picker-rows">
        {/* Gender = face contour; barely legible at 40px, so each option
            carries a text label. Clicking the selected one clears back to
            unspecified (renders as the boy face). */}
        <div className="swatch-row">
          <span className="swatch-row-label">{LABELS.gender[lang]}</span>
          <div className="swatch-row-options" role="radiogroup" aria-label={LABELS.gender[lang]}>
            {(['boy', 'girl'] as const).map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={value.gender === g}
                aria-label={GENDER_LABELS[g][lang]}
                className={'style-swatch' + (value.gender === g ? ' on' : '')}
                style={{ height: 'auto', paddingBottom: 2 }}
                onClick={() => onChange({ ...value, gender: value.gender === g ? null : g })}
              >
                <KidAvatar
                  skinTone={value.skinTone}
                  hairColor={value.hairColor}
                  hairStyle={value.hairStyle}
                  shirtColor={value.shirtColor}
                  gender={g}
                  size={40}
                  label={GENDER_LABELS[g][lang]}
                />
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, textAlign: 'center' }}>
                  {GENDER_LABELS[g][lang]}
                </span>
              </button>
            ))}
          </div>
        </div>
        <SwatchRow
          label={LABELS.skin[lang]}
          options={SKIN_TONES}
          selected={value.skinTone}
          onSelect={(id) => onChange({ ...value, skinTone: id as SkinTone })}
        />
        <SwatchRow
          label={LABELS.hair[lang]}
          options={HAIR_COLORS}
          selected={value.hairColor}
          onSelect={(id) => onChange({ ...value, hairColor: id as HairColor })}
        />
        {/* Hairstyle = shapes, so each option is a mini-avatar preview showing
            the style with the currently-chosen skin + hair colour. */}
        <div className="swatch-row">
          <span className="swatch-row-label">{LABELS.style[lang]}</span>
          <div className="swatch-row-options" role="radiogroup" aria-label={LABELS.style[lang]}>
            {HAIR_STYLES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={value.hairStyle === s}
                aria-label={s}
                className={'style-swatch' + (value.hairStyle === s ? ' on' : '')}
                onClick={() => onChange({ ...value, hairStyle: s })}
              >
                <KidAvatar
                  skinTone={value.skinTone}
                  hairColor={value.hairColor}
                  hairStyle={s}
                  shirtColor={value.shirtColor}
                  gender={value.gender}
                  size={40}
                  label={s}
                />
              </button>
            ))}
          </div>
        </div>
        <SwatchRow
          label={LABELS.shirt[lang]}
          options={SHIRT_COLORS}
          selected={value.shirtColor}
          onSelect={(id) => onChange({ ...value, shirtColor: id as ShirtColor })}
        />
      </div>
    </div>
  );
}

function SwatchRow({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: { id: string; hex: string }[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="swatch-row">
      <span className="swatch-row-label">{label}</span>
      <div className="swatch-row-options" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={selected === o.id}
            aria-label={o.id}
            className={'swatch' + (selected === o.id ? ' on' : '')}
            style={{ background: o.hex }}
            onClick={() => onSelect(o.id)}
          />
        ))}
      </div>
    </div>
  );
}
