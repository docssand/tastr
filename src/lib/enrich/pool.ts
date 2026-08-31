/**
 * Esegue `worker` su tutti gli item con al massimo `limit` chiamate in volo.
 * Se un worker solleva un errore, gli altri si fermano al giro successivo:
 * senza questo, una chiave TMDB mancante farebbe partire migliaia di richieste inutili.
 */
export async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  let stopped = false;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length && !stopped) {
      try {
        await worker(items[cursor++]);
      } catch (err) {
        stopped = true;
        throw err;
      }
    }
  });
  await Promise.all(runners);
}
