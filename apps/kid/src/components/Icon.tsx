export type IconName =
  | 'home' | 'back' | 'gear' | 'lock' | 'star' | 'check' | 'cross' | 'play'
  | 'arrow-right' | 'wifi-off' | 'sound' | 'sound-off' | 'refresh' | 'sparkle'
  | 'arrow-up' | 'arrow-down' | 'arrow-left-i' | 'arrow-right-i' | 'loop';

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'home':
      return <svg {...common}><path d="M3 12 L12 4 L21 12" /><path d="M5 10 V20 H19 V10" /></svg>;
    case 'back':
      return <svg {...common}><path d="M15 5 L8 12 L15 19" /></svg>;
    case 'gear':
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M4.5 4.5 L6.5 6.5 M17.5 17.5 L19.5 19.5 M4.5 19.5 L6.5 17.5 M17.5 6.5 L19.5 4.5" /></svg>;
    case 'lock':
      return <svg {...common}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10 V7 a4 4 0 0 1 8 0 V10" /></svg>;
    case 'star':
      return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d="M12 2 L14.6 8.6 L21.5 9.3 L16 13.9 L17.6 21 L12 17.3 L6.4 21 L8 13.9 L2.5 9.3 L9.4 8.6 Z" /></svg>;
    case 'check':
      return <svg {...common}><path d="M5 12 L10 17 L19 7" /></svg>;
    case 'cross':
      return <svg {...common}><path d="M6 6 L18 18 M18 6 L6 18" /></svg>;
    case 'play':
      return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d="M7 4 L20 12 L7 20 Z" /></svg>;
    case 'arrow-right':
      return <svg {...common}><path d="M5 12 H19" /><path d="M13 6 L19 12 L13 18" /></svg>;
    case 'wifi-off':
      return <svg {...common}><path d="M3 8 a18 18 0 0 1 18 0" /><path d="M5 12 a13 13 0 0 1 14 0" /><path d="M8 15.5 a7 7 0 0 1 8 0" /><circle cx="12" cy="19" r="1" fill="currentColor" /><path d="M3 3 L21 21" stroke="white" strokeWidth="3" /><path d="M3 3 L21 21" /></svg>;
    case 'sound':
      return <svg {...common}><path d="M4 9 H7 L12 5 V19 L7 15 H4 Z" /><path d="M16 9 a4 4 0 0 1 0 6" /></svg>;
    case 'sound-off':
      return <svg {...common}><path d="M4 9 H7 L12 5 V19 L7 15 H4 Z" /><path d="M16 9 L21 14 M21 9 L16 14" /></svg>;
    case 'refresh':
      return <svg {...common}><path d="M4 12 a8 8 0 0 1 14-5 L20 9 M20 4 V9 H15" /><path d="M20 12 a8 8 0 0 1 -14 5 L4 15 M4 20 V15 H9" /></svg>;
    case 'sparkle':
      return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d="M12 2 L13 9 L20 10 L13 11 L12 18 L11 11 L4 10 L11 9 Z" /></svg>;
    case 'arrow-up':
      return <svg {...common}><path d="M12 19 V5 M6 11 L12 5 L18 11" /></svg>;
    case 'arrow-down':
      return <svg {...common}><path d="M12 5 V19 M6 13 L12 19 L18 13" /></svg>;
    case 'arrow-left-i':
      return <svg {...common}><path d="M19 12 H5 M11 6 L5 12 L11 18" /></svg>;
    case 'arrow-right-i':
      return <svg {...common}><path d="M5 12 H19 M13 6 L19 12 L13 18" /></svg>;
    case 'loop':
      return <svg {...common}><path d="M17 7 a6 6 0 0 1 0 10 H9" /><path d="M12 14 L9 17 L12 20" /></svg>;
    default:
      return null;
  }
}
