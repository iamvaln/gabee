import '../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { createTestClient, resetDb, createParent, createChild } from '@gabee/db/testing';
import {
  getFamilyPanel,
  createCoparentInvite,
  cancelCoparentInvite,
  acceptCoparentInvite,
  removeCoparent,
} from './family';
import { HttpError } from '../http';
import { AUTH_JWT_SECRET } from '../env';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

const baseUrl = 'https://app.gabee.test';
const randomUuid = '00000000-0000-0000-0000-000000000000';

/**
 * `createCoparentInvite` / `getFamilyPanel` derive "my children" from
 * `ParentChildLink`, NOT `ChildProfile.parentId` — the `createChild` factory
 * only sets the latter. Every test below must seed the primary link itself.
 */
async function linkPrimary(parentId: string, childId: string) {
  return prisma.parentChildLink.create({
    data: { parentId, childId, role: 'primary' },
  });
}

// ─── Happy path ──────────────────────────────────────────────────────────────

test('invite → accept: co-parent gets a ParentChildLink and both parents see the child via getFamilyPanel', async () => {
  const parentA = await createParent(prisma);
  const parentB = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parentA.id });
  await linkPrimary(parentA.id, child.id);

  const { invite, token } = await createCoparentInvite(parentA.id, baseUrl, {
    invitee_email: parentB.email,
  });
  assert.equal(invite.status, 'pending');
  assert.deepEqual(invite.child_ids, [child.id]);

  const row = await prisma.coparentInvite.findUniqueOrThrow({ where: { id: invite.id } });
  assert.equal(row.status, 'pending');
  assert.equal(row.inviterParentId, parentA.id);
  assert.equal(row.inviteeEmail, parentB.email.toLowerCase());

  const result = await acceptCoparentInvite(parentB.id, parentB.email, token);
  assert.deepEqual(result.children, [{ id: child.id, name: child.name }]);

  const link = await prisma.parentChildLink.findUnique({
    where: { parentId_childId: { parentId: parentB.id, childId: child.id } },
  });
  assert.ok(link, 'accept must create a ParentChildLink for the invitee');
  assert.equal(link!.role, 'coparent');

  const acceptedRow = await prisma.coparentInvite.findUniqueOrThrow({ where: { id: invite.id } });
  assert.equal(acceptedRow.status, 'accepted');

  const panelA = await getFamilyPanel(parentA.id);
  const panelB = await getFamilyPanel(parentB.id);
  const parentIdsInA = panelA.links.map((l) => l.parent_id).sort();
  const parentIdsInB = panelB.links.map((l) => l.parent_id).sort();
  assert.deepEqual(parentIdsInA, [parentA.id, parentB.id].sort());
  assert.deepEqual(parentIdsInB, [parentA.id, parentB.id].sort());
  for (const link of panelB.links) {
    assert.deepEqual(link.children.map((c) => c.id), [child.id]);
  }
});

test('removeCoparent revokes access: the removed parent no longer sees the child', async () => {
  const parentA = await createParent(prisma);
  const parentB = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parentA.id });
  await linkPrimary(parentA.id, child.id);

  const { token } = await createCoparentInvite(parentA.id, baseUrl, {
    invitee_email: parentB.email,
  });
  await acceptCoparentInvite(parentB.id, parentB.email, token);

  const result = await removeCoparent(parentA.id, parentB.id);
  assert.deepEqual(result.removed_child_ids, [child.id]);

  const link = await prisma.parentChildLink.findUnique({
    where: { parentId_childId: { parentId: parentB.id, childId: child.id } },
  });
  assert.equal(link, null);

  const panelB = await getFamilyPanel(parentB.id);
  assert.equal(panelB.links.length, 1, 'parent B with no linked children falls to the no-kids branch');
  assert.equal(panelB.links[0]!.parent_id, parentB.id);
  assert.equal(panelB.links[0]!.children.length, 0);
});

// ─── Phase-1 cap: 2 ParentChildLink rows per child ──────────────────────────

