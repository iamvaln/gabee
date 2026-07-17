import type {
  AiProvider,
  DraftedPlan,
  DraftedQuestion,
  GenerateQuestionsInput,
  GenerateQuestionsResult,
} from './provider';

/**
 * Deterministic AiProvider for integration tests. Only `generateQuestions` is
 * exercised (via `admin-content.ts#generateQuestions`), so it returns a canned
 * batch; the plan operations throw if a test accidentally reaches them.
 *
 * Inject with `setAiProvider(new FakeAiProvider(questions))` and restore with
 * `resetAiProvider()` in teardown.
 */
export class FakeAiProvider implements AiProvider {
  constructor(private readonly questions: DraftedQuestion[]) {}

  // eslint-disable-next-line require-yield
  async *streamPlan(): AsyncIterable<string> {
    throw new Error('FakeAiProvider.streamPlan is not used in tests');
  }

  parsePlan(): DraftedPlan {
    throw new Error('FakeAiProvider.parsePlan is not used in tests');
  }

  async generateQuestions(_input: GenerateQuestionsInput): Promise<GenerateQuestionsResult> {
    return { questions: this.questions, inputTokens: 0, outputTokens: 0 };
  }
}

/** A single valid drafted question that survives `insertCandidates`' prompt/answer filter. */
export function fakeDraftedQuestion(overrides: Partial<DraftedQuestion> = {}): DraftedQuestion {
  return {
    type: 'mcq-number',
    lang: null,
    prompt: '1 + 1 ?',
    answer: 2,
    distractors: [1, 3],
    difficulty: 1,
    theme: 'test',
    objective_ref: null,
    concept_tags: [],
    ...overrides,
  };
}
