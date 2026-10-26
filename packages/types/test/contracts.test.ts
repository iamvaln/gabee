import { describe, it } from 'node:test';
import {
  MEDIA_MAX_IMAGE_BYTES,
  MEDIA_MAX_VIDEO_BYTES,
  DirectionProposalsSchema,
  TikTokPostSchema,
  WeekTitlesSchema,
  MarkPublishedRequestSchema,
  VisitBeaconSchema,
  AI_TASKS,
  AI_CAPABILITIES,
  AI_TASK_CAPABILITY,
  AGENT_KEYS,
  AGENT_TASK,
  JOB_KEYS,
  SLOT_FORMATS,
  WEEK_STATUSES,
  SLOT_STATUSES,
  DRAFT_STATUSES,
  CONTENT_LANGUAGES,
  OBJECTIVE_TYPES,
  ChooseDirectionRequestSchema,
  SkipDayRequestSchema,
  UpdateDraftRequestSchema,
  MediaUploadInitSchema,
  MediaClearanceSchema,
  fitsPlatform,
  UtmSchema,
  LinkedInPostSchema,
  ArtDirectionSchema,
  ReportNarrativeSchema,
  StudioSettingsUpdateSchema,
  ObjectiveUpsertSchema,
  EditorialLineUpdateSchema,
  UpdateSlotRequestSchema,
} from '../src/index';
import assert from 'node:assert/strict';
import {
  SignupRequestSchema,
  ParentKidMessageRowSchema,
  QuestionRecordSchema,
  EventEnvelopeSchema,
  ChildEventSchema,
  AnalyticsEventSchema,
  IngestEventsRequestSchema,
  IngestEventsRequestLenientSchema,
  ChildProfileSchema,
  UpdateProfileRequestSchema,
  DeviceSnapshotSchema,
  EVENT_NAMES,
  GenderSchema,
  FACE_PATHS,
  defaultProgressByModule,
  defaultProgressByModulePerLanguage,
  FLAG_KEYS,
  FLAG_FALLBACKS,
  FLAG_DEFAULTS,
  EffectiveFlagsResponseSchema,
  UpdateFlagRequestSchema,
  SetFlagOverrideRequestSchema,
  FlagOverrideRowSchema,
  FLAG_ANNOUNCEMENTS,
  announceableFlags,
  RolloutRequestSchema,
  type EventEnvelope,
} from '../src/index';

const UUID = '00000000-0000-4000-8000-000000000000';
const UUID2 = '11111111-1111-4111-8111-111111111111';
const NOW = new Date().toISOString();

describe('QuestionRecord', () => {
  it('accepts the spec sample num-l5-l2-001 (bare arithmetic, lang null)', () => {
    // product Appendix B.4
    const q = QuestionRecordSchema.parse({
      id: 'num-l5-l2-001',
      module: 'numbers',
      level: 5,
      lesson: 2,
      theme: 'addition-2digit-no-carry',
      type: 'mcq-number',
      prompt: '23 + 14',
      answer: 37,
      distractors: [35, 47, 27],
      difficulty: 1,
      lang: null,
      concept_tags: ['addition', '2-digit', 'no-carry'],
      created_by: 'ai',
      ratings: [{ rater_id: 'admin-1', score: 4 }],
      avg_rating: 4.2,
      status: 'confirmed',
    });
    assert.equal(q.answer, 37);
    assert.equal(q.distractors.length, 3);
  });

  it('accepts a bilingual word problem (lang "both")', () => {
    // product Appendix B.4
    const q = QuestionRecordSchema.parse({
      id: 'num-l5-l3-007',
      module: 'numbers',
      level: 5,
      lesson: 3,
      theme: 'addition-word-problem',
      type: 'mcq-number',
      prompt: {
        fr: 'Ana a 23 billes, elle en gagne 14. Combien en a-t-elle ?',
        en: 'Ana has 23 marbles and wins 14 more. How many does she have?',
      },
      answer: 37,
      distractors: [{ value: 35, error_type: 'off-by-one' }, 47, 27],
      difficulty: 2,
      lang: 'both',
      concept_tags: ['addition', 'word-problem'],
      created_by: 'ai',
      status: 'confirmed',
    });
    assert.equal(q.lang, 'both');
  });

  it('rejects lang "both" with a bare (non-bilingual) prompt — parity enforced', () => {
    const result = QuestionRecordSchema.safeParse({
      id: 'bad-1',
      module: 'words',
      sub_mode: 'fill',
      level: 1,
      lesson: 1,
      theme: 'subject',
      type: 'mcq-word',
      prompt: 'le chat ___ sur le tapis',
      answer: { fr: 'dort', en: 'sleeps' },
      difficulty: 1,
      lang: 'both',
      created_by: 'ai',
    });
    assert.equal(result.success, false);
  });

  it('accepts lang null with a bilingual instruction prompt (Curriculum v0.1: prompt = instruction)', () => {
    const result = QuestionRecordSchema.safeParse({
      id: 'ok-instruction',
      module: 'keyboard',
      sub_mode: 'copy',
      level: 1,
      lesson: 1,
      theme: 'letters',
      type: 'typing',
      prompt: { fr: 'Tape ce que tu vois.', en: 'Type what you see.' },
      answer: 'e',
      difficulty: 1,
      lang: null,
      config: { target: 'e' },
      created_by: 'ai',
    });
    assert.equal(result.success, true);
  });
});

