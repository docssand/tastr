/**
 * Funzioni statistiche condivise dalle analisi (Wrapped, profilo di gusto, suggerimenti).
 * Stanno qui perché più di un modulo ha bisogno delle stesse identiche formule: duplicarle
 * significherebbe tarare due volte le stesse soglie.
 */

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Riscala `value` a 0-1 fra due estremi. Serve a mettere metriche diverse sulla stessa scala. */
export function rescale(value: number, low: number, high: number) {
  return clamp01((value - low) / (high - low));
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Correlazione di Pearson. Misura se sei d'accordo con la massa su *quali* film sono belli,
 * indipendentemente dal fatto che tu voti più alto o più basso di lei: quello è lo scarto medio,
 * riportato a parte. `null` quando una delle due serie è piatta e la correlazione non è definita.
 */
export function pearson(pairs: Array<[number, number]>): number | null {
  const n = pairs.length;
  if (n < 2) return null;

  let sumX = 0;
  let sumY = 0;
  for (const [x, y] of pairs) {
    sumX += x;
    sumY += y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (const [x, y] of pairs) {
    const dx = x - meanX;
    const dy = y - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }

  const denominator = Math.sqrt(varianceX * varianceY);
  return denominator === 0 ? null : covariance / denominator;
}
