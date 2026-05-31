import type { NextRequest } from 'next/server';
import { GeneratePlanRequestSchema, type GeneratePlanRequest } from '@gabee/types';
import { readJson, requireAdmin, errorResponse, HttpError } from '@/lib/server/http';
import { getAiProvider } from '@/lib/server/ai';
import { planStreamInput, saveAiDraft } from '@/lib/server/services/admin-content';

export const runtime = 'nodejs';

/**
 * Stream the AI plan draft to the editor as chunked text. The client reads the body
 * incrementally (ReadableStream reader) to render the draft live. When the stream
 * completes we parse the full JSON and persist it as an `ai_draft` plan with ai_meta.
 *
 * Not wrapped in `route()` because it returns a raw streaming Response, not a
 * NextResponse — pre-stream failures (auth, validation, missing key) are still mapped
 * to ApiError responses via errorResponse(); errors mid-stream are surfaced inline.
 */
export async function POST(req: NextRequest): Promise<Response> {
  let module: GeneratePlanRequest['module'];
  let level: GeneratePlanRequest['level'];
  let actorId: string;
  try {
    const session = await requireAdmin(req);
    actorId = session.parentId;
    const body = await readJson(req, GeneratePlanRequestSchema);
    module = body.module;
    level = body.level;
    // Fail before opening the stream when the key is absent so the UI gets a clean 503.
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new HttpError(503, 'ai_unavailable', 'Set ANTHROPIC_API_KEY to use AI authoring');
    }
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(err);
    return errorResponse(new HttpError(500, 'internal_error', 'Something went wrong'));
  }

  const baseInput = await planStreamInput(module, level, actorId);
  const provider = getAiProvider();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = '';
      // streamPlan resolves this once it has the final-message usage so we can
      // persist real token counts on the ai_draft (not zero).
      let usage = { inputTokens: 0, outputTokens: 0 };
      try {
        const input = { ...baseInput, onUsage: (u: typeof usage) => { usage = u; } };
        for await (const chunk of provider.streamPlan(input)) {
          full += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
        // Persist the parsed draft once the stream completes.
        const draft = provider.parsePlan(full);
        await saveAiDraft(module, level, draft, {
          provider: 'anthropic',
          model: 'claude-opus-4-7',
          tokens: usage.inputTokens + usage.outputTokens,
        });
      } catch (err) {
        // Headers are already sent, so surface the error inline in the body.
        const code = err instanceof HttpError ? err.code : 'ai_error';
        const message = err instanceof Error ? err.message : 'Generation failed';
        controller.enqueue(encoder.encode(`\n[stream_error:${code}] ${message}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
