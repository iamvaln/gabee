import { z } from 'zod';

/**
 * Kid gifts API — auditable bonus-stars gifts (loyalty / compensation). A gift is
 * a RECORD (see the KidGift Prisma model): the kid taps "Accept the gift" → the
 * amount is ADDED to total_stars (additive, may overflow any target) and the row
 * flips to `claimed`. Score changes are never silent; the gift history is the audit.
 */
export const KidGiftStatusSchema = z.enum(['pending', 'claimed', 'revoked']);
export type KidGiftStatus = z.infer<typeof KidGiftStatusSchema>;

// DTO surfaced to the kid app. Internal audit fields (reason / grantedBy /
// claimedTotalStars) stay server-side — the kid only needs the headline.
export const KidGiftSchema = z.object({
  id: z.uuid(),
  amount: z.number().int(),
  label: z.string(),
  status: KidGiftStatusSchema,
  created_at: z.iso.datetime(),
  claimed_at: z.iso.datetime().nullable(),
});
export type KidGift = z.infer<typeof KidGiftSchema>;

// GET /api/gifts/pending?child_id=<id> — unclaimed gifts for one child.
export const PendingGiftsResponseSchema = z.object({ gifts: z.array(KidGiftSchema) });
export type PendingGiftsResponse = z.infer<typeof PendingGiftsResponseSchema>;

// POST /api/gifts/claim — apply a pending gift (additive). Idempotent: claiming an
// already-claimed gift returns its state without double-adding.
export const ClaimGiftRequestSchema = z.object({ gift_id: z.uuid() });
export type ClaimGiftRequest = z.infer<typeof ClaimGiftRequestSchema>;

export const ClaimGiftResponseSchema = z.object({
  gift_id: z.uuid(),
  status: KidGiftStatusSchema,
  amount: z.number().int(),
  /** Resulting total after applying — the kid app animates to this. */
  total_stars: z.number().int().min(0),
});
export type ClaimGiftResponse = z.infer<typeof ClaimGiftResponseSchema>;
