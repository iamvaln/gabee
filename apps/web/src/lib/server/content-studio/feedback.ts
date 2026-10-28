import { Prisma } from '@gabee/db';
import { CONTENT_PLATFORMS, DirectionProposalsSchema, type AgentKey, type ContentPlatform, type FeedbackSentiment } from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';
import { writeAudit } from '../audit';
import type { OwnerFeedbackEntry, ReplacedProposal } from './memory';
import { ymdOf, type Actor } from './state';

/**
 * The owner's feedback to the agents (layers 1 and 2 of « retours aux
 * agents »): a 👍/👎 and/or a note on a proposed direction or a day title
 * (→ the Strategist) or on a draft (→ its writer, or the Art director for its
 * media). Each run then reads the recent feedback for its agent
 * (`owner_feedback` memory block). Feedback on a direction is the card's
 * current state: one row per (week, proposal, admin), updated in place, and
 * removed when both the 👍/👎 and the note are cleared. Notes on days and
 * drafts append. Every write is audited (`content.feedback.record`).
 */

export type FeedbackSubject =
  | { kind: 'direction'; weekId: string; proposalIndex: number }
  | { kind: 'title'; slotId: string }
  | { kind: 'draft'; draftId: string; about?: 'text' | 'media' };

export type FeedbackInput = FeedbackSubject & { sentiment?: FeedbackSentiment | null; note?: string | null };

export type FeedbackDto = {
  id: string;
  agent_key: AgentKey;
  subject_kind: FeedbackSubject['kind'];
  subject_id: string;
  week_id: string;
  proposal_index: number | null;
  sentiment: FeedbackSentiment | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

/** The viewer's feedback on each direction on screen (the cards' 👍/👎 and note). */
export type DirectionFeedbackDto = { proposal_index: number; sentiment: FeedbackSentiment | null; note: string | null };

/** A subject summary is a reminder of what was judged, never a full text. */
const SUMMARY_MAX = 200;
const RECENT_LIMIT = 15;
const RECENT_DAYS = 60;
const DAY_MS = 86_400_000;

const PLATFORM_NAME: Record<ContentPlatform, string> = { linkedin: 'LinkedIn', tiktok: 'TikTok' };

type Row = Prisma.OwnerFeedbackGetPayload<object>;

const asSentiment = (v: string | null): FeedbackSentiment | null => (v === 'up' || v === 'down' ? v : null);
const clip = (text: string) => (text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1)}…` : text);

function toDto(row: Row): FeedbackDto {
  return {
    id: row.id,
    agent_key: row.agentKey as AgentKey,
    subject_kind: row.subjectKind as FeedbackSubject['kind'],
    subject_id: row.subjectId,
    week_id: row.weekId,
    proposal_index: row.proposalIndex,
    sentiment: asSentiment(row.sentiment),
    note: row.note,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

const notFound = (code: string, what: string) => new HttpError(404, code, `${what} n'existe pas (ou plus). Rechargez la page.`);
const saysNothing = () => new HttpError(422, 'validation_error', 'Indiquez un avis (👍 ou 👎) ou écrivez un mot.');

/** What the feedback is about, resolved and checked: its agent, week and a reminder of the subject. */
type Resolved = { agentKey: AgentKey; subjectId: string; weekId: string; proposalIndex: number | null; summary: string };

