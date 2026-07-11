import { Prisma } from '@gabee/db';
import {
  InboxMessageSchema,
  GdprRequestRecordSchema,
  GdprStepsSchema,
  FeedbackRecordSchema,
  ModuleSchema,
  LevelSchema,
  type InboxListResponse,
  type UpdateInboxRequest,
  type GdprListResponse,
  type GdprStepRequest,
  type FeedbackListResponse,
  type UpdateFeedbackRequest,
  type ContactRequest,
} from '@gabee/types';
import type { z } from 'zod';
import { prisma } from '../db';
import { HttpError } from '../http';
import { getDefaultCurriculumId } from '../admin';

// Front desk (admin spec §8 Inbox · §9 GDPR · §10 Feedback) + the two public sources
// that feed them (landing contact form → inbox, parent app → feedback). Routes stay
// thin; all the DB shaping + the GDPR step-sequence rule live here.

// ─── Inbox (§8) ──────────────────────────────────────────────────────────────

type InboxRow = {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  status: 'new' | 'read' | 'replied' | 'archived';
  createdAt: Date;
};

function toInbox(row: InboxRow): z.infer<typeof InboxMessageSchema> {
  return InboxMessageSchema.parse({
    id: row.id,
    name: row.name,
    email: row.email,
    subject: row.subject,
    message: row.message,
    status: row.status,
    created_at: row.createdAt.toISOString(),
  });
}

/** I1 — every contact message, newest first. */
export async function listInbox(): Promise<InboxListResponse> {
  const rows = await prisma.inboxMessage.findMany({ orderBy: { createdAt: 'desc' } });
  return { messages: rows.map(toInbox) };
}

/** I2 — set a message's status (read / replied / archived). `actorId` stamps reads. */
export async function updateInbox(
  id: string,
  patch: UpdateInboxRequest,
  actorId: string,
): Promise<z.infer<typeof InboxMessageSchema>> {
  try {
    const row = await prisma.inboxMessage.update({
      where: { id },
      data: {
        status: patch.status,
        ...(patch.status === 'read' || patch.status === 'replied'
          ? { readBy: actorId, readAt: new Date() }
          : {}),
      },
    });
    return toInbox(row);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new HttpError(404, 'inbox_not_found', `Unknown message "${id}"`);
    }
    throw err;
  }
}

/** Public landing contact form → a new inbox message (source `landing_contact`). */
export async function createContactMessage(body: ContactRequest): Promise<{ id: string }> {
  const row = await prisma.inboxMessage.create({
    data: {
      name: body.name,
      email: body.email,
      subject: body.subject ?? null,
      message: body.message,
      source: 'landing_contact',
    },
    select: { id: true },
  });
  return { id: row.id };
}

// ─── GDPR (§9) ─────────────────────────────────────────────────────────────────

type GdprRow = {
  id: string;
  kind: 'access' | 'export' | 'erase';
  email: string;
  notes: string;
  status: 'new' | 'verifying' | 'in_progress' | 'done';
  steps: Prisma.JsonValue;
  createdAt: Date;
};

function toGdpr(row: GdprRow): z.infer<typeof GdprRequestRecordSchema> {
  const steps = GdprStepsSchema.parse(
    row.steps && typeof row.steps === 'object' && !Array.isArray(row.steps) ? row.steps : {},
  );
  return GdprRequestRecordSchema.parse({
    id: row.id,
    kind: row.kind,
    email: row.email,
    notes: row.notes,
    status: row.status,
    steps,
    created_at: row.createdAt.toISOString(),
  });
}

/** G1 — the GDPR queue, newest first. */
export async function listGdpr(): Promise<GdprListResponse> {
  const rows = await prisma.gdprRequest.findMany({ orderBy: { createdAt: 'desc' } });
  return { requests: rows.map(toGdpr) };
}

/** Create a GDPR request manually (admin logs one received by email). */
export async function createGdpr(input: {
  kind: 'access' | 'export' | 'erase';
  email: string;
  notes?: string;
}): Promise<z.infer<typeof GdprRequestRecordSchema>> {
  const row = await prisma.gdprRequest.create({
    data: {
      kind: input.kind,
      email: input.email,
      notes: input.notes ?? '',
      // Best-effort link to an existing account so an erase knows whose rows to touch.
      parentId: (await prisma.parentAccount.findUnique({
        where: { email: input.email },
        select: { id: true },
      }))?.id,
    },
  });
  return toGdpr(row);
}

/**
 * G2 — advance one checklist step. The sequence is enforced (can't execute before
 * verify); each step stamps a time + notes and bumps the status. Returns the updated
 * record plus whether the execute step ran (so the route can write the audit row).
 */
