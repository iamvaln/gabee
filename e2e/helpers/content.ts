import { prisma, FIXTURES } from './db';

/**
 * Communication studio seeding for the admin e2e (no AI): weeks, day lines,
 * drafts with their current version, and media rows written straight to the
 * test database, on the studio-local calendar the server uses (Africa/Douala,
 * the seeded StudioSettings default).
 */

const STUDIO_TZ = 'Africa/Douala';
const DAY_MS = 86_400_000;

/** Studio-local `YYYY-MM-DD` of `now`. */
export function studioToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: STUDIO_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Monday of the week holding `ymd` (on a Sunday, the Monday six days before). */
export function mondayOf(ymd: string): string {
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return addDays(ymd, -((dow + 6) % 7));
}

const dateOf = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

/** Empty the studio tables a spec touches (weeks cascade to days, drafts, versions, publications). */
export async function resetContentStudio(): Promise<void> {
  await prisma.contentWeek.deleteMany({});
  await prisma.mediaAsset.deleteMany({});
}

async function adminId(): Promise<string> {
  const admin = await prisma.parentAccount.findUniqueOrThrow({ where: { email: FIXTURES.adminEmail }, select: { id: true } });
  return admin.id;
}

export const PROPOSALS = [
  {
    title: 'La rentrée sans écrans subis',
    rationale: 'Les parents cherchent des activités courtes et utiles après l’école.',
    evidence: ['3 inscriptions venues de LinkedIn la semaine passée'],
    sample_angles: ['10 minutes de lecture avant le dîner'],
  },
  {
    title: 'Apprendre l’anglais en jouant',
    rationale: 'Le module Traduction est le plus joué.',
    evidence: ['Le module Traduction représente 40 % des sessions'],
    sample_angles: ['Un mot anglais par jour'],
  },
  {
    title: 'Le code dès 6 ans',
    rationale: 'Les nouveaux niveaux Code viennent de sortir.',
    evidence: ['Niveaux L1 à L5 publiés'],
    sample_angles: ['Le stylo qui dessine'],
  },
] as const;

/**
 * A week left in `proposing` (Strategist running, or its run died), last
 * touched `minutesAgo` minutes ago: the screen offers to relaunch only once
 * it looks stuck (10 min).
 */
export async function seedProposingWeek(startsOn: string, minutesAgo: number): Promise<{ weekId: string }> {
  const week = await prisma.contentWeek.create({ data: { startsOn: dateOf(startsOn), firstDay: dateOf(startsOn), status: 'proposing' } });
  await ageWeek(week.id, minutesAgo);
  return { weekId: week.id };
}

/** Set the week's `updated_at` (Prisma's @updatedAt would overwrite it on a normal update). */
export async function ageWeek(weekId: string, minutesAgo: number): Promise<void> {
  // The column is a UTC timestamp without time zone: compute it in JS, not with the session-zoned now().
  await prisma.$executeRaw`UPDATE content_weeks SET updated_at = ${new Date(Date.now() - minutesAgo * 60_000)} WHERE id = ${weekId}::uuid`;
}

/** A week (Monday `startsOn`) waiting for the owner's direction. */
export async function seedProposalsWeek(startsOn: string): Promise<{ weekId: string }> {
  const week = await prisma.contentWeek.create({
    data: { startsOn: dateOf(startsOn), firstDay: dateOf(startsOn), status: 'proposals_ready', proposals: { proposals: PROPOSALS } },
  });
  return { weekId: week.id };
}

/**
 * What the Strategist's titles run would store: one `proposed` line per day
 * and the week `titles_ready`. Only the first day is in English, so each
 * platform starts one English post short of the full-week minimum (2).
 */
export async function seedTitles(weekId: string, chosenIndex: number): Promise<void> {
  const week = await prisma.contentWeek.findUniqueOrThrow({ where: { id: weekId } });
  const startsOn = week.startsOn.toISOString().slice(0, 10);
  const topics = ['Lire 10 minutes', 'Un mot anglais', 'Compter en cuisine', 'Le clavier en douceur', 'Le stylo qui dessine', 'Raconter sa journée', 'Bilan de la semaine'];
  await prisma.$transaction([
    prisma.contentWeek.update({ where: { id: weekId }, data: { status: 'titles_ready', chosenIndex, refinement: '' } }),
    prisma.contentSlot.createMany({
      data: topics.map((topic, i) => {
        const language = i === 0 ? 'en' : 'fr';
        return {
          weekId,
          date: dateOf(addDays(startsOn, i)),
          topic,
          angle: `Angle du jour ${i + 1}`,
          format: i % 2 === 0 ? 'text' : 'visual',
          platforms: [
            { platform: 'linkedin', language },
            { platform: 'tiktok', language },
          ],
          sources: [],
          status: 'proposed',
        };
      }),
    }),
  ]);
}