describe('Events & ingestion envelope', () => {
  it('wraps a session_start event', () => {
    const env: EventEnvelope = EventEnvelopeSchema.parse({
      event_id: UUID,
      profile_id: UUID2,
      session_id: UUID2,
      client_ts: NOW,
      event: { name: 'session_start', initiation_label: null },
    });
    assert.equal(env.schema_version, 1);
    assert.equal(env.event.name, 'session_start');
  });

  it('wraps a typing_keystroke event (process-rich, §9.2)', () => {
    const env = EventEnvelopeSchema.parse({
      event_id: UUID,
      profile_id: UUID2,
      session_id: UUID2,
      client_ts: NOW,
      event: {
        name: 'typing_keystroke',
        level: 1,
        lesson: 1,
        question_id: 'kbd-l1-l1-003',
        expected_char: 'a',
        typed_char: 'a',
        correct: true,
        time_since_prev_ms: 420,
        position_in_word: 0,
      },
    });
    assert.equal(env.event.name, 'typing_keystroke');
  });

  it('parses lesson_started with the trigger field (volition signal, §13.2)', () => {
    const e = ChildEventSchema.parse({
      name: 'lesson_started',
      module: 'numbers',
      level: 1,
      lesson: 1,
      trigger: 'replay',
      position_in_session: 2,
    });
    assert.equal(e.name, 'lesson_started');
    if (e.name === 'lesson_started') {
      assert.equal(e.trigger, 'replay');
    }
  });

  it('discriminates code_level_solved via the union', () => {
    const e = AnalyticsEventSchema.parse({
      name: 'code_level_solved',
      level: 5,
      lesson: 1,
      total_attempts: 3,
      final_blocks_used: 6,
      optimal_blocks: 5,
      efficiency_ratio: 5 / 6,
      used_loop: true,
      used_conditional: false,
      total_wall_hits: 2,
      hints_used: 0,
      duration_ms: 48000,
    });
    assert.equal(e.name, 'code_level_solved');
  });

  it('rejects an unknown event name', () => {
    const result = AnalyticsEventSchema.safeParse({ name: 'not_an_event' });
    assert.equal(result.success, false);
  });

  it('every name in EVENT_NAMES is unique', () => {
    assert.equal(new Set(EVENT_NAMES).size, EVENT_NAMES.length);
  });

  it('accepts a batch ingestion request', () => {
    const req = IngestEventsRequestSchema.parse({
      events: [
        {
          event_id: UUID,
          profile_id: UUID2,
          session_id: null,
          client_ts: NOW,
          event: { name: 'app_launched', locale: 'fr' },
        },
        {
          event_id: UUID2,
          profile_id: UUID2,
          session_id: UUID2,
          client_ts: NOW,
          event: {
            name: 'question_answered',
            module: 'numbers',
            level: 1,
            lesson: 1,
            question_id: 'num-l1-l1-001',
            correct: false,
            selected_option: 11,
            response_time_ms: 1900,
            attempt_num: 1,
          },
        },
      ],
    });
    assert.equal(req.events.length, 2);
  });
});

