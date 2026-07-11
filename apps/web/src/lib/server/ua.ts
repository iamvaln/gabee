import { UAParser } from 'ua-parser-js';

export interface ParsedUa {
  os: string | null;
  osVersion: string | null;
  browser: string | null;
  browserVersion: string | null;
  deviceType: 'mobile' | 'tablet' | 'desktop' | null;
  deviceModel: string | null;
}

/**
 * Parse a raw user-agent server-side (single source of truth; re-parsable if the
 * library improves). ua-parser reports device.type only for mobile/tablet/etc;
 * absent type ⇒ desktop.
 */
export function parseUa(ua: string): ParsedUa {
  const r = new UAParser(ua).getResult();
  const t = r.device.type;
  const deviceType = t === 'mobile' || t === 'tablet' ? t : 'desktop';
  return {
    os: r.os.name ?? null,
    osVersion: r.os.version ?? null,
    browser: r.browser.name ?? null,
    browserVersion: r.browser.version ?? null,
    deviceType,
    deviceModel: r.device.model ?? null,
  };
}
