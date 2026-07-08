'use client';

import {
  SKIN_TONES,
  HAIR_COLORS,
  HAIR_STYLES,
  SHIRT_COLORS,
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

const LABELS: Record<'skin' | 'hair' | 'style' | 'shirt', { fr: string; en: string }> = {
  skin: { fr: 'Peau', en: 'Skin' },
  hair: { fr: 'Couleur cheveux', en: 'Hair colour' },
  style: { fr: 'Coiffure', en: 'Hairstyle' },
  shirt: { fr: 'Habit', en: 'Shirt' },
};

export interface AvatarLook {
  skinTone: SkinTone;
  hairColor: HairColor;
  hairStyle: HairStyle;
  shirtColor: ShirtColor;
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
          size={88}
          label={name || 'avatar'}
        />
      </div>
      <div className="avatar-picker-rows">
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
