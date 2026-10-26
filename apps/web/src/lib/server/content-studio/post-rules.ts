import { z } from 'zod';
import {
  PILLAR_MIX,
  fitsPlatform,
  pillarMix,
  type ArtDirection,
  type ContentPillar,
  type ContentPlatform,
  type LinkedInPost,
  type TikTokPost,
  type WeekCalendarItem,
  type WeekTitles,
} from '@gabee/types';
import { addDaysYmd } from './state';
import type { PlannedDay } from './cadence';

/**
 * "Schema-valid but unusable" checks (Review Focus 3). The router already
 * enforced the zod schema; these rules need data the schema cannot see — the
 * platform profile, the media library, the dates being planned. Every function
 * returns plain-language violations (empty = usable); `runAgent` treats any
 * violation as an invalid output (retried once, then recorded).
 */

/** `PlatformProfile.rules` as seeded (Task 2). */
export const PlatformRulesSchema = z.object({
  max_chars: z.number().int().positive(),
  hashtags_min: z.number().int().min(0),
  hashtags_max: z.number().int().min(0),
  link_policy: z.string(),
  emoji_policy: z.string(),
});
export type PlatformRules = z.infer<typeof PlatformRulesSchema>;

export function parsePlatformRules(rules: unknown): PlatformRules {
  const parsed = PlatformRulesSchema.safeParse(rules);
  if (!parsed.success) {
    throw new Error(`Platform profile rules are invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return parsed.data;
}

/**
 * Characters kept free at the end of a LinkedIn post for the tracked link the
 * app appends (`\n\n` + the longest signup URL with its utm params is ~170).
 */
export const LINK_RESERVE_CHARS = 200;

// No TLD list: any host counts (wa.me, t.me, lnkd.in, amzn.to, example.museum…).
// A host is `label.` repeated, then a TLD of 2–24 letters — digits never form
// a TLD, so "3.5", "v2.0" or "4.5/5" are prose. With a `/path` any letter case
// counts; a path-less bare domain needs a one-case TLD ("bit.ly", "GABEE.APP"),
// so a missing space in prose ("fini.Le jeu") is not taken for a domain.
const PATH_CHARS = String.raw`[^\s<>"'()\[\]]`;
const HOST_LABELS = String.raw`(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+`;
const URL_RE = new RegExp(
  [
    String.raw`\b[A-Za-z][A-Za-z0-9+.-]*:\/\/${PATH_CHARS}+`, // scheme://…
    String.raw`\b[Ww]{3}\.${PATH_CHARS}+`, // www.…
    String.raw`\b${HOST_LABELS}[A-Za-z]{2,24}\/${PATH_CHARS}*`, // wa.me/336…, lnkd.in/abc
    String.raw`\b${HOST_LABELS}(?:[a-z]{2,24}|[A-Z]{2,24})\b(?![-.]?[A-Za-z0-9])`, // bit.ly, example.museum
  ].join('|'),
  'g',
);

/** Every URL-looking token in `text` (trailing punctuation trimmed). */
export function findUrls(text: string): string[] {
  return [...text.matchAll(URL_RE)].map((m) => m[0].replace(/[.,;:!?]+$/, ''));
}

const HASHTAG_RE = /^#[\p{L}\p{N}_]+$/u;

function urlViolations(fields: Array<[string, string]>): string[] {
  const out: string[] = [];
  for (const [field, text] of fields) {
    for (const url of findUrls(text)) {
      out.push(`${field} contains the URL "${url}": write no URL — the app adds Gabee's tracked link itself.`);
    }
  }
  return out;
}

function hashtagViolations(hashtags: string[], rules: PlatformRules): string[] {
  const out: string[] = [];
  if (hashtags.length < rules.hashtags_min || hashtags.length > rules.hashtags_max) {
    out.push(`${hashtags.length} hashtags: the profile asks for ${rules.hashtags_min} to ${rules.hashtags_max}.`);
  }
  const bad = hashtags.filter((h) => !HASHTAG_RE.test(h));
  if (bad.length > 0) out.push(`Malformed hashtags (one word starting with #): ${bad.map((h) => JSON.stringify(h)).join(', ')}.`);
  return out;
}

const hashtagChars = (hashtags: string[]) => (hashtags.length > 0 ? 2 + hashtags.join(' ').length : 0);

/**
 * Platform rules for a writer's post: length within `max_chars` (LinkedIn keeps
 * room for hashtags and the appended link; TikTok's caption counts hashtags),
 * hashtag count within the profile's range, no URL written by the agent
 * (Ruling 5 — Gabee or not), and a usable filming plan in `filming_plan` mode.
 * `library_video` without a chosen file is the Art director's job.
 */
export function checkPostRules(
  platform: ContentPlatform,
  post: LinkedInPost | TikTokPost,
  profile: { rules: unknown },
  /** The day's pillar (writer runs): a light or useful day never asks to sign up. */
  pillar?: ContentPillar | null,
): string[] {
  const rules = parsePlatformRules(profile.rules);
  const out: string[] = [];

  if (platform === 'linkedin') {
    const p = post as LinkedInPost;
    if ((pillar === 'light' || pillar === 'value') && p.link_target !== 'landing') {
      out.push(`link_target must be "landing" on a "${pillar}" day: light and useful posts do not ask to sign up.`);
    }
    const total = p.body.length + hashtagChars(p.hashtags) + LINK_RESERVE_CHARS;
    if (total > rules.max_chars) {
      out.push(
        `body is ${p.body.length} characters; with the hashtags and ${LINK_RESERVE_CHARS} characters kept for the link the post reaches ${total}, over the LinkedIn limit of ${rules.max_chars}.`,
      );
    }
    out.push(...hashtagViolations(p.hashtags, rules));
    out.push(...urlViolations([['body', p.body], ...p.hashtags.map((h): [string, string] => ['hashtags', h])]));
    return out;
  }

  const p = post as TikTokPost;
  const total = p.caption.length + hashtagChars(p.hashtags);
  if (total > rules.max_chars) {
    out.push(`caption is ${p.caption.length} characters (${total} with hashtags), over the TikTok limit of ${rules.max_chars}.`);
  }
  out.push(...hashtagViolations(p.hashtags, rules));
  if (p.mode === 'filming_plan') {
    if (!p.filming_plan) {
      out.push('mode is filming_plan but filming_plan is missing: give the hook, the shots and the duration.');
    } else {
      if (!p.filming_plan.hook.trim()) out.push('filming_plan.hook is empty.');
      if (p.filming_plan.shots.filter((s) => s.trim()).length === 0) out.push('filming_plan.shots is empty: list 3 to 6 shots.');
    }
  }
  out.push(
    ...urlViolations([
      ['caption', p.caption],
      ...p.on_screen_text.map((t): [string, string] => ['on_screen_text', t]),
      ...p.hashtags.map((h): [string, string] => ['hashtags', h]),
      ...(p.filming_plan
        ? [['filming_plan.hook', p.filming_plan.hook] as [string, string], ...p.filming_plan.shots.map((s): [string, string] => ['filming_plan.shots', s])]
        : []),
    ]),
  );
  return out;
}

/** A TikTok post needs a video: `library_video` only when the library has a cleared vertical one. */
export function checkTikTokMode(post: TikTokPost, clearedVerticalVideos: number): string[] {
  if (post.mode === 'library_video' && clearedVerticalVideos === 0) {
    return ['mode is library_video but the library has no cleared vertical video: deliver a filming_plan instead.'];
  }
  return [];
}

/** The Art director may only pick a listed (cleared) asset that fits the platform. */
export function checkArtDirection(
  output: ArtDirection,
  platform: ContentPlatform,
  media: ReadonlyArray<{ id: string; kind: string; aspect: string | null }>,
): string[] {
  const out: string[] = [];
  if (!output.visual_brief.trim()) out.push('visual_brief is empty: always describe the ideal visual.');
  if (output.media_asset_id === null) return out;
  const asset = media.find((m) => m.id === output.media_asset_id);
  if (!asset) {
    out.push(`media_asset_id ${output.media_asset_id} is not in media_library: pick a listed id or null.`);
  } else if (!fitsPlatform(asset.kind, asset.aspect, platform).ok) {
    // Ruling 16: the same rule as the picker, draft edits and approval.
    out.push(
      platform === 'tiktok'
        ? `TikTok needs a vertical (9:16) video; ${asset.id} is a ${asset.aspect ?? 'unknown-aspect'} ${asset.kind}.`
        : `LinkedIn takes an image or a video in 16:9, 1:1 or 4:5 (never vertical, and a video needs a known aspect); ${asset.id} is a ${asset.aspect ?? 'unknown-aspect'} ${asset.kind}.`,
    );
  }
  return out;
}

/** The proposals run's calendar holds only days of the week it plans (Monday `weekStart` … Sunday). */
export function checkWeekCalendar(calendar: readonly WeekCalendarItem[] | undefined, weekStart: string): string[] {
  const end = addDaysYmd(weekStart, 6);
  return (calendar ?? [])
    .filter((c) => c.date < weekStart || c.date > end)
    .map((c) => `week_calendar: ${c.date} is outside the week ${weekStart} to ${end}; list only that week's days.`);
}

/**
 * The titles run must plan exactly the planned days, in order, each with
 * exactly the platforms posting that day (the cadence), and keep the weekly
 * mix: at most 3 days about Gabee, at least one light day. With a `calendar`,
 * every source must be one of its verified pages.
 */
export function checkWeekTitles(output: WeekTitles, days: readonly PlannedDay[], calendar?: readonly WeekCalendarItem[]): string[] {
  const out: string[] = [];
  const dates = days.map((d) => d.date);
  const got = output.days.map((d) => d.date);
  if (got.join(',') !== dates.join(',')) {
    out.push(`days must cover exactly ${dates.join(', ') || 'no date'} in this order; got ${got.join(', ') || 'none'}.`);
  }
  for (const day of output.days) {
    const planned = days.find((d) => d.date === day.date);
    if (!planned) continue;
    const want = [...planned.platforms].sort().join(',');
    const have = day.platforms.map((p) => p.platform).sort().join(',');
    if (have !== want) out.push(`${day.date}: platforms must be exactly ${want}; got ${have || 'none'}.`);
  }
  // The titles run has no web search: a source is only a page the proposals run verified.
  if (calendar) {
    const known = new Set(calendar.map((c) => c.source_url));
    for (const day of output.days) {
      for (const src of day.sources) {
        if (!known.has(src.url)) out.push(`${day.date}: source ${src.url} is not in week_calendar; cite only week_calendar pages, or leave sources empty.`);
      }
    }
  }
  const mix = pillarMix(output.days.map((d) => d.pillar));
  if (mix.problems.includes('too_much_gabee')) {
    out.push(
      `${mix.gabee} days have pillar "gabee": at most ${PILLAR_MIX.gabee_max} days may be about Gabee itself. Make the others "value" (useful for parents) or "light".`,
    );
  }
  if (mix.problems.includes('no_light')) {
    out.push(
      'No day has pillar "light": at least one day must be a light post (news, « Le saviez-vous ? », a game or quiz, an event in the kids\' games or education world, an observance day).',
    );
  }
  return out;
}
