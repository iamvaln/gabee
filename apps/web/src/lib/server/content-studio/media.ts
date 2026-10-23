import { randomUUID } from 'node:crypto';
import { Prisma } from '@gabee/db';
import { MediaUploadInitSchema, type MediaClearance, type MediaUploadInit } from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';
import { writeAudit } from '../audit';
import { reportError } from '../report-error';
import { getStorage } from '../storage';
import { sniffMime } from './sniff';
import { imageSize, matchAspect } from './image-size';

const PUT_TTL_SEC = 900;
const GET_TTL_SEC = 900;
const IMAGE_HEADER_BYTES = 64 * 1024;

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4' };
const BAD_FILE: Record<string, string> = {
  'image/png': "Le fichier n'est pas une image PNG valide.",
  'image/jpeg': "Le fichier n'est pas une image JPEG valide.",
  'image/webp': "Le fichier n'est pas une image WebP valide.",
  'video/mp4': "Le fichier n'est pas une vidéo MP4 valide.",
};

export type MediaAssetDto = {
  id: string;
  kind: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationS: number | null;
  aspect: string | null;
  language: string | null;
  tags: string[];
  origin: string;
  status: string;
  rejectReason: string | null;
  cleared: boolean;
  clearanceNote: string | null;
  createdAt: string;
};

type Row = Prisma.MediaAssetGetPayload<object>;

export function toMediaDto(r: Row): MediaAssetDto {
  return {
    id: r.id,
    kind: r.kind,
    fileName: r.fileName,
    mime: r.mime,
    sizeBytes: r.sizeBytes,
    width: r.width,
    height: r.height,
    durationS: r.durationS,
    aspect: r.aspect,
    language: r.language,
    tags: r.tags,
    origin: r.origin,
    status: r.status,
    rejectReason: r.rejectReason,
    cleared: r.cleared,
    clearanceNote: r.clearanceNote,
    createdAt: r.createdAt.toISOString(),
  };
}

async function loadAsset(id: string): Promise<Row> {
  const row = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, 'not_found', "Ce média n'existe pas ou a été supprimé.");
  return row;
}

/** Audit a media mutation with the actor's current role (read from the DB, like other admin routes). */
export async function auditMedia(
  actorId: string,
  kind: 'content.media.init' | 'content.media.complete' | 'content.media.clearance',
  assetId: string,
  diff?: unknown,
): Promise<void> {
  const account = await prisma.parentAccount.findUnique({ where: { id: actorId }, select: { role: true } });
  await writeAudit({
    actorId,
    actorRole: account?.role ?? 'admin',
    kind,
    targetKind: 'media_asset',
    targetId: assetId,
    diff,
  });
}

export async function initUpload(
  input: MediaUploadInit,
  actorId: string,
): Promise<{ assetId: string; uploadUrl: string }> {
  const parsed = MediaUploadInitSchema.safeParse(input);
  if (!parsed.success) {
    throw new HttpError(
      422,
      'validation_error',
      "Ce fichier n'est pas accepté : PNG, JPEG, WebP (15 Mo max) ou MP4 (300 Mo max).",
      parsed.error.issues,
    );
  }
  const { file_name, mime, size_bytes } = parsed.data;
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const objectKey = `media/${yyyy}/${mm}/${randomUUID()}.${EXT[mime]}`;
  const uploadUrl = await getStorage().presignPut(objectKey, mime, size_bytes, PUT_TTL_SEC);
  const row = await prisma.mediaAsset.create({
    data: {
      kind: mime === 'video/mp4' ? 'video' : 'image',
      objectKey,
      fileName: file_name,
      mime,
      sizeBytes: size_bytes,
      aspect: parsed.data.aspect ?? null,
      language: parsed.data.language ?? null,
      tags: normalizeTags(parsed.data.tags ?? []),
      origin: 'upload',
      status: 'pending',
      uploadedById: actorId,
    },
  });
  return { assetId: row.id, uploadUrl };
}

async function reject(row: Row, reason: string): Promise<MediaAssetDto> {
  try {
    await getStorage().delete(row.objectKey);
  } catch (err) {
    reportError(err, { scope: 'content.media', assetId: row.id, step: 'delete-rejected' });
  }
  const updated = await prisma.mediaAsset.update({
    where: { id: row.id },
    data: { status: 'rejected', rejectReason: reason },
  });
  return toMediaDto(updated);
}

export async function completeUpload(assetId: string, _actorId: string): Promise<MediaAssetDto> {
  await loadAsset(assetId);
  // Claim atomically: only one concurrent caller moves pending -> verifying; the
  // loser must not touch the object or the row.
  const claim = await prisma.mediaAsset.updateMany({
    where: { id: assetId, status: 'pending' },
    data: { status: 'verifying' },
  });
  if (claim.count === 0) {
    throw new HttpError(409, 'not_pending', 'Ce fichier a déjà été traité.');
  }
  const row = await loadAsset(assetId);
  try {
    return await verify(row);
  } catch (err) {
    // Storage/DB failure mid-verification: release the claim so the owner can retry.
    await prisma.mediaAsset.updateMany({ where: { id: assetId, status: 'verifying' }, data: { status: 'pending' } });
    throw err;
  }
}