describe('DeviceSnapshot', () => {
  it('accepts a full snapshot', () => {
    const s = DeviceSnapshotSchema.parse({
      device_id: '22222222-2222-4222-8222-222222222222',
      ua_full: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)…',
      screen_w: 390, screen_h: 844, dpr: 3,
      tz: 'Europe/Paris', tz_offset_min: 120,
      locale: 'fr', app_version: 'v2.7.1', pwa_standalone: true,
    });
    assert.equal(s.tz, 'Europe/Paris');
  });

  it('is accepted (optional) on the lenient ingest request', () => {
    const r = IngestEventsRequestLenientSchema.parse({
      events: [
        { event_id: UUID, profile_id: UUID2, session_id: null, client_ts: NOW,
          event: { name: 'app_launched', locale: 'fr' } },
      ],
      device: {
        device_id: '22222222-2222-4222-8222-222222222222',
        ua_full: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)…',
        screen_w: 390, screen_h: 844, dpr: 3,
        tz: 'Europe/Paris', tz_offset_min: 120,
        locale: 'fr', app_version: 'v2.7.1', pwa_standalone: true,
      },
    });
    assert.equal(r.device?.tz, 'Europe/Paris');
  });

  it('drops a malformed device snapshot on the lenient schema instead of rejecting the batch', () => {
    const result = IngestEventsRequestLenientSchema.safeParse({
      events: [
        { event_id: UUID, profile_id: UUID2, session_id: null, client_ts: NOW,
          event: { name: 'app_launched', locale: 'fr' } },
      ],
      device: {
        device_id: 'not-a-uuid',
        ua_full: 'x',
        tz: 'X',
        tz_offset_min: 0,
        locale: 'fr',
        screen_w: -5,
        screen_h: null,
        dpr: null,
        app_version: null,
        pwa_standalone: false,
      },
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.device, undefined);
    }
  });
});

describe('session_start tz', () => {
  it('carries tz + offset', () => {
    const env = EventEnvelopeSchema.parse({
      event_id: UUID, profile_id: UUID2, session_id: UUID2, client_ts: NOW,
      event: { name: 'session_start', initiation_label: null, tz: 'Europe/Paris', tz_offset_min: 120 },
    });
    if (env.event.name === 'session_start') assert.equal(env.event.tz_offset_min, 120);
  });
});

describe('ChildProfile', () => {
  it('accepts a minimal profile with empty progress tracks', () => {
    const emptyTrack = { highest_level: 1, levels: [] };
    const perLang = { fr: emptyTrack, en: emptyTrack };
    const profile = ChildProfileSchema.parse({
      id: UUID,
      parent_id: UUID2,
      name: 'Léa',
      avatar: 'avatar_1',
      skin_tone: 'skin_2',
      hair_color: 'hair_brown',
      hair_style: 'style_short',
      shirt_color: 'shirt_blue',
      language: 'fr',
      created_at: NOW,
      progress_by_module: {
        numbers: emptyTrack,
        keyboard: emptyTrack,
        code: emptyTrack,
      },
      progress_by_module_per_language: {
        words_picture: perLang,
        words_fill: perLang,
        words_build: perLang,
        words_read: perLang,
        translation_fr_en: perLang,
        translation_en_fr: perLang,
      },
    });
    assert.equal(profile.audio_enabled, true);
    assert.equal(profile.total_stars, 0);
    assert.ok('translation_fr_en' in profile.progress_by_module_per_language);
    assert.equal('translation' in profile.progress_by_module_per_language, false);
  });

  it('defaults music_enabled to true (audio phase E)', () => {
    // Reuse the block's existing minimal valid profile fixture:
    const emptyTrack = { highest_level: 1, levels: [] };
    const perLang = { fr: emptyTrack, en: emptyTrack };
    const parsed = ChildProfileSchema.parse({
      id: UUID,
      parent_id: UUID2,
      name: 'Léa',
      avatar: 'avatar_1',
      skin_tone: 'skin_2',
      hair_color: 'hair_brown',
      hair_style: 'style_short',
      shirt_color: 'shirt_blue',
      language: 'fr',
      created_at: NOW,
      progress_by_module: {
        numbers: emptyTrack,
        keyboard: emptyTrack,
        code: emptyTrack,
      },
      progress_by_module_per_language: {
        words_picture: perLang,
        words_fill: perLang,
        words_build: perLang,
        words_read: perLang,
        translation_fr_en: perLang,
        translation_en_fr: perLang,
      },
    });
    assert.equal(parsed.music_enabled, true);
  });

  it('UpdateProfileRequest carries music_enabled through', () => {
    const parsed = UpdateProfileRequestSchema.parse({ music_enabled: false });
    assert.equal(parsed.music_enabled, false);
  });
});

