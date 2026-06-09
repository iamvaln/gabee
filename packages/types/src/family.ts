import { z } from 'zod';

/**
 * Family / co-parents / devices / notifications contracts
 * (parent spec §9 / §10.4 / §10.5, changes-v1 §4). Phase 1 cap is 2 parents
 * per child, enforced in the API layer.
 */

// ─── Enums ───────────────────────────────────────────────────────────────────

export const CoparentLinkRoleSchema = z.enum(['primary', 'coparent']);
export type CoparentLinkRole = z.infer<typeof CoparentLinkRoleSchema>;

export const CoparentInviteStatusSchema = z.enum([
  'pending',
  'accepted',
  'declined',
  'expired',
  'cancelled',
]);
export type CoparentInviteStatus = z.infer<typeof CoparentInviteStatusSchema>;

export const NotificationDigestCadenceSchema = z.enum([
  'daily',
  'every_2_days',
  'weekly',
  'off',
]);
export type NotificationDigestCadence = z.infer<typeof NotificationDigestCadenceSchema>;

export const FamilyActionKindSchema = z.enum([
  'session_classified',
  'feedback_left',
  'feedback_edited',
  'kid_added',
  'kid_edited',
  'kid_removed',
  'device_paired',
  'device_revoked',
  'coparent_invited',
  'coparent_joined',
  'coparent_removed',
  'message_sent',
  'message_deleted',
]);
export type FamilyActionKind = z.infer<typeof FamilyActionKindSchema>;

// ─── Family panel (FAM1) ─────────────────────────────────────────────────────

export const FamilyLinkSchema = z.object({
  parent_id: z.uuid(),
  email: z.email(),
  display_name_for_kids: z.string(),
  role: CoparentLinkRoleSchema,
  joined_at: z.iso.datetime(),
  /** Children shared with this parent. */
  children: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
export type FamilyLink = z.infer<typeof FamilyLinkSchema>;

export const CoparentInviteRowSchema = z.object({
  id: z.uuid(),
  invitee_email: z.email(),
  child_ids: z.array(z.uuid()),
  personal_note: z.string().nullable(),
  status: CoparentInviteStatusSchema,
  expires_at: z.iso.datetime(),
  created_at: z.iso.datetime(),
});
export type CoparentInviteRow = z.infer<typeof CoparentInviteRowSchema>;

export const FamilyPanelResponseSchema = z.object({
  /** Parents linked to ANY of the requester's children, including the requester. */
  links: z.array(FamilyLinkSchema),
  pending_invites: z.array(CoparentInviteRowSchema),
});
export type FamilyPanelResponse = z.infer<typeof FamilyPanelResponseSchema>;

export const CreateCoparentInviteRequestSchema = z.object({
  invitee_email: z.email(),
  personal_note: z.string().max(500).optional(),
});
export type CreateCoparentInviteRequest = z.infer<typeof CreateCoparentInviteRequestSchema>;

export const AcceptCoparentInviteRequestSchema = z.object({
  token: z.string().min(20),
});
export type AcceptCoparentInviteRequest = z.infer<typeof AcceptCoparentInviteRequestSchema>;

// ─── Paired devices (ST3) ────────────────────────────────────────────────────

export const DeviceLinkRowSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  user_agent_hint: z.string().nullable(),
  paired_at: z.iso.datetime(),
  last_active_at: z.iso.datetime().nullable(),
});
export type DeviceLinkRow = z.infer<typeof DeviceLinkRowSchema>;

export const DevicesListResponseSchema = z.object({
  devices: z.array(DeviceLinkRowSchema),
});
export type DevicesListResponse = z.infer<typeof DevicesListResponseSchema>;

export const SendPairLinkRequestSchema = z.object({
  /** Where the email lands. Optional now — if omitted, the server skips the
   *  email send and just returns the link + short_code in the response, which
   *  is the right shape for the in-app "show the code" path. */
  target_email: z.email().optional(),
  /** Friendly device label the parent picks ahead of time. */
  label: z.string().min(1).max(50),
});
export type SendPairLinkRequest = z.infer<typeof SendPairLinkRequestSchema>;

export const SendPairLinkResponseSchema = z.object({
  /** Echoed back so a dev can copy it from the response when no Mailgun is wired. */
  pair_url: z.url(),
  /** 6-char human-typable code (`XXX-XXX`). The parent reads it to the
   *  device-holder; the kid PWA accepts it via /api/pair/claim-code AFTER a
   *  parent login — that login is the actual gate against brute force. */
  short_code: z.string().regex(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/),
  expires_at: z.iso.datetime(),
});
export type SendPairLinkResponse = z.infer<typeof SendPairLinkResponseSchema>;

export const ClaimDevicePairRequestSchema = z.object({
  token: z.string().min(20),
  /** Reported by the kid PWA from its window — used as the "Home computer · …" label. */
  user_agent_hint: z.string().max(160).optional(),
});
export type ClaimDevicePairRequest = z.infer<typeof ClaimDevicePairRequestSchema>;

export const ClaimPairCodeRequestSchema = z.object({
  /** Accepted in any case / with or without the dash — server normalises. */
  code: z.string().min(6).max(8),
  user_agent_hint: z.string().max(160).optional(),
});
export type ClaimPairCodeRequest = z.infer<typeof ClaimPairCodeRequestSchema>;

export const ClaimDevicePairResponseSchema = z.object({
  /** A standard parent-bearer JWT scoped to the paired account. The kid app keeps it. */
  token: z.string(),
  expires_at: z.iso.datetime(),
  device_id: z.uuid(),
  /** The parent the kid app is now signed in as — the kid store needs id+email
   * to populate `parent` without doing a follow-up call. */
  parent: z.object({
    id: z.uuid(),
    email: z.email(),
  }),
});
export type ClaimDevicePairResponse = z.infer<typeof ClaimDevicePairResponseSchema>;

// ─── Notification preferences (ST4) ──────────────────────────────────────────

export const NotificationPrefsSchema = z.object({
  classification_digest: NotificationDigestCadenceSchema,
  weekly_summary: z.boolean(),
  feedback_response: z.boolean(),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefsSchema>;

export const UpdateNotificationPrefsRequestSchema = NotificationPrefsSchema.partial();
export type UpdateNotificationPrefsRequest = z.infer<typeof UpdateNotificationPrefsRequestSchema>;

// ─── Family activity feed (§7.1 recent activity) ─────────────────────────────

export const FamilyActivityRowSchema = z.object({
  id: z.uuid(),
  child_id: z.uuid(),
  child_name: z.string(),
  actor_parent_id: z.uuid(),
  actor_display_name: z.string(),
  /** True if the actor is the requester (UI says "You ..."). */
  actor_is_self: z.boolean(),
  action: FamilyActionKindSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
  created_at: z.iso.datetime(),
});
export type FamilyActivityRow = z.infer<typeof FamilyActivityRowSchema>;

export const FamilyActivityResponseSchema = z.object({
  activity: z.array(FamilyActivityRowSchema),
});
export type FamilyActivityResponse = z.infer<typeof FamilyActivityResponseSchema>;
