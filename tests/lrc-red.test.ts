import { expect, test } from 'bun:test';
import { LrcRedClient, lyricPageURL } from '../src/lrc-red';

const hit = { isrc: 'GBAYE9200070', title: 'Song / live', artist: 'Artist' };
const signal = () => new AbortController().signal;
function mockFetch(
  handle: (url: string, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  return ((url: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handle(String(url), init))) as typeof fetch;
}

test('search identifies the app, encodes user input and cursors, and caches repeated searches', async () => {
  const calls: string[] = [];
  const client = new LrcRedClient(
    'contact@hproject.xyz',
    mockFetch((url, init) => {
      calls.push(url);
      expect(new Headers(init?.headers).get('X-Client-ID')).toBe(
        'Karaoke Maker (https://karaoke.hproject.xyz; contact@hproject.xyz)',
      );
      expect(init?.credentials).toBe('omit');
      return Response.json({ hits: [hit], next: 'p24&more' });
    }),
  );
  expect((await client.search(' Artist & Song ', signal())).hits).toEqual([
    { ...hit, album: undefined, year: undefined },
  ]);
  await client.search('Artist & Song', signal());
  expect(calls).toHaveLength(1);
  const params = new URL(calls[0]!).searchParams;
  expect(params.get('q')).toBe('Artist & Song');
  await client.search('Artist & Song', signal(), 'p24&more');
  expect(new URL(calls[1]!).searchParams.get('after')).toBe('p24&more');
});

test('TTML downloads identify the client and produce a safe filename', async () => {
  const client = new LrcRedClient(
    'contact@hproject.xyz',
    mockFetch((url, init) => {
      expect(url).toBe('https://lrc.red/s/GBAYE9200070.ttml');
      expect(new Headers(init?.headers).get('X-Client-ID')).toContain('contact@hproject.xyz');
      return new Response('<tt/>');
    }),
  );
  const file = await client.download(hit, signal());
  expect(file.name).toBe('Artist - Song  live.ttml');
  expect(file.type).toBe('application/ttml+xml');
  expect(await file.text()).toBe('<tt/>');
  expect(lyricPageURL(hit.isrc)).toBe('https://lrc.red/s/GBAYE9200070');
});

test('a missing identity or invalid song ID never sends a request', async () => {
  let calls = 0;
  const fetcher = mockFetch(() => {
    calls++;
    return new Response('');
  });
  const client = new LrcRedClient('', fetcher);
  await expect(client.search('Song', signal())).rejects.toThrow('public contact email');
  await expect(client.download({ ...hit, isrc: '../unexpected' }, signal())).rejects.toThrow(
    'unexpected response',
  );
  expect(calls).toBe(0);
});

test('429 respects Retry-After across search and downloads without retrying automatically', async () => {
  let calls = 0;
  const client = new LrcRedClient(
    'contact@hproject.xyz',
    mockFetch(() => {
      calls++;
      return new Response('', { status: 429, headers: { 'Retry-After': '120' } });
    }),
  );
  await expect(client.search('Song', signal())).rejects.toThrow('120 seconds');
  await expect(client.download(hit, signal())).rejects.toThrow('seconds');
  expect(calls).toBe(1);
});

test('malformed responses, HTTP errors, and oversized downloads are rejected', async () => {
  for (const value of [{ hits: [{}] }, { hits: [hit], next: {} }, [], null]) {
    const client = new LrcRedClient(
      'contact@hproject.xyz',
      mockFetch(() => Response.json(value)),
    );
    await expect(client.search('Song', signal())).rejects.toThrow('unexpected response');
  }
  for (const [status, expected] of [
    [404, 'no longer available'],
    [503, 'HTTP 503'],
  ] as const) {
    const client = new LrcRedClient(
      'contact@hproject.xyz',
      mockFetch(() => new Response('', { status })),
    );
    await expect(client.download(hit, signal())).rejects.toThrow(expected);
  }
  const client = new LrcRedClient(
    'contact@hproject.xyz',
    mockFetch(() => new Response('', { headers: { 'Content-Length': String(11 * 1024 ** 2) } })),
  );
  await expect(client.download(hit, signal())).rejects.toThrow('smaller than 10');
});

test('aborted requests cannot reuse a cached response', async () => {
  const client = new LrcRedClient(
    'contact@hproject.xyz',
    mockFetch(() => Response.json({ hits: [], next: null })),
  );
  await client.search('Song', signal());
  const controller = new AbortController();
  controller.abort();
  await expect(client.search('Song', controller.signal)).rejects.toThrow();
});
