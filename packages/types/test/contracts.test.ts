import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  QuestionRecordSchema,
  EventEnvelopeSchema,
  ChildEventSchema,
  AnalyticsEventSchema,
  IngestEventsRequestSchema,
  IngestEventsRequestLenientSchema,
  ChildProfileSchema,
  DeviceSnapshotSchema,
  EVENT_NAMES,
  GenderSchema,
  FACE_PATHS,
  defaultProgressByModule,
  defaultProgressByModulePerLanguage,
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
