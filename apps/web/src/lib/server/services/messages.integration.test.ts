import '../../../test/setup-integration';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestClient, resetDb, createParent, createChild } from '@gabee/db/testing';
import {
  createMessage,
  listParentMessages,
  getMessageForParent,
  deleteUnreadMessage,
  listPendingForChild,
  markAsRead,
  countUnreadFromParent,
} from './messages';
import { HttpError } from '../http';

const prisma = createTestClient();
beforeEach(async () => resetDb(prisma));
after(async () => prisma.$disconnect());

const randomUuid = '00000000-0000-0000-0000-000000000000';

test('createMessage creates a message; listParentMessages(parentId) returns it', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });

  const message = await createMessage(parent.id, { to_child_id: child.id, text: 'Bonne chance !' });

  assert.equal(message.status, 'unread');
  assert.equal(message.to_child_id, child.id);
  assert.equal(message.text, 'Bonne chance !');

  const list = await listParentMessages(parent.id);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.id, message.id);
  assert.equal(list[0]!.to_child_name, child.name);
});

test("createMessage 404s when the child doesn't belong to the parent (send-side ownership)", async () => {
  const parent = await createParent(prisma);
  const stranger = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });

  await assert.rejects(
    () => createMessage(stranger.id, { to_child_id: child.id, text: 'Salut' }),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'profile_not_found',
  );

  assert.equal((await listParentMessages(parent.id)).length, 0);
});

test("getMessageForParent by a STRANGER parent 404s (read-side ownership)", async () => {
  const parent = await createParent(prisma);
  const stranger = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const message = await createMessage(parent.id, { to_child_id: child.id, text: 'Coucou' });

  const fetched = await getMessageForParent(parent.id, message.id);
  assert.equal(fetched.id, message.id);

  await assert.rejects(
    () => getMessageForParent(stranger.id, message.id),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'message_not_found',
  );
});

test('getMessageForParent 404s on an unknown message id', async () => {
  const parent = await createParent(prisma);
  await assert.rejects(
    () => getMessageForParent(parent.id, randomUuid),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'message_not_found',
  );
});

test('listPendingForChild returns unread messages; markAsRead flips status and countUnreadFromParent reflects it', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const message = await createMessage(parent.id, { to_child_id: child.id, text: 'Bravo !' });

  const pendingBefore = await listPendingForChild(parent.id, child.id);
  assert.equal(pendingBefore.length, 1);
  assert.equal(pendingBefore[0]!.id, message.id);
  assert.equal(pendingBefore[0]!.status, 'unread');
  assert.equal(await countUnreadFromParent(parent.id), 1);

  const result = await markAsRead(parent.id, message.id);
  assert.equal(result.message.status, 'read');
  assert.equal(result.childId, child.id);
  assert.ok(result.timeToReadMs >= 0);

  const row = await prisma.kidMessage.findUniqueOrThrow({ where: { id: message.id } });
  assert.equal(row.status, 'read');
  assert.ok(row.readAt);

  assert.equal(await countUnreadFromParent(parent.id), 0);
  assert.equal((await listPendingForChild(parent.id, child.id)).length, 0);
});

test('markAsRead is idempotent — a second call returns the already-read row with 0 time-to-read', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const message = await createMessage(parent.id, { to_child_id: child.id, text: 'Salut' });

  const first = await markAsRead(parent.id, message.id);
  assert.equal(first.message.status, 'read');

  const second = await markAsRead(parent.id, message.id);
  assert.equal(second.message.status, 'read');
  assert.equal(second.timeToReadMs, 0);
});

test("markAsRead by a parent outside the child's household is rejected (404)", async () => {
  const parent = await createParent(prisma);
  const stranger = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const message = await createMessage(parent.id, { to_child_id: child.id, text: 'Coucou' });

  // markAsRead uses the same co-parent-aware access check as createMessage /
  // listPendingForChild, which 404s (profile_not_found) rather than leaking a 403.
  await assert.rejects(
    () => markAsRead(stranger.id, message.id),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'profile_not_found',
  );

  // No side effect: the message is still unread.
  const row = await prisma.kidMessage.findUniqueOrThrow({ where: { id: message.id } });
  assert.equal(row.status, 'unread');
});

