import { z } from 'zod';
import type { ArtDirection, ContentPlatform, LinkedInPost, TikTokPost, WeekTitles } from '@gabee/types';

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

// Bare domains are caught only on common TLDs, so prose like "fini.Le" or
// "3.5" never trips the check.
const TLDS = 'com|net|org|app|io|ly|co|fr|gl|gg|link|info|biz|tv|cm|ai|dev|xyz|page|site|eu|uk|us|ca|de|be|ch|sh|cc|ws|news|blog|store|shop';
const URL_RE = new RegExp(
  [
    String.raw`\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"'()\[\]]+`, // scheme://…
    String.raw`\bwww\.[^\s<>"'()\[\]]+`, // www.…
    String.raw`\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:${TLDS})\b(?:\/[^\s<>"'()\[\]]*)?`, // bit.ly/x
  ].join('|'),
  'gi',
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
export function checkPostRules(platform: ContentPlatform, post: LinkedInPost | TikTokPost, profile: { rules: unknown }): string[] {
  const rules = parsePlatformRules(profile.rules);
  const out: string[] = [];

  if (platform === 'linkedin') {
    const p = post as LinkedInPost;
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
  } else if (platform === 'tiktok' && (asset.kind !== 'video' || asset.aspect !== '9:16')) {
    out.push(`TikTok needs a vertical (9:16) video; ${asset.id} is a ${asset.aspect ?? 'unknown-aspect'} ${asset.kind}.`);
  } else if (platform === 'linkedin' && asset.aspect !== '16:9' && asset.aspect !== '1:1') {
    out.push(`LinkedIn takes 16:9 (or 1:1) media; ${asset.id} is ${asset.aspect ?? 'of unknown aspect'}.`);
  }
  return out;
}

/** The titles run must plan exactly the requested dates, in order, each for every enabled platform once. */
export function checkWeekTitles(output: WeekTitles, dates: readonly string[], platforms: readonly ContentPlatform[]): string[] {
  const out: string[] = [];
  const got = output.days.map((d) => d.date);
  if (got.join(',') !== dates.join(',')) {
    out.push(`days must cover exactly ${dates.join(', ')} in this order; got ${got.join(', ') || 'none'}.`);
  }
  const want = [...platforms].sort().join(',');
  for (const day of output.days) {
    const have = day.platforms.map((p) => p.platform).sort().join(',');
    if (have !== want) out.push(`${day.date}: platforms must be exactly ${want}; got ${have || 'none'}.`);
  }
  return out;
}
