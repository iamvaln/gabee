import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/http';
import { draftMediaDownloadUrl } from '@/lib/server/content-studio/drafts';
import { idParam, studioRoute } from '@/lib/server/content-studio/http-errors';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// "Télécharger le média": 302 to a presigned GET (<= 15 min) named YYYY-MM-DD-<platform>-<slug>.<ext>.
export const GET = studioRoute<Ctx>(async (req, ctx) => {
  await requireAdmin(req);
  const url = await draftMediaDownloadUrl(await idParam(ctx));
  return NextResponse.redirect(url, 302);
});