test('markAsRead by a linked co-parent succeeds (access is co-parent-aware, like createMessage)', async () => {
  const parent = await createParent(prisma);
  const coparent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  // Primary parent sends; a linked co-parent should be able to mark it read.
  const message = await createMessage(parent.id, { to_child_id: child.id, text: 'Coucou' });
  await prisma.parentChildLink.create({ data: { parentId: coparent.id, childId: child.id } });

  const result = await markAsRead(coparent.id, message.id);

  assert.equal(result.message.status, 'read');
  const row = await prisma.kidMessage.findUniqueOrThrow({ where: { id: message.id } });
  assert.equal(row.status, 'read');
});

test('markAsRead 404s on an unknown message id', async () => {
  const parent = await createParent(prisma);
  await assert.rejects(
    () => markAsRead(parent.id, randomUuid),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'message_not_found',
  );
});

test('deleteUnreadMessage (owner) soft-deletes an UNREAD message', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const message = await createMessage(parent.id, { to_child_id: child.id, text: 'Oups' });

  const result = await deleteUnreadMessage(parent.id, message.id);
  assert.equal(result.message.status, 'deleted_by_sender');
  assert.ok(result.ageAtDeletionMs >= 0);

  const row = await prisma.kidMessage.findUniqueOrThrow({ where: { id: message.id } });
  assert.equal(row.status, 'deleted_by_sender');
  assert.ok(row.deletedAt);

  // A deleted message is no longer pending for the kid.
  assert.equal((await listPendingForChild(parent.id, child.id)).length, 0);
});

test('deleting an already-deleted message is a no-op (returns the row unchanged, ageAtDeletionMs 0)', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const message = await createMessage(parent.id, { to_child_id: child.id, text: 'Oups' });

  const first = await deleteUnreadMessage(parent.id, message.id);
  const firstDeletedAt = first.message.deleted_at;

  const second = await deleteUnreadMessage(parent.id, message.id);
  assert.equal(second.message.status, 'deleted_by_sender');
  assert.equal(second.ageAtDeletionMs, 0);
  assert.equal(second.message.deleted_at, firstDeletedAt, 'deletedAt must not be re-stamped on the no-op path');
});

test('deleteUnreadMessage on a READ message 409s — read messages are immutable', async () => {
  const parent = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const message = await createMessage(parent.id, { to_child_id: child.id, text: 'Lu' });
  await markAsRead(parent.id, message.id);

  await assert.rejects(
    () => deleteUnreadMessage(parent.id, message.id),
    (e: unknown) => e instanceof HttpError && e.status === 409 && e.code === 'already_read',
  );

  // No side effect: the message is still read, not deleted.
  const row = await prisma.kidMessage.findUniqueOrThrow({ where: { id: message.id } });
  assert.equal(row.status, 'read');
  assert.equal(row.deletedAt, null);
});

test("deleteUnreadMessage by a STRANGER 404s and doesn't touch the message", async () => {
  const parent = await createParent(prisma);
  const stranger = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  const message = await createMessage(parent.id, { to_child_id: child.id, text: 'Confidentiel' });

  await assert.rejects(
    () => deleteUnreadMessage(stranger.id, message.id),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'message_not_found',
  );

  const row = await prisma.kidMessage.findUniqueOrThrow({ where: { id: message.id } });
  assert.equal(row.status, 'unread');
});

test("listPendingForChild 404s when the child doesn't belong to the parent", async () => {
  const parent = await createParent(prisma);
  const stranger = await createParent(prisma);
  const child = await createChild(prisma, { parentId: parent.id });
  await createMessage(parent.id, { to_child_id: child.id, text: 'Privé' });

  await assert.rejects(
    () => listPendingForChild(stranger.id, child.id),
    (e: unknown) => e instanceof HttpError && e.status === 404 && e.code === 'profile_not_found',
  );
});
