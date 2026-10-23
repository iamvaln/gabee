import { NextResponse } from 'next/server';
import { requireAdmin, HttpError } from '@/lib/server/http';
import { idParam, studioRoute } from '@/lib/server/content-studio/http-errors';
import { downloadUrl } from '@/lib/server/content-studio/media';
import { prisma } from '@/lib/server/db';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// 302 to a presigned GET (<= 15 min, Content-Disposition: attachment). The
// download name is the stored file name; draft downloads (Task 7) pass their own.
export const GET = studioRoute<Ctx>(async (req, ctx) => {
  await requireAdmin(req);
  const id = await idParam(ctx);
  const row = await prisma.mediaAsset.findUnique({ where: { id }, select: { fileName: true } });
  if (!row) throw new HttpError(404, 'not_found', "Ce média n'existe pas ou a été supprimé.");
  const url = await downloadUrl(id, row.fileName);
  return NextResponse.redirect(url, 302);
});