test('createCoparentInvite 409s with coparent_cap once a child already has 2 linked parents', async () => {
  const parentA = await createParent(prisma);
  const parentB = await createParent(prisma);
  const parentC = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parentA.id });
  await linkPrimary(parentA.id, child.id);

  const { token } = await createCoparentInvite(parentA.id, baseUrl, {
    invitee_email: parentB.email,
  });
  await acceptCoparentInvite(parentB.id, parentB.email, token);

  const linkCount = await prisma.parentChildLink.count({ where: { childId: child.id } });
  assert.equal(linkCount, 2);

  await assert.rejects(
    () => createCoparentInvite(parentA.id, baseUrl, { invitee_email: parentC.email }),
    (e: unknown) => e instanceof HttpError && e.status === 409 && e.code === 'coparent_cap',
  );
});

test('acceptCoparentInvite re-checks the cap at accept-time: a pending invite 409s if the cap fills in the meantime', async () => {
  const parentA = await createParent(prisma);
  const parentB = await createParent(prisma);
  const parentC = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parentA.id });
  await linkPrimary(parentA.id, child.id);

  // Invite B first (cap not yet reached), then invite + accept C to fill the
  // cap before B gets around to accepting.
  const inviteB = await createCoparentInvite(parentA.id, baseUrl, { invitee_email: parentB.email });
  const inviteC = await createCoparentInvite(parentA.id, baseUrl, { invitee_email: parentC.email });
  await acceptCoparentInvite(parentC.id, parentC.email, inviteC.token);

  await assert.rejects(
    () => acceptCoparentInvite(parentB.id, parentB.email, inviteB.token),
    (e: unknown) => e instanceof HttpError && e.status === 409 && e.code === 'coparent_cap',
  );

  // No side effect: B never got linked.
  const link = await prisma.parentChildLink.findUnique({
    where: { parentId_childId: { parentId: parentB.id, childId: child.id } },
  });
  assert.equal(link, null);
});

// ─── Ownership / cross-family boundaries (the crux) ─────────────────────────

test('cancelCoparentInvite by a STRANGER (not the inviter) 404s and does not cancel the invite', async () => {
  const parentA = await createParent(prisma);
  const stranger = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parentA.id });
  await linkPrimary(parentA.id, child.id);

  const { invite } = await createCoparentInvite(parentA.id, baseUrl, {
    invitee_email: 'someone@test.gabee.local',
  });

  await assert.rejects(
    () => cancelCoparentInvite(stranger.id, invite.id),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'invite_not_found',
  );

  const row = await prisma.coparentInvite.findUniqueOrThrow({ where: { id: invite.id } });
  assert.equal(row.status, 'pending', 'a stranger must not be able to cancel another family\'s invite');
});

test('cancelCoparentInvite by the INVITER cancels it', async () => {
  const parentA = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parentA.id });
  await linkPrimary(parentA.id, child.id);

  const { invite } = await createCoparentInvite(parentA.id, baseUrl, {
    invitee_email: 'someone@test.gabee.local',
  });

  await cancelCoparentInvite(parentA.id, invite.id);

  const row = await prisma.coparentInvite.findUniqueOrThrow({ where: { id: invite.id } });
  assert.equal(row.status, 'cancelled');
});

test('removeCoparent by a STRANGER from a different family 404s and does not touch the link', async () => {
  const parentA = await createParent(prisma);
  const parentB = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parentA.id });
  await linkPrimary(parentA.id, child.id);

  const { token } = await createCoparentInvite(parentA.id, baseUrl, {
    invitee_email: parentB.email,
  });
  await acceptCoparentInvite(parentB.id, parentB.email, token);

  // The stranger has their own, unrelated family — not a member of A/B's link.
  const stranger = await createParent(prisma);
  const strangerChild = await createChild(prisma, { parentId: stranger.id });
  await linkPrimary(stranger.id, strangerChild.id);

  await assert.rejects(
    () => removeCoparent(stranger.id, parentB.id),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'link_not_found',
  );

  const link = await prisma.parentChildLink.findUnique({
    where: { parentId_childId: { parentId: parentB.id, childId: child.id } },
  });
  assert.ok(link, 'a stranger must not be able to remove another family\'s co-parent link');
});

