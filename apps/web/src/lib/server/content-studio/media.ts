import { randomUUID } from 'node:crypto';
import { Prisma } from '@gabee/db';
import { MediaUploadInitSchema, type MediaClearance, type MediaUploadInit } from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';
import { writeAudit } from '../audit';
import { reportError } from '../report-error';
import { getStorage } from '../storage';
import { sniffMime } from './sniff';

const PUT_TTL_SEC = 900;
const GET_TTL_SEC = 900;

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
  const row = await loadAsset(assetId);
  if (row.status !== 'pending') {
    throw new HttpError(409, 'not_pending', 'Ce fichier a déjà été traité.');
  }
  const storage = getStorage();
  const head = await storage.head(row.objectKey);
  if (!head) return reject(row, "Le fichier n'a pas été reçu. Réessayez l'envoi.");
  if (head.sizeBytes !== row.sizeBytes) {
    return reject(row, 'La taille du fichier ne correspond pas à celle annoncée. Réessayez l’envoi.');
  }
  const sniffed = sniffMime(await storage.readRange(row.objectKey, 16));
  if (sniffed !== row.mime) return reject(row, BAD_FILE[row.mime] ?? "Le format du fichier n'est pas valide.");
  const updated = await prisma.mediaAsset.update({
    where: { id: row.id },
    data: { status: 'ready', rejectReason: null },
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

export async function setTags(assetId: string, tags: string[]): Promise<MediaAssetDto> {
  await loadAsset(assetId);
  return toMediaDto(await prisma.mediaAsset.update({ where: { id: assetId }, data: { tags } }));
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

export async function downloadUrl(assetId: string, downloadName: string): Promise<string> {
  const row = await loadAsset(assetId);
  if (row.status !== 'ready') {
    throw new HttpError(409, 'not_ready', "Ce fichier n'est pas disponible au téléchargement.");
  }
  return getStorage().presignGet(row.objectKey, downloadName, GET_TTL_SEC);
}