async function resolveSubject(subject: FeedbackSubject): Promise<Resolved> {
  switch (subject.kind) {
    case 'direction': {
      const week = await prisma.contentWeek.findUnique({ where: { id: subject.weekId }, select: { id: true, proposals: true } });
      if (!week) throw notFound('week_not_found', 'Cette semaine');
      const parsed = week.proposals === null ? null : DirectionProposalsSchema.safeParse(week.proposals);
      if (parsed && !parsed.success) throw new Error('The week holds malformed direction proposals.');
      const proposal = parsed?.data.proposals[subject.proposalIndex];
      if (!proposal) throw new HttpError(422, 'unknown_proposal', "Cette direction n'existe pas (ou plus). Rechargez la page.");
      return { agentKey: 'strategist', subjectId: week.id, weekId: week.id, proposalIndex: subject.proposalIndex, summary: clip(proposal.title) };
    }
    case 'title': {
      const slot = await prisma.contentSlot.findUnique({ where: { id: subject.slotId }, select: { id: true, weekId: true, date: true, topic: true } });
      if (!slot) throw notFound('slot_not_found', 'Ce jour');
      return { agentKey: 'strategist', subjectId: slot.id, weekId: slot.weekId, proposalIndex: null, summary: clip(`${ymdOf(slot.date)} · ${slot.topic}`) };
    }
    case 'draft': {
      const draft = await prisma.contentDraft.findUnique({
        where: { id: subject.draftId },
        select: { id: true, platform: true, slot: { select: { weekId: true, date: true, topic: true } } },
      });
      if (!draft) throw notFound('draft_not_found', 'Ce brouillon');
      if (!(CONTENT_PLATFORMS as readonly string[]).includes(draft.platform)) throw new Error(`Unknown content platform "${draft.platform}".`);
      const platform = draft.platform as ContentPlatform;
      const media = subject.about === 'media';
      const agentKey: AgentKey = media ? 'art_director' : platform === 'linkedin' ? 'writer_linkedin' : 'writer_tiktok';
      const summary = `${PLATFORM_NAME[platform]} · ${ymdOf(draft.slot.date)} · ${draft.slot.topic}`;
      return { agentKey, subjectId: draft.id, weekId: draft.slot.weekId, proposalIndex: null, summary: clip(media ? `${summary} (média)` : summary) };
    }
  }
}

/**
 * Record the owner's feedback. Checks the subject exists (404) — and for a
 * direction that the week has that proposal (422 `unknown_proposal`) — then
 * writes it for the agent concerned and audits it. A direction's feedback
 * replaces the admin's previous one on that proposal (null: both cleared,
 * the row is removed); a note on a day or a draft is added. A blank note is
 * no note; a feedback on a day or a draft that says nothing is a 422.
 */
export async function recordFeedback(input: FeedbackInput, actor: Actor): Promise<FeedbackDto | null> {
  const note = input.note?.trim() || null;
  const sentiment = input.sentiment ?? null;
  const subject = await resolveSubject(input);
  const base = { subject_kind: input.kind, subject_id: subject.subjectId, agent_key: subject.agentKey };

  if (input.kind === 'direction') {
    const key = { subjectKind: 'direction', subjectId: subject.subjectId, proposalIndex: input.proposalIndex, actorId: actor.id };
    const before = await prisma.ownerFeedback.findUnique({ where: { subjectKind_subjectId_proposalIndex_actorId: key } });
    let row: Row | null = null;
    if (!sentiment && !note) {
      if (before) await prisma.ownerFeedback.deleteMany({ where: { id: before.id } });
    } else {
      row = await prisma.ownerFeedback.upsert({
        where: { subjectKind_subjectId_proposalIndex_actorId: key },
        create: { ...key, agentKey: subject.agentKey, weekId: subject.weekId, subjectSummary: subject.summary, sentiment, note },
        update: { sentiment, note, subjectSummary: subject.summary },
      });
    }
    await writeAudit({
      actorId: actor.id,
      actorRole: actor.role,
      kind: 'content.feedback.record',
      targetKind: 'content_week',
      targetId: subject.weekId,
      diff: {
        ...base,
        proposal_index: input.proposalIndex,
        before: before ? { sentiment: before.sentiment, note: before.note } : null,
        after: row ? { sentiment, note } : null,
      },
    });
    return row ? toDto(row) : null;
  }

  if (!sentiment && !note) throw saysNothing();
  const row = await prisma.ownerFeedback.create({
    data: {
      agentKey: subject.agentKey,
      subjectKind: input.kind,
      subjectId: subject.subjectId,
      weekId: subject.weekId,
      subjectSummary: subject.summary,
      sentiment,
      note,
      actorId: actor.id,
    },
  });
  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    kind: 'content.feedback.record',
    targetKind: input.kind === 'title' ? 'content_slot' : 'content_draft',
    targetId: subject.subjectId,
    diff: { ...base, feedback_id: row.id, sentiment, note },
  });
  return toDto(row);
}

