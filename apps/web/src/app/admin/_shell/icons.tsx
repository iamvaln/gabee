// Admin icon set (ported from the admin design handoff `admin-shell.jsx`).
export type AdminIconName =
  | 'dashboard' | 'modules' | 'content' | 'users' | 'inbox' | 'shield' | 'feedback'
  | 'analytics' | 'ops' | 'gear' | 'search' | 'bell' | 'chevron-right' | 'chevron-down'
  | 'plus' | 'check' | 'x' | 'edit' | 'refresh' | 'sparkle' | 'stop' | 'external'
  | 'filter' | 'dots' | 'lock' | 'wifi-off' | 'alert' | 'clock' | 'mail' | 'trash'
  | 'eye' | 'play' | 'arrow-up-r' | 'arrow-down-r' | 'cost' | 'device' | 'tag' | 'pause-circle'
  | 'logout';

export function AIcon({ name, size = 18 }: { name: AdminIconName; size?: number }) {
  const s = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'dashboard': return <svg {...s}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>;
    case 'modules': return <svg {...s}><path d="M12 3 21 7.5 12 12 3 7.5 Z" /><path d="M3 12 12 16.5 21 12" /><path d="M3 16.5 12 21 21 16.5" /></svg>;
    case 'content': return <svg {...s}><path d="M5 3h9l5 5v13H5Z" /><path d="M14 3v5h5" /><path d="m10.5 12.5.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9Z" fill="currentColor" stroke="none" /></svg>;
    case 'users': return <svg {...s}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6" /><path d="M17.5 14.4A5.5 5.5 0 0 1 20.5 19.5" /></svg>;
    case 'inbox': return <svg {...s}><path d="M3 5h18v14H3Z" /><path d="M3 13h5l2 3h4l2-3h5" /></svg>;
    case 'shield': return <svg {...s}><path d="M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6Z" /><path d="m9 12 2 2 4-4" /></svg>;
    case 'feedback': return <svg {...s}><path d="M4 5h16v11H8l-4 4Z" /><path d="M8 9h8M8 12h5" /></svg>;
    case 'analytics': return <svg {...s}><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-7" /></svg>;
    case 'ops': return <svg {...s}><rect x="3" y="4" width="18" height="6" rx="1.5" /><rect x="3" y="14" width="18" height="6" rx="1.5" /><path d="M7 7h.01M7 17h.01" /></svg>;
    case 'gear': return <svg {...s}><circle cx="12" cy="12" r="3" /><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8" /></svg>;
    case 'search': return <svg {...s}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>;
    case 'bell': return <svg {...s}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>;
    case 'chevron-right': return <svg {...s}><path d="m9 5 7 7-7 7" /></svg>;
    case 'chevron-down': return <svg {...s}><path d="m5 9 7 7 7-7" /></svg>;
    case 'plus': return <svg {...s}><path d="M12 5v14M5 12h14" /></svg>;
    case 'check': return <svg {...s}><path d="m5 12 5 5 9-10" /></svg>;
    case 'x': return <svg {...s}><path d="M6 6 18 18M18 6 6 18" /></svg>;
    case 'edit': return <svg {...s}><path d="M4 20h4l10-10-4-4L4 16Z" /><path d="m13.5 6.5 4 4" /></svg>;
    case 'refresh': return <svg {...s}><path d="M4 11a8 8 0 0 1 14-5l2 2" /><path d="M20 4v5h-5" /><path d="M20 13a8 8 0 0 1-14 5l-2-2" /><path d="M4 20v-5h5" /></svg>;
    case 'sparkle': return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d="M12 2c.5 4 1.5 5.5 6 6-4.5.5-5.5 2-6 6-.5-4-1.5-5.5-6-6 4.5-.5 5.5-2 6-6Z" /><path d="M18.5 13c.3 2 .8 2.7 3 3-2.2.3-2.7 1-3 3-.3-2-.8-2.7-3-3 2.2-.3 2.7-1 3-3Z" /></svg>;
    case 'stop': return <svg {...s}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>;
    case 'external': return <svg {...s}><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M18 14v6H4V4h6" /></svg>;
    case 'filter': return <svg {...s}><path d="M3 5h18l-7 8v6l-4-2v-4Z" /></svg>;
    case 'dots': return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>;
    case 'lock': return <svg {...s}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
    case 'wifi-off': return <svg {...s}><path d="M3 8a18 18 0 0 1 5-3M12 4a18 18 0 0 1 9 4M5 12a13 13 0 0 1 4-2.5M12 11a8 8 0 0 1 4 1.4M8.5 15.5a7 7 0 0 1 3-1.2" /><circle cx="12" cy="19" r="1" fill="currentColor" /><path d="M3 3 21 21" /></svg>;
    case 'alert': return <svg {...s}><path d="M12 3 22 20H2Z" /><path d="M12 9v5M12 17h.01" /></svg>;
    case 'clock': return <svg {...s}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case 'mail': return <svg {...s}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>;
    case 'trash': return <svg {...s}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>;
    case 'eye': return <svg {...s}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>;
    case 'play': return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d="M7 4 19 12 7 20Z" /></svg>;
    case 'arrow-up-r': return <svg {...s}><path d="M7 17 17 7M9 7h8v8" /></svg>;
    case 'arrow-down-r': return <svg {...s}><path d="M7 7 17 17M17 9v8H9" /></svg>;
    case 'cost': return <svg {...s}><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.2a2.3 2.3 0 0 1 2.5-1.2c1.4 0 2.3.8 2.3 1.9 0 2.4-4.6 1.5-4.6 4 0 1.1 1 1.9 2.3 1.9a2.3 2.3 0 0 0 2.5-1.2" /></svg>;
    case 'device': return <svg {...s}><rect x="6" y="3" width="12" height="18" rx="2" /><path d="M10 18h4" /></svg>;
    case 'tag': return <svg {...s}><path d="M3 7v5l9 9 7-7-9-9H5Z" /><circle cx="8" cy="9" r="1.3" fill="currentColor" /></svg>;
    case 'pause-circle': return <svg {...s}><circle cx="12" cy="12" r="9" /><path d="M10 9v6M14 9v6" /></svg>;
    case 'logout': return <svg {...s}><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" /><path d="m16 8 4 4-4 4" /><path d="M20 12H10" /></svg>;
    default: return null;
  }
}