export const LINKEDIN_URL = 'https://parents.gabee.app/signup?utm_source=linkedin&utm_medium=social&utm_campaign=e2e&utm_content=e2e';
export const LINKEDIN_BODY = 'Dix minutes de lecture par jour suffisent.\n\nGabee propose des séances courtes, adaptées à chaque enfant.';

type TodayOpts = {
  /** Append a 200-char unbroken hashtag and a long URL to the LinkedIn post (phone layout check). */
  longTokens?: boolean;
  /** A cleared image attached to the LinkedIn draft. */
  linkedinImage?: boolean;
  /** `generating` with no lock: a run that died (crash, deploy) while writing the LinkedIn draft. */
  linkedinInterrupted?: boolean;
};

/**
 * Today's day line in a validated week, with a ready LinkedIn draft (text +
 * optional cleared image) and a ready TikTok draft in filming-plan mode (no
 * video yet).
 */
export async function seedTodayBoard(opts: TodayOpts = {}): Promise<{ linkedinDraftId: string; tiktokDraftId: string; slotId: string; today: string }> {
  const today = studioToday();
  const monday = mondayOf(today);
  const uploader = await adminId();

  const week = await prisma.contentWeek.create({
    data: {
      startsOn: dateOf(monday),
      firstDay: dateOf(monday),
      status: 'validated',
      validatedAt: new Date(),
      validatedById: uploader,
      proposals: { proposals: PROPOSALS },
      chosenIndex: 0,
      refinement: '',
    },
  });
  const slot = await prisma.contentSlot.create({
    data: {
      weekId: week.id,
      date: dateOf(today),
      topic: 'Lire 10 minutes avant le dîner',
      angle: 'Un rituel simple que les parents peuvent tenir.',
      format: 'text',
      platforms: [
        { platform: 'linkedin', language: 'fr' },
        { platform: 'tiktok', language: 'en' },
      ],
      status: 'drafted',
    },
  });

  const media = opts.linkedinImage
    ? await prisma.mediaAsset.create({
        data: {
          kind: 'image',
          objectKey: `e2e/${slot.id}.png`,
          fileName: 'lecture.png',
          mime: 'image/png',
          sizeBytes: 1024,
          width: 1600,
          height: 900,
          aspect: '16:9',
          status: 'ready',
          cleared: true,
          uploadedById: uploader,
        },
      })
    : null;

  const longHashtag = `#${'lecture'.repeat(29)}abc`; // 1 + 203 chars, no break opportunity
  const longUrl = `https://parents.gabee.app/${'chemin-tres-long-'.repeat(8)}fin`;
  const hashtags = ['#lecture', '#parents', '#enfants', ...(opts.longTokens ? [longHashtag] : [])];
  const body = `${LINKEDIN_BODY}${opts.longTokens ? `\n\n${longUrl}` : ''}\n\n${LINKEDIN_URL}`;

  const linkedin = await prisma.contentDraft.create({
    data: {
      slotId: slot.id,
      platform: 'linkedin',
      language: 'fr',
      status: opts.linkedinInterrupted ? 'generating' : 'ready',
      generationLockUntil: null,
      trackedUrl: LINKEDIN_URL,
      mediaAssetId: media?.id ?? null,
    },
  });
  const liVersion = await prisma.contentDraftVersion.create({
    data: { draftId: linkedin.id, n: 1, source: 'agent', payload: { body, hashtags, link_target: 'signup' } },
  });
  await prisma.contentDraft.update({ where: { id: linkedin.id }, data: { currentVersionId: liVersion.id } });

  const tiktok = await prisma.contentDraft.create({
    data: {
      slotId: slot.id,
      platform: 'tiktok',
      language: 'en',
      status: 'ready',
      trackedUrl: 'https://gabee.app/fr?utm_source=tiktok&utm_medium=social&utm_content=bio',
    },
  });
  const ttVersion = await prisma.contentDraftVersion.create({
    data: {
      draftId: tiktok.id,
      n: 1,
      source: 'agent',
      payload: {
        caption: 'Ten minutes of reading a day, the Gabee way.',
        hashtags: ['#reading', '#kids', '#parenting'],
        on_screen_text: ['10 minutes a day', 'Every evening'],
        mode: 'filming_plan',
        filming_plan: {
          hook: 'Show the timer starting at 10:00',
          shots: ['Close-up of the tablet with the Words module', 'Child reading aloud', 'Parent smiling'],
          duration_s: 20,
        },
      },
    },
  });
  await prisma.contentDraft.update({ where: { id: tiktok.id }, data: { currentVersionId: ttVersion.id } });

  return { linkedinDraftId: linkedin.id, tiktokDraftId: tiktok.id, slotId: slot.id, today };
}
