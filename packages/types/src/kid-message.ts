import { z } from 'zod';

/**
 * Parent → kid message (changes-v1 §4.2, parent spec §8). 1-200 chars text, immutable
 * once read, soft-deletable while unread. Bilingual fields on the wire are dates as
 * ISO strings; we coerce to Date at the boundary.
 */

export const KidMessageStatusSchema = z.enum(['unread', 'read', 'deleted_by_sender']);
export type KidMessageStatus = z.infer<typeof KidMessageStatusSchema>;

/** Shape returned by the API. */
export const KidMessageSchema = z.object({
  id: z.uuid(),
  from_parent_id: z.uuid(),
  to_child_id: z.uuid(),
  text: z.string().min(1).max(200),
  status: KidMessageStatusSchema,
  created_at: z.iso.datetime(),
  read_at: z.iso.datetime().nullable(),
  deleted_at: z.iso.datetime().nullable(),
});
export type KidMessage = z.infer<typeof KidMessageSchema>;

/** What the sender sees on M1 — adds the recipient kid name + avatar for the row. */
export const ParentKidMessageRowSchema = KidMessageSchema.extend({
  to_child_name: z.string(),
  to_child_avatar: z.string(),
  from_display_name: z.string(),
});
export type ParentKidMessageRow = z.infer<typeof ParentKidMessageRowSchema>;

/** POST /api/messages — body. */
export const CreateMessageRequestSchema = z.object({
  to_child_id: z.uuid(),
  text: z.string().trim().min(1).max(200),
});
export type CreateMessageRequest = z.infer<typeof CreateMessageRequestSchema>;

/** GET /api/messages?to=<child_id> — response. */
export const ParentMessagesListResponseSchema = z.object({
  messages: z.array(ParentKidMessageRowSchema),
});
export type ParentMessagesListResponse = z.infer<typeof ParentMessagesListResponseSchema>;

/** GET /api/messages/pending?child_id=<id> — kid app payload (no display_name yet — joined from parent). */
export const KidPendingMessageSchema = KidMessageSchema.extend({
  from_display_name: z.string(),
});
export type KidPendingMessage = z.infer<typeof KidPendingMessageSchema>;
export const KidPendingMessagesResponseSchema = z.object({
  messages: z.array(KidPendingMessageSchema),
});
export type KidPendingMessagesResponse = z.infer<typeof KidPendingMessagesResponseSchema>;