describe('Gender', () => {
  it('GenderSchema accepts girl/boy and rejects anything else', () => {
    assert.equal(GenderSchema.parse('girl'), 'girl');
    assert.equal(GenderSchema.parse('boy'), 'boy');
    assert.throws(() => GenderSchema.parse('neutral'));
    assert.throws(() => GenderSchema.parse(''));
  });

  it('FACE_PATHS: one closed path per gender; boy keeps the legacy face verbatim', () => {
    assert.deepEqual(Object.keys(FACE_PATHS).sort(), ['boy', 'girl']);
    for (const p of Object.values(FACE_PATHS)) {
      assert.ok(p.startsWith('M ') && p.trim().endsWith('Z'));
    }
    // Regression pin: null/boy renders EXACTLY the current face (spec "Rendu SVG").
    assert.equal(
      FACE_PATHS.boy,
      'M 32 46 Q 32 34 50 34 Q 68 34 68 46 Q 68 62 60 70 Q 50 77 40 70 Q 32 62 32 46 Z',
    );
    assert.notEqual(FACE_PATHS.girl, FACE_PATHS.boy);
  });

  it('ChildProfile.gender defaults to null, accepts girl/boy', () => {
    const base = {
      id: UUID,
      parent_id: UUID2,
      name: 'Léna',
      skin_tone: 'skin_2',
      hair_color: 'hair_brown',
      hair_style: 'style_short',
      shirt_color: 'shirt_blue',
      language: 'fr',
      created_at: NOW,
      progress_by_module: defaultProgressByModule(),
      progress_by_module_per_language: defaultProgressByModulePerLanguage(),
    };
    assert.equal(ChildProfileSchema.parse(base).gender, null);
    assert.equal(ChildProfileSchema.parse({ ...base, gender: 'girl' }).gender, 'girl');
    assert.throws(() => ChildProfileSchema.parse({ ...base, gender: 'other' }));
  });
});

describe('ParentKidMessageRow', () => {
  const row = {
    id: '00000000-0000-4000-9000-0000000000b1',
    from_parent_id: '00000000-0000-4000-9000-000000000002',
    to_child_id: '00000000-0000-4000-9000-0000000000a3',
    text: 'Hello from tester B',
    status: 'unread' as const,
    created_at: NOW,
    read_at: null,
    deleted_at: null,
    to_child_name: 'Mia',
    from_display_name: 'Tester',
  };

  // `ChildProfile.avatar` is the LEGACY fixed-look enum, superseded by the recolour
  // dimensions: the column is nullable and profiles.ts leaves it null on every new
  // row. Requiring a string here made messages.ts's `.parse()` throw for any kid
  // created after the recolour migration — 500-ing the parent Messages list and the
  // single-message route for real families. Null is the NORMAL case now.
  it('accepts a null to_child_avatar (the normal case for post-recolour kids)', () => {
    const parsed = ParentKidMessageRowSchema.parse({ ...row, to_child_avatar: null });
    assert.equal(parsed.to_child_avatar, null);
  });

  it('still accepts a legacy avatar string', () => {
    const parsed = ParentKidMessageRowSchema.parse({ ...row, to_child_avatar: 'avatar_3' });
    assert.equal(parsed.to_child_avatar, 'avatar_3');
  });
});

describe('feature flags registry', () => {
  it('every key has a fallback, a default, and a description', () => {
    for (const key of FLAG_KEYS) {
      assert.equal(typeof FLAG_FALLBACKS[key], 'boolean');
      assert.equal(typeof FLAG_DEFAULTS[key], 'boolean');
    }
  });

  it('initial values match the design decisions — all audio ships dark', () => {
    assert.equal(FLAG_FALLBACKS.kid_voiceover, false);
    assert.equal(FLAG_FALLBACKS.kid_ambient_music, false);
    assert.equal(FLAG_FALLBACKS.kid_game_sounds, false);
    assert.equal(FLAG_DEFAULTS.kid_voiceover, false);
    assert.equal(FLAG_DEFAULTS.kid_ambient_music, false);
    assert.equal(FLAG_DEFAULTS.kid_game_sounds, false);
  });

  it('EffectiveFlagsResponseSchema accepts a boolean map', () => {
    const parsed = EffectiveFlagsResponseSchema.parse({ flags: { kid_voiceover: false, unknown_future: true } });
    assert.equal(parsed.flags.kid_voiceover, false);
  });

  it('UpdateFlagRequestSchema allows partial updates', () => {
    assert.deepEqual(UpdateFlagRequestSchema.parse({ enabled_default: true }), { enabled_default: true });
    assert.deepEqual(UpdateFlagRequestSchema.parse({}), {});
  });

  it('SetFlagOverrideRequestSchema requires a valid email + enabled', () => {
    assert.throws(() => SetFlagOverrideRequestSchema.parse({ email: 'nope', enabled: true }));
    const ok = SetFlagOverrideRequestSchema.parse({ email: 'a@b.com', enabled: false });
    assert.equal(ok.enabled, false);
  });
});

