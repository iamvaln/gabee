/**
 * Cost of one call from the catalogue prices (USD per million tokens), rounded
 * to 6 decimals. Cache reads/writes are counted as input tokens at the input
 * price: the router does not use prompt caching and stores no cache price.
 */
export function costUsd(
  model: { inputUsdPerMTok: number; outputUsdPerMTok: number },
  inputTokens: number,
  outputTokens: number,
): number {
  const usd = (inputTokens * model.inputUsdPerMTok + outputTokens * model.outputUsdPerMTok) / 1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}