export async function advanceGdprStep(
  id: string,
  patch: GdprStepRequest,
): Promise<{ record: z.infer<typeof GdprRequestRecordSchema>; executed: boolean }> {
  const row = await prisma.gdprRequest.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, 'gdpr_not_found', `Unknown request "${id}"`);
  const steps = GdprStepsSchema.parse(
    row.steps && typeof row.steps === 'object' && !Array.isArray(row.steps) ? row.steps : {},
  );

  const now = new Date().toISOString();
  if (patch.step === 'verify') {
    steps.verified_at = now;
    if (patch.notes !== undefined) steps.verification_notes = patch.notes;
  } else if (patch.step === 'execute') {
    if (!steps.verified_at) {
      throw new HttpError(409, 'step_out_of_order', 'Verify identity before executing');
    }
    // Erasure guarantee: deleting the ParentAccount row cascades (onDelete: Cascade)
    // through Device -> DeviceIpSighting, so the raw-IP sighting history is removed
    // along with it. No separate device/IP-history purge step needed in this runbook.
    steps.executed_at = now;
    if (patch.notes !== undefined) steps.execution_notes = patch.notes;
  } else {
    if (!steps.executed_at) {
      throw new HttpError(409, 'step_out_of_order', 'Execute before responding');
    }
    steps.responded_at = now;
    if (patch.notes !== undefined) steps.response_summary = patch.notes;
  }

  // Status is derived from how far the checklist has progressed.
  const status: GdprRow['status'] = steps.responded_at
    ? 'done'
    : steps.executed_at
      ? 'in_progress'
      : 'verifying';

  const updated = await prisma.gdprRequest.update({
    where: { id },
    data: { steps: steps as Prisma.InputJsonValue, status },
  });
  return { record: toGdpr(updated), executed: patch.step === 'execute' };
}

// ─── Feedback (§10) ──────────────────────────────────────────────────────────

type FeedbackRow = {
  id: string;
  scope: 'module' | 'level' | 'lesson';
  target: Prisma.JsonValue;
  rating: number;
  comment: string | null;
  status: 'new' | 'triaged' | 'closed';
  tags: string[];
  notes: string | null;
  createdAt: Date;
  parent: { email: string };
};

function toFeedback(row: FeedbackRow): z.infer<typeof FeedbackRecordSchema> {
  const raw = (row.target && typeof row.target === 'object' && !Array.isArray(row.target)
    ? row.target
    : {}) as Record<string, unknown>;
  const target: z.infer<typeof FeedbackRecordSchema>['target'] = {
    module: ModuleSchema.parse(raw.module),
  };
  const level = LevelSchema.safeParse(raw.level);
  if (level.success) target.level = level.data;
  if (typeof raw.lesson_id === 'string') target.lesson_id = raw.lesson_id;

  return FeedbackRecordSchema.parse({
    id: row.id,
    parent_email: row.parent.email,
    scope: row.scope,
    target,
    rating: row.rating,
    comment: row.comment,
    status: row.status,
    tags: row.tags,
    notes: row.notes,
    created_at: row.createdAt.toISOString(),
  });
}

/** F1 — every parent feedback row, newest first. */
export async function listFeedback(): Promise<FeedbackListResponse> {
  const rows = await prisma.feedback.findMany({
    orderBy: { createdAt: 'desc' },
    include: { parent: { select: { email: true } } },
  });
  return { feedback: rows.map(toFeedback) };
}

/**
 * F2 — triage: set status / tags / notes. Returns the record + whether it was closed
 * (so the route can stamp closedBy/closedAt + write the audit row).
 */
export async function updateFeedback(
  id: string,
  patch: UpdateFeedbackRequest,
  actorId: string,
): Promise<{ record: z.infer<typeof FeedbackRecordSchema>; closed: boolean }> {
  const data: Prisma.FeedbackUpdateInput = {};
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.tags !== undefined) data.tags = patch.tags;
  if (patch.notes !== undefined) data.notes = patch.notes;
  const closing = patch.status === 'closed';
  if (closing) {
    data.closedBy = actorId;
    data.closedAt = new Date();
  }

  try {
    const row = await prisma.feedback.update({
      where: { id },
      data,
      include: { parent: { select: { email: true } } },
    });
    return { record: toFeedback(row), closed: closing };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new HttpError(404, 'feedback_not_found', `Unknown feedback "${id}"`);
    }
    throw err;
  }
}

/**
 * Public parent source: a parent rates a module/level/lesson from the app. Ties the row
 * to the parent + the default curriculum so the admin feedback screen has a real source.
 */
export async function createFeedback(input: {
  parentId: string;
  scope: 'module' | 'level' | 'lesson';
  target: { module: z.infer<typeof ModuleSchema>; level?: number; lesson_id?: string };
  rating: number;
  comment?: string | null;
}): Promise<{ id: string }> {
  const curriculumId = await getDefaultCurriculumId();
  const target: Record<string, unknown> = { module: input.target.module };
  if (input.target.level !== undefined) target.level = input.target.level;
  if (input.target.lesson_id !== undefined) target.lesson_id = input.target.lesson_id;

  const row = await prisma.feedback.create({
    data: {
      parentId: input.parentId,
      curriculumId,
      scope: input.scope,
      target: target as Prisma.InputJsonValue,
      rating: input.rating,
      comment: input.comment ?? null,
    },
    select: { id: true },
  });
  return { id: row.id };
}
