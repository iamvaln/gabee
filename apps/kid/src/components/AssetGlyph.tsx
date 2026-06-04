/**
 * AssetGlyph — renders a content asset key (e.g. `"house"`, `"cat"`) as a large
 * emoji. The Curriculum v0.1 seed references images/objects by stable keys in
 * `config.image` / `config.object` (see docs/gabee-seed-schema-v1.md §2); this is
 * the single source of truth mapping those keys to what the kid actually sees.
 *
 * Colour keys (`red`, `blue`…) render as a coloured swatch rather than an emoji,
 * so adjective/colour questions don't leak the word. Unknown keys fall back to a
 * neutral placeholder (so a missing key is visible, never blank).
 */

const EMOJI: Record<string, string> = {
  apple: '🍎', ball: '⚽', banana: '🍌', bed: '🛏️', bee: '🐝', bird: '🐦',
  book: '📖', bread: '🍞', butterfly: '🦋', car: '🚗', carrot: '🥕', cat: '🐱',
  chair: '🪑', crab: '🦀', dog: '🐶', door: '🚪', elephant: '🐘', fish: '🐟',
  flower: '🌸', foot: '🦶', friend: '🧒', frog: '🐸', giraffe: '🦒', grapes: '🍇',
  hand: '✋', house: '🏠', lemon: '🍋', lion: '🦁', milk: '🥛', monkey: '🐵',
  moon: '🌙', onion: '🧅', owl: '🦉', parrot: '🦜', pineapple: '🍍', school: '🏫',
  snake: '🐍', star: '⭐', strawberry: '🍓', sun: '☀️', table: '🍽️', tomato: '🍅',
  tree: '🌳', turtle: '🐢', water: '💧', watermelon: '🍉',
};

const COLOR: Record<string, string> = {
  red: '#EF4444', blue: '#3B82F6', green: '#22C55E', yellow: '#FACC15',
  black: '#1F2937', white: '#F8FAFC', orange: '#F97316', pink: '#EC4899',
  brown: '#92400E', purple: '#8B5CF6', grey: '#9CA3AF', gray: '#9CA3AF',
};

/** Does the asset map know this key? Useful for choosing image vs text layout. */
export function hasAsset(key: string | undefined): boolean {
  return !!key && (key in EMOJI || key in COLOR);
}

export function AssetGlyph({ name, size = 120 }: { name: string | undefined; size?: number }) {
  if (name && name in COLOR) {
    return (
      <span
        aria-label={name}
        style={{
          display: 'inline-block', width: size, height: size, borderRadius: size * 0.18,
          background: COLOR[name], border: '3px solid rgba(0,0,0,0.12)',
        }}
      />
    );
  }
  const glyph = (name && EMOJI[name]) || '❓';
  return (
    <span aria-label={name} style={{ fontSize: size, lineHeight: 1, display: 'inline-block' }}>
      {glyph}
    </span>
  );
}