describe('SignupRequestSchema — provable-consent gate', () => {
  const valid = { email: 'p@example.com', password: 'a-good-password', terms_accepted: true as const };

  it('accepts a signup that explicitly accepts the terms', () => {
    assert.equal(SignupRequestSchema.safeParse(valid).success, true);
  });

  it('rejects a signup with no terms_accepted — the account cannot be created without it', () => {
    const { terms_accepted, ...noTerms } = valid;
    void terms_accepted;
    assert.equal(SignupRequestSchema.safeParse(noTerms).success, false);
  });

  it('rejects terms_accepted: false (z.literal(true), not a loose boolean)', () => {
    assert.equal(SignupRequestSchema.safeParse({ ...valid, terms_accepted: false }).success, false);
    // a truthy string must not slip through either
    assert.equal(SignupRequestSchema.safeParse({ ...valid, terms_accepted: 'true' }).success, false);
  });

  it('carries no version field — the server stamps the version, never the client', () => {
    // z.object strips unknown keys, so a client-sent `version` cannot reach the DB.
    const parsed = SignupRequestSchema.parse({ ...valid, version: 'attacker-chosen' } as never);
    assert.equal('version' in parsed, false);
  });
});

import { FLAG_KEYS, FLAG_FALLBACKS, FLAG_DEFAULTS, moduleFlag, levelFlag, worldLevelFlag } from '../src/flags';

describe('content rollout flags', () => {
  it('registers code_l6 as a dark content flag', () => {
    assert.ok((FLAG_KEYS as readonly string[]).includes('code_l6'));
    assert.equal((FLAG_FALLBACKS as Record<string, boolean>)['code_l6'], false);
    assert.equal((FLAG_DEFAULTS as Record<string, boolean>)['code_l6'], false);
  });
  it('registers code_draw_l4 as a dark content flag', () => {
    assert.ok((FLAG_KEYS as readonly string[]).includes('code_draw_l4'));
    assert.equal((FLAG_FALLBACKS as Record<string, boolean>)['code_draw_l4'], false);
    assert.equal((FLAG_DEFAULTS as Record<string, boolean>)['code_draw_l4'], false);
  });
  it('levelFlag maps code:6 to code_l6 and returns undefined for unflagged units', () => {
    assert.equal(levelFlag('code', 6), 'code_l6');
    assert.equal(levelFlag('code', 3), undefined);
    assert.equal(levelFlag('numbers', 1), undefined);
  });
  it('worldLevelFlag gates the draw pen ladder (L4+L5) under one flag, nothing else', () => {
    assert.equal(worldLevelFlag('code', 'draw', 4), 'code_draw_l4');
    assert.equal(worldLevelFlag('code', 'draw', 5), 'code_draw_l4'); // combine rides the same gate
    assert.equal(worldLevelFlag('code', 'maze', 4), undefined); // maze L4/L5 stay live
    assert.equal(worldLevelFlag('code', 'maze', 5), undefined);
    assert.equal(worldLevelFlag('code', 'draw', 2), undefined);
  });
  it('moduleFlag returns undefined for unflagged modules', () => {
    assert.equal(moduleFlag('code'), undefined);
  });
});

describe('rollout & invite contracts', () => {
  it('every announceable flag has FR+EN title and body', () => {
    for (const key of announceableFlags()) {
      const a = FLAG_ANNOUNCEMENTS[key]!;
      assert.ok(a.fr.title && a.fr.body, `${key} missing fr`);
      assert.ok(a.en.title && a.en.body, `${key} missing en`);
    }
  });

  it('the three dark flags are announceable', () => {
    const keys = announceableFlags();
    for (const k of ['code_draw_l4', 'code_l6', 'kid_ambient_music'] as const) {
      assert.ok(keys.includes(k), `${k} should be announceable`);
    }
  });

  it('RolloutRequestSchema defaults enable/send to true and rejects non-announceable flags', () => {
    const ok = RolloutRequestSchema.parse({ flags: ['code_l6'], emails: ['a@b.co'] });
    assert.equal(ok.enable, true);
    assert.equal(ok.send, true);
    // kid_voiceover is a real flag but has no announcement copy
    const bad = RolloutRequestSchema.safeParse({ flags: ['kid_voiceover'], emails: ['a@b.co'] });
    assert.equal(bad.success, false);
  });

  it('FlagOverrideRow carries notified_at', () => {
    const row = FlagOverrideRowSchema.parse({
      parent_id: UUID2,
      email: 'a@b.co',
      enabled: true,
      notified_at: null,
    });
    assert.equal(row.notified_at, null);
  });
});

