import {
  KidMessageSchema,
  ParentKidMessageRowSchema,
  KidPendingMessageSchema,
  type CreateMessageRequest,
  type KidMessage,
  type KidPendingMessage,
  type ParentKidMessageRow,
} from '@gabee/types';
import type { Prisma } from '@gabee/db';
import { prisma } from '../db';
import { HttpError } from '../http';
import { assertParentCanAccessKid } from '../kid-access';

// Service for parent → kid messages (changes-v1 §1, parent spec §8). All DB shaping
// lives here; routes are thin Zod-validated wrappers. The kid app sees ONLY the
// sender's display_name_for_kids (never the real email or first name of the parent).

interface KidMessageRow {
  id: string;
  fromParentId: string;
  toChildId: string;
  text: string;
  status: 'unread' | 'read' | 'deleted_by_sender';
  createdAt: Date;
  readAt: Date | null;
  deletedAt: Date | null;
}

function rowToKidMessage(row: KidMessageRow): KidMessage {
  return KidMessageSchema.parse({
    id: row.id,
    from_parent_id: row.fromParentId,
    to_child_id: row.toChildId,
    text: row.text,
    status: row.status,
    created_at: row.createdAt.toISOString(),
    read_at: row.readAt ? row.readAt.toISOString() : null,
    deleted_at: row.deletedAt ? row.deletedAt.toISOString() : null,
  });
}

/**
 * Look up the parent's display_name_for_kids; falls back to the first part of the
 * email if the parent hasn't customised it yet (parent spec §10.1).
 */
async function resolveDisplayName(parentId: string): Promise<string> {
  const p = await prisma.parentAccount.findUnique({
    where: { id: parentId },
    select: { displayNameForKids: true, email: true },
  });
  if (!p) throw new HttpError(404, 'parent_not_found', 'Parent account not found');
  const trimmed = (p.displayNameForKids || '').trim();
  if (trimmed) return trimmed;
  const local = p.email.split('@')[0] ?? p.email;
  return local;
}

/** POST /api/messages — parent creates a new message for one of their kids. */
export async function createMessage(
  parentId: string,
  input: CreateMessageRequest,
): Promise<KidMessage> {
  // Privacy boundary: the parent must be the primary parent OR a linked
  // co-parent of this kid. Throws 404 (matches the legacy error shape).
  await assertParentCanAccessKid(parentId, input.to_child_id);

  const row = await prisma.kidMessage.create({
    data: {
      fromParentId: parentId,
      toChildId: input.to_child_id,
      text: input.text,
    },
  });
  // Activation funnel: stamp firstMessageSentAt on the parent for the
  // first delivered message. Sequential (not transactional) — if the
  // funnel update fails the message still goes through; the metric will
  // catch the next message sent by the same parent. Idempotent via the
  // WHERE filter on the null column.
  await prisma.parentAccount.updateMany({
    where: { id: parentId, firstMessageSentAt: null },
    data: { firstMessageSentAt: row.createdAt },
  });
  return rowToKidMessage(row);
}

