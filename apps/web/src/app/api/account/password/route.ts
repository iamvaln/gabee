import { z } from 'zod';
import { NextResponse } from 'next/server';
import { route, readJson, requireParent } from '@/lib/server/http';
import { changePassword } from '@/lib/server/services/parent-account';

export const runtime = 'nodejs';

// Parent spec §10.2 — verify current, rotate to new. Min 8 chars with at least
// one digit and one letter (mirrors the rule shown in the UI hint).
const PasswordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8)
    .regex(/[A-Za-z]/, 'Must include a letter')
    .regex(/\d/, 'Must include a digit'),
});

export const POST = route(async (req) => {
  const session = await requireParent(req);
  const input = await readJson(req, PasswordChangeSchema);
  await changePassword(session.parentId, input.currentPassword, input.newPassword);
  return new NextResponse(null, { status: 204 });
});