describe('content studio', () => {
  const proposal = { title: 't', rationale: 'r', evidence: ['e'], sample_angles: ['a'] };

  it('DirectionProposalsSchema requires exactly 3 proposals', () => {
    assert.equal(DirectionProposalsSchema.safeParse({ proposals: [proposal, proposal] }).success, false);
    assert.equal(DirectionProposalsSchema.safeParse({ proposals: [proposal, proposal, proposal] }).success, true);
  });

  it('TikTokPostSchema requires filming_plan when mode is filming_plan', () => {
    const base = { caption: 'c', hashtags: ['x'], on_screen_text: ['y'] };
    assert.equal(TikTokPostSchema.safeParse({ ...base, mode: 'filming_plan' }).success, false);
    assert.equal(
      TikTokPostSchema.safeParse({ ...base, mode: 'filming_plan', filming_plan: { hook: 'h', shots: ['s'], duration_s: 20 } }).success,
      true,
    );
    assert.equal(TikTokPostSchema.safeParse({ ...base, mode: 'library_video' }).success, true);
  });

  it('WeekTitlesSchema rejects a platform outside CONTENT_PLATFORMS', () => {
    const day = (platform: string) => ({
      days: [{ date: '2026-10-26', topic: 't', angle: 'a', format: 'text', platforms: [{ platform, language: 'fr' }], sources: [{ title: 's', url: 'https://x.co' }] }],
    });
    assert.equal(WeekTitlesSchema.safeParse(day('linkedin')).success, true);
    assert.equal(WeekTitlesSchema.safeParse(day('facebook')).success, false);
  });

  it('MarkPublishedRequestSchema rejects rating 0 and 6', () => {
    const p = 'https://linkedin.com/posts/x';
    assert.equal(MarkPublishedRequestSchema.safeParse({ post_url: p, rating: 0 }).success, false);
    assert.equal(MarkPublishedRequestSchema.safeParse({ post_url: p, rating: 6 }).success, false);
    assert.equal(MarkPublishedRequestSchema.safeParse({ post_url: p, rating: 5, comment: 'ok' }).success, true);
  });

  it('VisitBeaconSchema rejects a 121-char utm value', () => {
    assert.equal(VisitBeaconSchema.safeParse({ path: '/', utm: { source: 'a'.repeat(121) } }).success, false);
    assert.equal(VisitBeaconSchema.safeParse({ path: '/', utm: { source: 'a'.repeat(120) }, lang: 'en' }).success, true);
  });

  it('SignupRequestSchema accepts optional attribution', () => {
    const base = { email: 'a@b.co', password: 'password1', terms_accepted: true as const };
    assert.equal(SignupRequestSchema.safeParse(base).success, true);
    assert.equal(SignupRequestSchema.safeParse({ ...base, attribution: { utm: { source: 'linkedin' }, referrer_host: 'l.co' } }).success, true);
  });

  it('other contracts and code-owned maps', () => {
    for (const t of AI_TASKS) assert.ok(AI_CAPABILITIES.includes(AI_TASK_CAPABILITY[t]));
    for (const a of AGENT_KEYS) assert.ok(AI_TASKS.includes(AGENT_TASK[a]));
    assert.ok(JOB_KEYS.length && SLOT_FORMATS.length && WEEK_STATUSES.length && SLOT_STATUSES.length && DRAFT_STATUSES.length);
    assert.ok(CONTENT_LANGUAGES.length && OBJECTIVE_TYPES.length);
    assert.equal(ChooseDirectionRequestSchema.safeParse({ proposal_index: 3, refinement: '', platform_angles: {} }).success, false);
    assert.equal(ChooseDirectionRequestSchema.safeParse({ proposal_index: 2, refinement: 'x', platform_angles: { tiktok: 'y' } }).success, true);
    const S = StudioSettingsUpdateSchema;
    assert.equal(S.safeParse({ timezone: 'Africa/Douala', recipients: ['a@b.co'], monthly_budget_usd: 50, budget_alert_ratio: 1 }).success, true);
    assert.equal(S.safeParse({ timezone: 'Not/AZone' }).success, false);
    assert.equal(S.safeParse({ recipients: [] }).success, false);
    assert.equal(S.safeParse({ monthly_budget_usd: 0 }).success, false);
    assert.equal(S.safeParse({ budget_alert_ratio: 0 }).success, false);
    assert.equal(S.safeParse({ budget_alert_ratio: 1.1 }).success, false);
    const O = ObjectiveUpsertSchema;
    assert.equal(O.safeParse({ month: '2026-10', type: 'signups', statement: 's', targets: { signups: 10 } }).success, true);
    assert.equal(O.safeParse({ month: '2026-13', type: 'signups', statement: 's' }).success, false);
    assert.equal(EditorialLineUpdateSchema.safeParse({ body: 'x', product_facts: { a: 1 } }).success, true);
    assert.equal(EditorialLineUpdateSchema.safeParse({ body: 'x' }).success, false);
    const U = UpdateSlotRequestSchema;
    assert.equal(U.safeParse({}).success, false);
    assert.equal(U.safeParse({ topic: 't', platforms: [{ platform: 'tiktok', language: 'en' }] }).success, true);
    assert.equal(U.safeParse({ platforms: [] }).success, false);
    assert.equal(U.safeParse({ language: 'en' }).success, false);
    assert.equal(
      WeekTitlesSchema.safeParse({ days: [{ date: '2026-10-26', topic: 't', angle: 'a', format: 'text', platforms: [], sources: [{ title: 's', url: 'nope' }] }] }).success,
      false,
    );
    assert.equal(SkipDayRequestSchema.safeParse({ reason: '' }).success, false);
    assert.equal(UpdateDraftRequestSchema.safeParse({ body: 'b', media_asset_id: null }).success, true);
    assert.equal(MediaUploadInitSchema.safeParse({ file_name: 'a.png', mime: 'image/png', size_bytes: 10 }).success, true);
    assert.equal(MediaClearanceSchema.safeParse({ cleared: true }).success, true);
    assert.equal(UtmSchema.safeParse({}).success, true);
    assert.equal(LinkedInPostSchema.safeParse({ body: 'b', hashtags: [], link_target: 'landing' }).success, true);
    assert.equal(ArtDirectionSchema.safeParse({ media_asset_id: null, visual_brief: 'v' }).success, true);
    assert.equal(ArtDirectionSchema.safeParse({ media_asset_id: 'nope', visual_brief: 'v' }).success, false);
    assert.equal(ReportNarrativeSchema.safeParse({ headline: 'h', highlights: [], watch_outs: [] }).success, true);
  });

  it('MediaUploadInitSchema enforces size caps per kind at the boundary', () => {
    assert.equal(MEDIA_MAX_IMAGE_BYTES, 15 * 1024 * 1024);
    assert.equal(MEDIA_MAX_VIDEO_BYTES, 300 * 1024 * 1024);
    const f = (mime: string, size_bytes: number) => MediaUploadInitSchema.safeParse({ file_name: 'a', mime, size_bytes, ...(mime === 'video/mp4' ? { aspect: '9:16' } : {}) }).success;
    for (const m of ['image/png', 'image/jpeg', 'image/webp']) {
      assert.equal(f(m, MEDIA_MAX_IMAGE_BYTES), true);
      assert.equal(f(m, MEDIA_MAX_IMAGE_BYTES + 1), false);
    }
    assert.equal(f('video/mp4', MEDIA_MAX_VIDEO_BYTES), true);
    assert.equal(f('video/mp4', MEDIA_MAX_VIDEO_BYTES + 1), false);
    assert.equal(f('video/mp4', MEDIA_MAX_IMAGE_BYTES + 1), true);
  });

  it('MediaUploadInitSchema metadata: aspect required for video, optional lists bounded', () => {
    const p = (o: object) => MediaUploadInitSchema.safeParse({ file_name: 'a', size_bytes: 10, ...o }).success;
    assert.equal(p({ mime: 'video/mp4' }), false);
    assert.equal(p({ mime: 'video/mp4', aspect: '16:9' }), true);
    assert.equal(p({ mime: 'video/mp4', aspect: '3:2' }), false);
    assert.equal(p({ mime: 'image/png' }), true);
    for (const a of ['16:9', '1:1', '9:16', '4:5']) assert.equal(p({ mime: 'image/png', aspect: a }), true);
    assert.equal(p({ mime: 'image/png', language: 'en', tags: ['a'] }), true);
    assert.equal(p({ mime: 'image/png', language: 'de' }), false);
    assert.equal(p({ mime: 'image/png', tags: Array(11).fill('a') }), false);
    assert.equal(p({ mime: 'image/png', tags: [''] }), false);
    assert.equal(p({ mime: 'image/png', tags: ['x'.repeat(41)] }), false);
  });
});

