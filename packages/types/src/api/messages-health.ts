import { z } from 'zod';

/**
 * Admin Messages feature-health dashboard contract (changes-v1 §1.5).
 *
 * STRICT PRIVACY BOUNDARY: this payload carries ONLY counts, rates, timestamps and
 * distributions — never message content. The service that builds it is responsible
 * for never selecting the `text` column of `kid_messages`.
 *
 * Lives in its own file (not folded into `kid-message.ts`) to keep the privacy contract
 * visually separate from the parent-side message shapes, which DO carry text.
 */

export const MessagesHealthRangeSchema = z.enum(['7d', '30d', '90d', 'all']);
export type MessagesHealthRange = z.infer<typeof MessagesHealthRangeSchema>;

/** Volume counters for the selected window (or all-time). */
export const MessagesVolumeSchema = z.object({
  sent: z.number().int().min(0),
  delivered: z.number().int().min(0),
  read: z.number().int().min(0),
  deleted: z.number().int().min(0),
});
export type MessagesVolume = z.infer<typeof MessagesVolumeSchema>;

/** Funnel mirrors volume but is shaped for the dedicated viz. */
export const MessagesFunnelSchema = z.object({
  sent: z.number().int().min(0),
  delivered: z.number().int().min(0),
  read: z.number().int().min(0),
});
export type MessagesFunnel = z.infer<typeof MessagesFunnelSchema>;

/** Time-to-read histogram: 5 buckets — < 5min, 5-30min, 30min-2h, 2h-24h, > 24h. */
export const MessagesTtrHistogramSchema = z.tuple([
  z.number().int().min(0),
  z.number().int().min(0),
  z.number().int().min(0),
  z.number().int().min(0),
  z.number().int().min(0),
]);
export type MessagesTtrHistogram = z.infer<typeof MessagesTtrHistogramSchema>;

/** Send-frequency histogram: 4 buckets — 1, 2-5, 6-10, 10+ messages per sender. */
export const MessagesFreqHistogramSchema = z.tuple([
  z.number().int().min(0),
  z.number().int().min(0),
  z.number().int().min(0),
  z.number().int().min(0),
]);
export type MessagesFreqHistogram = z.infer<typeof MessagesFreqHistogramSchema>;

/** Full response served by GET /api/admin/messages-health. */
export const MessagesHealthResponseSchema = z.object({
  range: MessagesHealthRangeSchema,
  volume: MessagesVolumeSchema,
  /** read / delivered for the selected range; 0 when delivered is 0. */
  read_rate: z.number().min(0).max(1),
  /** Same metric for the immediately previous, equal-length window. null on 'all'. */
  read_rate_prev: z.number().min(0).max(1).nullable(),
  /** Median time-to-read in minutes (delivery → read tap). */
  median_ttr_minutes: z.number().min(0),
  /** Distribution of TTR across the 5 fixed buckets. */
  ttr_histogram: MessagesTtrHistogramSchema,
  /** Distinct parents who sent ≥ 1 message in the window. */
  active_senders: z.number().int().min(0),
  /** Distinct children who received ≥ 1 message in the window. */
  active_recipients: z.number().int().min(0),
  /** Messages per active sender, bucketed (1, 2-5, 6-10, 10+). */
  send_frequency_histogram: MessagesFreqHistogramSchema,
  funnel: MessagesFunnelSchema,
  /** 8-week adoption curve: % of all parents who have ever sent, per week. */
  adoption_curve_weekly: z.array(z.number().min(0).max(100)),
  /** 4-week sender-retention cohort: % of senders returning N+1..N+4. */
  sender_retention: z.tuple([
    z.number().min(0).max(100),
    z.number().min(0).max(100),
    z.number().min(0).max(100),
    z.number().min(0).max(100),
  ]),
  /** Share of parents-who-classified-today who also sent a message that day. */
  classification_to_message_coupling: z.number().min(0).max(1),
});
export type MessagesHealthResponse = z.infer<typeof MessagesHealthResponseSchema>;
