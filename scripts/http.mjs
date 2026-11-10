export async function fetchWithRetry(url, { fetcher = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), accept = 'application/json' } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await fetcher(url, {
        headers: { 'User-Agent': 'SeattleRestaurantWatch/1.0 (+https://github.com/alexpepperl/seattle-restaurant-watch)', Accept: accept },
        signal: AbortSignal.timeout(25000)
      });
    } catch (error) {
      if (attempt === 2) throw error;
      await wait(1000 * (attempt + 1));
      continue;
    }
    if (response.ok) return { response, attempts: attempt + 1 };
    if (attempt === 2 || (response.status !== 429 && response.status < 500)) throw new Error(`HTTP ${response.status}`);
    await wait(1000 * (attempt + 1));
  }
}