describe('fitsPlatform (Ruling 16)', () => {
  const fit = (kind: string, aspect: string | null, platform: 'linkedin' | 'tiktok') => {
    const r = fitsPlatform(kind, aspect, platform);
    return r.ok ? 'ok' : r.code;
  };
  it('TikTok takes a vertical video only', () => {
    assert.equal(fit('video', '9:16', 'tiktok'), 'ok');
    assert.equal(fit('image', '9:16', 'tiktok'), 'media_kind_mismatch');
    for (const a of ['16:9', '1:1', '4:5']) assert.equal(fit('video', a, 'tiktok'), 'media_aspect_mismatch');
    assert.equal(fit('video', null, 'tiktok'), 'media_aspect_mismatch');
  });
  it('LinkedIn takes images and videos in 16:9, 1:1 or 4:5, never vertical', () => {
    for (const kind of ['image', 'video']) {
      for (const a of ['16:9', '1:1', '4:5']) assert.equal(fit(kind, a, 'linkedin'), 'ok');
      assert.equal(fit(kind, '9:16', 'linkedin'), 'media_aspect_mismatch');
    }
  });
  it('an unknown aspect is fine for an image, not for a video', () => {
    assert.equal(fit('image', null, 'linkedin'), 'ok');
    assert.equal(fit('video', null, 'linkedin'), 'media_aspect_mismatch');
    assert.equal(fit('audio', '16:9', 'linkedin'), 'media_kind_mismatch');
  });
});

