import { z } from 'zod';
import { LanguageSchema } from './enums';

/**
 * Client-collected device snapshot (design 2026-07-10). Rides on the event-sync
 * request; the SERVER adds IP + parses the UA. Kept minimal — no fingerprinting
 * beyond what the UA/screen/tz already expose.
 */
export const DeviceSnapshotSchema = z.object({
  /** Stable per-install id (localStorage UUID). */
  device_id: z.uuid(),
  /** Raw user-agent; parsed server-side into os/browser/type. */
  ua_full: z.string().max(400),
  screen_w: z.number().int().positive().max(20000).nullable().default(null),
  screen_h: z.number().int().positive().max(20000).nullable().default(null),
  dpr: z.number().positive().max(10).nullable().default(null),
  /** IANA zone, e.g. "Europe/Paris". */
  tz: z.string().max(64),
  /** Minutes from UTC (e.g. +120 for CEST). */
  tz_offset_min: z.number().int().min(-1000).max(1000),
  locale: LanguageSchema,
  app_version: z.string().max(40).nullable().default(null),
  pwa_standalone: z.boolean().default(false),
});
export type DeviceSnapshot = z.infer<typeof DeviceSnapshotSchema>;