test('getFamilyPanel only returns the caller\'s own children — never leaks another family\'s kids', async () => {
  const parentA = await createParent(prisma);
  const childA = await createChild(prisma, { parentId: parentA.id });
  await linkPrimary(parentA.id, childA.id);

  const stranger = await createParent(prisma);
  const strangerChild = await createChild(prisma, { parentId: stranger.id });
  await linkPrimary(stranger.id, strangerChild.id);

  const panel = await getFamilyPanel(stranger.id);
  const allChildIds = panel.links.flatMap((l) => l.children.map((c) => c.id));
  assert.ok(
    !allChildIds.includes(childA.id),
    'getFamilyPanel(stranger) must not include another family\'s child',
  );
  assert.deepEqual(allChildIds, [strangerChild.id]);
});

test('acceptCoparentInvite 403s when the accepting email does not match the invite\'s invitee — a stranger cannot hijack a token meant for someone else', async () => {
  const parentA = await createParent(prisma);
  const parentB = await createParent(prisma);
  const stranger = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parentA.id });
  await linkPrimary(parentA.id, child.id);

  const { token } = await createCoparentInvite(parentA.id, baseUrl, {
    invitee_email: parentB.email,
  });

  // The stranger somehow obtains the token (e.g. it leaked) but their session
  // email doesn't match who it was issued to.
  await assert.rejects(
    () => acceptCoparentInvite(stranger.id, stranger.email, token),
    (e: unknown) => e instanceof HttpError && e.status === 403 && e.code === 'email_mismatch',
  );

  const link = await prisma.parentChildLink.findUnique({
    where: { parentId_childId: { parentId: stranger.id, childId: child.id } },
  });
  assert.equal(link, null);
});

test('acceptCoparentInvite 409s re-accepting an already-accepted invite', async () => {
  const parentA = await createParent(prisma);
  const parentB = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parentA.id });
  await linkPrimary(parentA.id, child.id);

  const { token } = await createCoparentInvite(parentA.id, baseUrl, {
    invitee_email: parentB.email,
  });
  await acceptCoparentInvite(parentB.id, parentB.email, token);

  await assert.rejects(
    () => acceptCoparentInvite(parentB.id, parentB.email, token),
    (e: unknown) => e instanceof HttpError && e.status === 409 && e.code === 'invite_not_pending',
  );
});

test('acceptCoparentInvite 410s an expired invite and flips its status to expired', async () => {
  const parentA = await createParent(prisma);
  const parentB = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parentA.id });
  await linkPrimary(parentA.id, child.id);

  const { invite, token } = await createCoparentInvite(parentA.id, baseUrl, {
    invitee_email: parentB.email,
  });
  await prisma.coparentInvite.update({
    where: { id: invite.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });

  await assert.rejects(
    () => acceptCoparentInvite(parentB.id, parentB.email, token),
    (e: unknown) => e instanceof HttpError && e.status === 410 && e.code === 'invite_expired',
  );

  const row = await prisma.coparentInvite.findUniqueOrThrow({ where: { id: invite.id } });
  assert.equal(row.status, 'expired');

  const link = await prisma.parentChildLink.findUnique({
    where: { parentId_childId: { parentId: parentB.id, childId: child.id } },
  });
  assert.equal(link, null);
});

test('acceptCoparentInvite 400s on a garbage token', async () => {
  const parentB = await createParent(prisma);
  await assert.rejects(
    () => acceptCoparentInvite(parentB.id, parentB.email, 'not-a-real-token'),
    (e: unknown) => e instanceof HttpError && e.status === 400 && e.code === 'invalid_token',
  );
});

test('acceptCoparentInvite 404s on a well-formed token whose invite row is gone', async () => {
  const parentB = await createParent(prisma);
  // Signed the same way the service signs invite tokens (mirrors
  // `signInviteToken` in family.ts — same secret derivation, same claim
  // shape), but for an inviteId that never existed as a row.
  const secret = new TextEncoder().encode(
    process.env.COPARENT_INVITE_SECRET ?? `${AUTH_JWT_SECRET}:invite`,
  );
  const token = await new SignJWT({ inviteId: randomUuid })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
    .sign(secret);

  await assert.rejects(
    () => acceptCoparentInvite(parentB.id, parentB.email, token),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'invite_not_found',
  );
});