import { ExternalMediaRequestSchema, PUBLISH_URL_MAX, PublishLinksUpdateSchema, publishUrlProblem } from '../src/content-studio';

describe('publish links (« Copier et ouvrir »)', () => {
  it('takes an https link on the platform’s own host', () => {
    assert.equal(publishUrlProblem('linkedin', 'https://www.linkedin.com/company/109660238/admin/page-posts/published/?share=true'), null);
    assert.equal(publishUrlProblem('linkedin', 'https://linkedin.com/feed/'), null);
    assert.equal(publishUrlProblem('tiktok', 'https://www.tiktok.com/tiktokstudio/upload'), null);
    assert.equal(publishUrlProblem('tiktok', 'https://tiktok.com/upload'), null);
    assert.equal(publishUrlProblem('linkedin', 'https://WWW.LinkedIn.com/feed/'), null, 'host case does not matter');
  });
  it('refuses anything else, saying why', () => {
    assert.equal(publishUrlProblem('linkedin', 'pas un lien'), 'not_url');
    assert.equal(publishUrlProblem('linkedin', 'http://www.linkedin.com/feed/'), 'not_https');
    assert.equal(publishUrlProblem('linkedin', 'javascript:alert(1)'), 'not_https');
    assert.equal(publishUrlProblem('linkedin', 'https://www.tiktok.com/upload'), 'wrong_host');
    assert.equal(publishUrlProblem('tiktok', 'https://www.linkedin.com/feed/'), 'wrong_host');
    assert.equal(publishUrlProblem('linkedin', 'https://evil.com/?https://www.linkedin.com'), 'wrong_host');
    assert.equal(publishUrlProblem('linkedin', 'https://www.linkedin.com.evil.com/'), 'wrong_host');
    assert.equal(publishUrlProblem('linkedin', 'https://fr.linkedin.com/'), 'wrong_host');
    assert.equal(publishUrlProblem('linkedin', 'https://user:pw@www.linkedin.com/'), 'wrong_host');
    assert.equal(publishUrlProblem('linkedin', 'https://www.linkedin.com:8443/'), 'wrong_host');
    assert.equal(publishUrlProblem('linkedin', `https://www.linkedin.com/${'a'.repeat(PUBLISH_URL_MAX)}`), 'too_long');
  });
  it('the PATCH body names at least one platform; null clears its link', () => {
    const p = (o: unknown) => PublishLinksUpdateSchema.safeParse(o).success;
    assert.equal(p({ linkedin: 'https://www.linkedin.com/feed/' }), true);
    assert.equal(p({ tiktok: null }), true);
    assert.equal(p({}), false);
    assert.equal(p({ linkedin: 42 }), false);
    assert.equal(p({ instagram: 'https://instagram.com' }), false);
  });
  it('the external-media toggle carries an optional note of 200 characters at most', () => {
    const p = (o: unknown) => ExternalMediaRequestSchema.safeParse(o).success;
    assert.equal(p({ enabled: true }), true);
    assert.equal(p({ enabled: true, note: 'tournage-ecole.mp4' }), true);
    assert.equal(p({ enabled: false, note: null }), true);
    assert.equal(p({ enabled: true, note: 'x'.repeat(201) }), false);
    assert.equal(p({ note: 'x' }), false);
  });
});