/** GET /api/messages — list a parent's sent messages, optionally filtered by child. */
export async function listParentMessages(
  parentId: string,
  toChildId?: string,
): Promise<ParentKidMessageRow[]> {
  const where: Prisma.KidMessageWhereInput = {
    fromParentId: parentId,
    ...(toChildId ? { toChildId } : {}),
  };
  const rows = await prisma.kidMessage.findMany({
    where,
    include: {
      toChild: { select: { name: true, avatar: true } },
      fromParent: { select: { displayNameForKids: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((row) => {
    const base = rowToKidMessage(row);
    const displayName =
      (row.fromParent.displayNameForKids || '').trim() ||
      (row.fromParent.email.split('@')[0] ?? row.fromParent.email);
    return ParentKidMessageRowSchema.parse({
      ...base,
      to_child_name: row.toChild.name,
      to_child_avatar: row.toChild.avatar,
      from_display_name: displayName,
    });
  });
}

/** GET /api/messages/[id] — fetch a single message that this parent sent. */
export async function getMessageForParent(
  parentId: string,
  id: string,
): Promise<ParentKidMessageRow> {
  const row = await prisma.kidMessage.findFirst({
    where: { id, fromParentId: parentId },
    include: {
      toChild: { select: { name: true, avatar: true } },
      fromParent: { select: { displayNameForKids: true, email: true } },
    },
  });
  if (!row) throw new HttpError(404, 'message_not_found', 'Message not found');
  const base = rowToKidMessage(row);
  const displayName =
    (row.fromParent.displayNameForKids || '').trim() ||
    (row.fromParent.email.split('@')[0] ?? row.fromParent.email);
  return ParentKidMessageRowSchema.parse({
    ...base,
    to_child_name: row.toChild.name,
    to_child_avatar: row.toChild.avatar,
    from_display_name: displayName,
  });
}

export interface DeleteResult {
  message: KidMessage;
  ageAtDeletionMs: number;
}

/**
 * DELETE /api/messages/[id] — soft-delete (`status='deleted_by_sender'`) only while
 * unread. 409 once the kid has read it (parent spec §8.6 — read is immutable).
 */
export async function deleteUnreadMessage(parentId: string, id: string): Promise<DeleteResult> {
  const row = await prisma.kidMessage.findFirst({
    where: { id, fromParentId: parentId },
  });
  if (!row) throw new HttpError(404, 'message_not_found', 'Message not found');
  if (row.status === 'read') {
    throw new HttpError(409, 'already_read', 'Message has already been read and cannot be deleted');
  }
  if (row.status === 'deleted_by_sender') {
    return { message: rowToKidMessage(row), ageAtDeletionMs: 0 };
  }
  const deletedAt = new Date();
  const updated = await prisma.kidMessage.update({
    where: { id },
    data: { status: 'deleted_by_sender', deletedAt },
  });
  return {
    message: rowToKidMessage(updated),
    ageAtDeletionMs: Math.max(0, deletedAt.getTime() - row.createdAt.getTime()),
  };
}

/**
 * GET /api/messages/pending?child_id=… — what the kid app should surface as bandeaux.
 * Returns ONLY unread messages for a child that belongs to this parent (privacy).
 * Joins the parent's display_name_for_kids so the kid sees who left the note.
 */
export async function listPendingForChild(
  parentId: string,
  childId: string,
): Promise<KidPendingMessage[]> {
  await assertParentCanAccessKid(parentId, childId);
  const rows = await prisma.kidMessage.findMany({
    where: { toChildId: childId, status: 'unread' },
    include: { fromParent: { select: { displayNameForKids: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => {
    const base = rowToKidMessage(row);
    const displayName =
      (row.fromParent.displayNameForKids || '').trim() ||
      (row.fromParent.email.split('@')[0] ?? row.fromParent.email);
    return KidPendingMessageSchema.parse({ ...base, from_display_name: displayName });
  });
}

export interface MarkReadResult {
  message: KidMessage;
  /** The child the message was sent to — used by the route to emit the read event. */
  childId: string;
  /** ms from message creation → read tap. Until we record a delivery timestamp on
   * the row, we use `created_at` as the proxy for first-bandeau. Health dashboard
   * still reads `created_at` and the kid-side `parent_message_delivered_to_kid`
   * event when finer-grained TTR is needed. */
  timeToReadMs: number;
}

/**
 * POST /api/messages/[id]/read — kid app marks a message as read. Validates the
 * message's `toChildId` belongs to the parent on whose JWT the kid app is acting.
 * Idempotent: a second call returns the already-read row, time_to_read_ms = 0.
 */
export async function markAsRead(parentId: string, messageId: string): Promise<MarkReadResult> {
  const row = await prisma.kidMessage.findUnique({
    where: { id: messageId },
    include: { toChild: { select: { parentId: true } } },
  });
  if (!row) throw new HttpError(404, 'message_not_found', 'Message not found');
  if (row.toChild.parentId !== parentId) {
    throw new HttpError(403, 'forbidden', 'Message does not belong to this household');
  }
  if (row.status === 'read') {
    return { message: rowToKidMessage(row), childId: row.toChildId, timeToReadMs: 0 };
  }
  if (row.status === 'deleted_by_sender') {
    throw new HttpError(409, 'deleted', 'Message has been withdrawn by the sender');
  }
  const readAt = new Date();
  const updated = await prisma.kidMessage.update({
    where: { id: messageId },
    data: { status: 'read', readAt },
  });
  return {
    message: rowToKidMessage(updated),
    childId: row.toChildId,
    timeToReadMs: Math.max(0, readAt.getTime() - row.createdAt.getTime()),
  };
}

/** Count of unread messages this parent has sent (for the (M) badge on the nav). */
export async function countUnreadFromParent(parentId: string): Promise<number> {
  return prisma.kidMessage.count({
    where: { fromParentId: parentId, status: 'unread' },
  });
}
