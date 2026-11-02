import { LocalizedError } from './messages';

const ORIGIN = 'https://lrc.red';
const MAX_TTML_BYTES = 10 * 1024 ** 2;
const CACHE_MS = 5 * 60_000;

export interface LyricSearchHit {
  isrc: string;
  title: string;
  artist: string;
  album?: string;
  year?: number;
}
export interface LyricSearchPage {
  hits: LyricSearchHit[];
  next: string | null;
}
export interface LyricSource {
  title: string;
  url: string;
}

export function lyricPageURL(isrc: string): string {
  if (!/^[A-Z0-9]{12}$/i.test(isrc)) throw new LocalizedError('lyricSearch.invalidResponse');
  return `${ORIGIN}/s/${encodeURIComponent(isrc)}`;
}

function parseSearchPage(value: unknown): LyricSearchPage {
  if (!value || typeof value !== 'object') throw new LocalizedError('lyricSearch.invalidResponse');
  const { hits, next } = value as Record<string, unknown>;
  if (!Array.isArray(hits) || (next != null && typeof next !== 'string'))
    throw new LocalizedError('lyricSearch.invalidResponse');
  const validHits = hits.map((hit: unknown): LyricSearchHit => {
    if (!hit || typeof hit !== 'object') throw new LocalizedError('lyricSearch.invalidResponse');
    const { isrc, title, artist, album, year } = hit as Record<string, unknown>;
    if (
      typeof isrc !== 'string' ||
      !/^[A-Z0-9]{12}$/i.test(isrc) ||
      typeof title !== 'string' ||
      !title.trim() ||
      typeof artist !== 'string'
    )
      throw new LocalizedError('lyricSearch.invalidResponse');
    return {
      isrc,
      title,
      artist,
      album: typeof album === 'string' ? album : undefined,
      year: typeof year === 'number' && Number.isFinite(year) ? year : undefined,
    };
  });
  return { hits: validHits, next: next || null };
}

// A browser client must identify itself on every request, including TTML downloads.
// See https://lrc.red/api. Never send requests with an incomplete identity.
export class LrcRedClient {
  private retryAt = 0;
  private cache = new Map<string, { expires: number; value: string }>();
  constructor(
    private contactEmail = import.meta.env.VITE_LRC_RED_CONTACT_EMAIL ?? 'contact@hproject.xyz',
    private fetcher: typeof fetch = fetch.bind(globalThis),
  ) {}

  private async request(path: string, signal: AbortSignal): Promise<string> {
    const email = this.contactEmail.trim();
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))
      throw new LocalizedError('lyricSearch.notConfigured');
    signal.throwIfAborted();
    if (Date.now() < this.retryAt)
      throw new LocalizedError('lyricSearch.rateLimited', {
        seconds: Math.max(1, Math.ceil((this.retryAt - Date.now()) / 1000)),
      });
    const cached = this.cache.get(path);
    if (cached && cached.expires > Date.now()) return cached.value;
    let response: Response;
    try {
      response = await this.fetcher(`${ORIGIN}${path}`, {
        headers: { 'X-Client-ID': `Karaoke Maker (https://karaoke.hproject.xyz; ${email})` },
        credentials: 'omit',
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
      });
      if (response.status === 429) {
        const retry = response.headers.get('Retry-After');
        const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : 0;
        this.retryAt = seconds
          ? Date.now() + seconds * 1000
          : Math.max(Date.now() + 60_000, Date.parse(retry || '') || 0);
        throw new LocalizedError('lyricSearch.rateLimited', {
          seconds: Math.max(1, Math.ceil((this.retryAt - Date.now()) / 1000)),
        });
      }
      if (response.status === 404) throw new LocalizedError('lyricSearch.unavailable');
      if (!response.ok)
        throw new LocalizedError('lyricSearch.requestFailed', { status: response.status });
      if (Number(response.headers.get('Content-Length')) > MAX_TTML_BYTES)
        throw new LocalizedError('studio.tTMLFileMustBeSmallerThan10');
      const blob = await response.blob();
      if (blob.size > MAX_TTML_BYTES)
        throw new LocalizedError('studio.tTMLFileMustBeSmallerThan10');
      const text = await blob.text();
      signal.throwIfAborted();
      // Bound memory use; keep only a few user-requested responses, never persist lyrics.
      if (this.cache.size >= 12) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(path, { expires: Date.now() + CACHE_MS, value: text });
      return text;
    } catch (error) {
      if (signal.aborted || error instanceof LocalizedError) throw error;
      throw new LocalizedError('lyricSearch.networkError');
    }
  }

  async search(query: string, signal: AbortSignal, after?: string): Promise<LyricSearchPage> {
    const params = new URLSearchParams({ q: query.trim() });
    if (after) params.set('after', after);
    const text = await this.request(`/search.json?${params}`, signal);
    try {
      return parseSearchPage(JSON.parse(text));
    } catch {
      throw new LocalizedError('lyricSearch.invalidResponse');
    }
  }

  async download(hit: LyricSearchHit, signal: AbortSignal): Promise<File> {
    lyricPageURL(hit.isrc);
    const text = await this.request(`/s/${encodeURIComponent(hit.isrc)}.ttml`, signal);
    const name =
      `${hit.artist} - ${hit.title}`
        .replace(/[\\/:*?"<>|\p{Cc}]/gu, '')
        .trim()
        .slice(0, 160) || hit.isrc;
    return new File([text], `${name}.ttml`, { type: 'application/ttml+xml' });
  }
}