const ON: Record<string, OwnerFeedbackEntry['on']> = { direction: 'direction', title: 'day_title', draft: 'draft_text' };

/**
 * The owner's recent feedback for `agentKey` (memory layer 2): the last
 * `limit` rows of the last `days` days, newest change first (ties by id, so
 * the block is deterministic). `excludeId`: the run's own instruction, sent
 * in its own block.
 */
export async function recentFeedbackFor(
  agentKey: AgentKey,
  opts: { limit?: number; days?: number; now?: Date; excludeId?: string } = {},
): Promise<OwnerFeedbackEntry[]> {
  const now = opts.now ?? new Date();
  const rows = await prisma.ownerFeedback.findMany({
    where: {
      agentKey,
      updatedAt: { gte: new Date(now.getTime() - (opts.days ?? RECENT_DAYS) * DAY_MS) },
      ...(opts.excludeId ? { id: { not: opts.excludeId } } : {}),
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: opts.limit ?? RECENT_LIMIT,
  });
  return rows.map((r) => ({
    date: ymdOf(r.updatedAt),
    on: r.subjectKind === 'draft' && r.agentKey === 'art_director' ? 'draft_media' : (ON[r.subjectKind] ?? 'draft_text'),
    subject: r.subjectSummary,
    sentiment: asSentiment(r.sentiment),
    note: r.note,
  }));
}

/** The viewer's feedback on the directions on screen (proposals replaced since are left out). */
export async function weekDirectionFeedback(weekIds: string[], viewerId: string): Promise<Map<string, DirectionFeedbackDto[]>> {
  const out = new Map<string, DirectionFeedbackDto[]>(weekIds.map((id) => [id, []]));
  if (weekIds.length === 0) return out;
  const rows = await prisma.ownerFeedback.findMany({
    where: { subjectKind: 'direction', subjectId: { in: weekIds }, proposalIndex: { not: null }, actorId: viewerId },
    orderBy: { proposalIndex: 'asc' },
  });
  for (const r of rows) {
    out.get(r.subjectId)?.push({ proposal_index: r.proposalIndex!, sentiment: asSentiment(r.sentiment), note: r.note });
  }
  return out;
}

/**
 * Before « Régénérer les propositions » clears them: the week's proposals
 * with every admin's 👍/👎 and notes on each, for the new proposals run.
 */
export async function replacedProposals(weekId: string, proposals: ReadonlyArray<{ title: string; rationale: string }>): Promise<ReplacedProposal[]> {
  const rows = await prisma.ownerFeedback.findMany({
    where: { subjectKind: 'direction', subjectId: weekId, proposalIndex: { not: null } },
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
  });
  return proposals.map((p, i) => ({
    title: p.title,
    rationale: p.rationale,
    feedback: rows.filter((r) => r.proposalIndex === i).map((r) => ({ sentiment: asSentiment(r.sentiment), note: r.note })),
  }));
}

/**
 * The proposals are being replaced: their feedback stays (memory, with the
 * title it was about) but no longer belongs to a card on screen.
 */
export async function detachDirectionFeedback(tx: Prisma.TransactionClient, weekId: string): Promise<number> {
  const res = await tx.ownerFeedback.updateMany({ where: { subjectKind: 'direction', subjectId: weekId, proposalIndex: { not: null } }, data: { proposalIndex: null } });
  return res.count;
}