async function verify(row: Row): Promise<MediaAssetDto> {
  const storage = getStorage();
  const head = await storage.head(row.objectKey);
  if (!head) return reject(row, "Le fichier n'a pas été reçu. Réessayez l'envoi.");
  if (head.sizeBytes !== row.sizeBytes) {
    return reject(row, 'La taille du fichier ne correspond pas à celle annoncée. Réessayez l’envoi.');
  }
  if (head.mime && head.mime !== row.mime) {
    return reject(row, BAD_FILE[row.mime] ?? "Le format du fichier n'est pas valide.");
  }
  const isImage = row.kind === 'image';
  const headBytes = await storage.readRange(row.objectKey, isImage ? IMAGE_HEADER_BYTES : 16);
  const sniffed = sniffMime(headBytes.subarray(0, 16));
  if (sniffed !== row.mime) return reject(row, BAD_FILE[row.mime] ?? "Le format du fichier n'est pas valide.");
  const size = isImage ? imageSize(headBytes, row.mime) : null;
  const updated = await prisma.mediaAsset.update({
    where: { id: row.id },
    data: {
      status: 'ready',
      rejectReason: null,
      ...(size
        ? { width: size.width, height: size.height, aspect: matchAspect(size.width, size.height) ?? row.aspect }
        : {}),
    },
  });
  return toMediaDto(updated);
}

export async function setClearance(
  assetId: string,
  input: MediaClearance,
  _actorId: string,
): Promise<MediaAssetDto> {
  await loadAsset(assetId);
  const updated = await prisma.mediaAsset.update({
    where: { id: assetId },
    data: {
      cleared: input.cleared,
      clearanceNote: input.note ?? null,
    },
  });
  return toMediaDto(updated);
}

/** Tags as stored: trimmed, without a leading `#`, lower case, each once (empty ones dropped). */
export function normalizeTags(tags: string[]): string[] {
  const out = tags.map((t) => t.trim().replace(/^#+/, '').trim().toLocaleLowerCase('fr')).filter(Boolean);
  return [...new Set(out)];
}

export async function setTags(assetId: string, tags: string[]): Promise<MediaAssetDto> {
  await loadAsset(assetId);
  return toMediaDto(await prisma.mediaAsset.update({ where: { id: assetId }, data: { tags: normalizeTags(tags) } }));
}

export async function listMedia(filter: {
  kind?: string;
  cleared?: boolean;
  aspect?: string;
  tag?: string;
}): Promise<MediaAssetDto[]> {
  const rows = await prisma.mediaAsset.findMany({
    where: {
      // Pending and rejected uploads are never usable, so the library only lists ready files.
      status: 'ready',
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.cleared !== undefined ? { cleared: filter.cleared } : {}),
      ...(filter.aspect ? { aspect: filter.aspect } : {}),
      ...(filter.tag ? { tags: { has: filter.tag } } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toMediaDto);
}

/** How many drafts use a file, by where they stand (the clearance dialog warns about approved and published posts). */
export type MediaUsage = { approved: number; published: number; other: number };
export type LibraryAssetDto = MediaAssetDto & { usage: MediaUsage };

/** The Médiathèque list: `listMedia` plus, per file, the drafts it is attached to. */
export async function listLibrary(filter: Parameters<typeof listMedia>[0]): Promise<LibraryAssetDto[]> {
  const assets = await listMedia(filter);
  const counts = assets.length
    ? await prisma.contentDraft.groupBy({
        by: ['mediaAssetId', 'status'],
        where: { mediaAssetId: { in: assets.map((a) => a.id) } },
        _count: { _all: true },
      })
    : [];
  return assets.map((a) => {
    const usage: MediaUsage = { approved: 0, published: 0, other: 0 };
    for (const c of counts) {
      if (c.mediaAssetId !== a.id) continue;
      const slot = c.status === 'approved' || c.status === 'published' ? c.status : 'other';
      usage[slot] += c._count._all;
    }
    return { ...a, usage };
  });
}

/**
 * Readable download name of a draft's media: `YYYY-MM-DD-<platform>-<slug>.<ext>`
 * (slug = the day's topic, ASCII, at most 60 characters).
 */
export function draftMediaFileName(date: string, platform: string, topic: string, mime: string, fileName: string): string {
  const slug =
    topic
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 60)
      .replace(/^-+|-+$/g, '') || 'post';
  const ext = EXT[mime] ?? (fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : 'bin');
  return `${date}-${platform}-${slug}.${ext}`;
}

export async function downloadUrl(assetId: string, downloadName: string): Promise<string> {
  const row = await loadAsset(assetId);
  if (row.status !== 'ready') {
    throw new HttpError(409, 'not_ready', "Ce fichier n'est pas disponible au téléchargement.");
  }
  return getStorage().presignGet(row.objectKey, downloadName, GET_TTL_SEC);
}
