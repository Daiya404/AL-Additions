import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { modules } from '../src/core/registry';
import { store as gmStore } from '../src/utils/helpers';
import '../src/modules/fastLoad';

describe('FastLoad: GraphQL Performance & Cache Engine', () => {
  let mockNativeFetch = vi.fn();

  function createJsonResponse(data: any, status = 200, statusText = 'OK') {
    return new Response(JSON.stringify(data), {
      status,
      statusText,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 15));

  beforeAll(() => {
    window.Response = globalThis.Response;
    window.Headers = globalThis.Headers;
    window.Request = globalThis.Request;

    window.fetch = ((...args: any[]) => mockNativeFetch(...args)) as any;
    (window as any).unsafeWindow = window;

    const fastLoadModule = modules.find((m) => m.name === 'fastLoad');
    fastLoadModule?.init();
  });

  beforeEach(() => {
    mockNativeFetch.mockReset();
    window.localStorage.clear();

    if (typeof (window as any).__ALFL_CLEAR__ === 'function') {
      (window as any).__ALFL_CLEAR__();
    }

    const stats = (window as any).__ALFL_STATS__;
    if (stats) {
      stats.graphqlRequests = 0;
      stats.cacheHits = 0;
      stats.deduped = 0;
      stats.staleServed = 0;
    }
  });

  describe('Module Initialization & Global Flags', () => {
    it('registers FastLoad version flag and internal inspection hooks', () => {
      expect((window as any).__ALA_FAST_LOAD__).toBe('0.4.3');
      expect((window as any).__ALFL_STATS__).toBeDefined();
      expect(typeof (window as any).__ALFL_CLEAR__).toBe('function');
    });
  });

  describe('Query Normalization & Cache Key Equivalence', () => {
    it('normalizes whitespace, newlines, and comments to serve cache hits', async () => {
      const responseData = { data: { Media: { id: 1, title: { romaji: 'Cowboy Bebop' } } } };
      mockNativeFetch.mockResolvedValueOnce(createJsonResponse(responseData));

      const queryA = 'query MediaList { # fetch media\n Media(id: 1) { id title { romaji } } }';
      const res1 = await window.fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryA })
      });
      const data1 = await res1.json();

      expect(mockNativeFetch).toHaveBeenCalledTimes(1);
      expect(data1).toEqual(responseData);

      await flushAsync();

      const queryB = `
        query MediaList {
          Media( id : 1 ) {
            id
            title {
              romaji
            }
          }
        }
      `;
      const res2 = await window.fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryB })
      });
      const data2 = await res2.json();

      expect(mockNativeFetch).toHaveBeenCalledTimes(1);
      expect(data2).toEqual(responseData);
      expect((window as any).__ALFL_STATS__.cacheHits).toBe(1);
    });

    it('normalizes variable key ordering via stable serialization', async () => {
      const responseData = { data: { Page: { media: [] } } };
      mockNativeFetch.mockResolvedValueOnce(createJsonResponse(responseData));

      await window.fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'query Search($season: MediaSeason, $year: Int) { Page { media { id } } }',
          variables: { season: 'FALL', year: 2024 }
        })
      });

      await flushAsync();
      expect(mockNativeFetch).toHaveBeenCalledTimes(1);

      await window.fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'query Search($season: MediaSeason, $year: Int) { Page { media { id } } }',
          variables: { year: 2024, season: 'FALL' }
        })
      });

      expect(mockNativeFetch).toHaveBeenCalledTimes(1);
      expect((window as any).__ALFL_STATS__.cacheHits).toBe(1);
    });

    it('maps MediaListCollection queries with userName to userId alias', async () => {
      gmStore.set('al_username', 'MatiX');
      gmStore.set('al_user_id', 9999);

      const responseData = { data: { MediaListCollection: { lists: [] } } };
      mockNativeFetch.mockResolvedValueOnce(createJsonResponse(responseData));

      await window.fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'query GetMediaList { MediaListCollection(userName: "MatiX", type: ANIME) { lists { name } } }',
          variables: { userName: 'MatiX', type: 'ANIME' }
        })
      });

      await flushAsync();
      expect(mockNativeFetch).toHaveBeenCalledTimes(1);

      await window.fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'query GetMediaList { MediaListCollection(userId: 9999, type: ANIME) { lists { name } } }',
          variables: { userId: 9999, type: 'ANIME' }
        })
      });

      expect(mockNativeFetch).toHaveBeenCalledTimes(1);
      expect((window as any).__ALFL_STATS__.cacheHits).toBe(1);
    });
  });

  describe('Concurrent Request Deduplication (In-Flight Coalescing)', () => {
    it('coalesces multiple concurrent identical requests into a single network call', async () => {
      let resolveFetch!: (res: Response) => void;
      const pendingPromise = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
      mockNativeFetch.mockReturnValue(pendingPromise);

      const requestBody = JSON.stringify({
        query: 'query InflightTest { Viewer { id name } }'
      });

      const req1 = window.fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
      });
      const req2 = window.fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
      });
      const req3 = window.fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
      });

      await flushAsync();
      expect(mockNativeFetch).toHaveBeenCalledTimes(1);

      resolveFetch(createJsonResponse({ data: { Viewer: { id: 100, name: 'Tester' } } }));

      const [res1, res2, res3] = await Promise.all([req1, req2, req3]);
      const [d1, d2, d3] = await Promise.all([res1.json(), res2.json(), res3.json()]);

      expect(d1).toEqual(d2);
      expect(d2).toEqual(d3);
      expect((window as any).__ALFL_STATS__.deduped).toBe(2);
    });
  });

  describe('Cache Invalidation & Epoch Bumping', () => {
    it('clears cache and increments epoch upon executing a GraphQL mutation', async () => {
      const queryData = { data: { Media: { id: 50 } } };
      mockNativeFetch
        .mockResolvedValueOnce(createJsonResponse(queryData))
        .mockResolvedValueOnce(createJsonResponse({ data: { SaveMediaListEntry: { id: 1 } } }))
        .mockResolvedValueOnce(createJsonResponse(queryData));

      const queryBody = JSON.stringify({ query: 'query GetMedia { Media(id: 50) { id } }' });

      await window.fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: queryBody
      });
      await flushAsync();
      expect(mockNativeFetch).toHaveBeenCalledTimes(1);

      await window.fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'mutation UpdateListEntry($id: Int) { SaveMediaListEntry(id: $id) { id } }',
          variables: { id: 50 }
        })
      });
      await flushAsync();
      expect(mockNativeFetch).toHaveBeenCalledTimes(2);

      await window.fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: queryBody
      });
      await flushAsync();
      expect(mockNativeFetch).toHaveBeenCalledTimes(3);
    });

    it('invalidates cache when manually calling __ALFL_CLEAR__', async () => {
      const queryData = { data: { Page: { media: [{ id: 101 }] } } };
      mockNativeFetch
        .mockResolvedValueOnce(createJsonResponse(queryData))
        .mockResolvedValueOnce(createJsonResponse(queryData));

      const queryBody = JSON.stringify({ query: 'query MediaCatalog { Page { media { id } } }' });

      await window.fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: queryBody
      });
      await flushAsync();
      expect(mockNativeFetch).toHaveBeenCalledTimes(1);

      await new Promise((r) => setTimeout(r, 15));

      (window as any).__ALFL_CLEAR__();

      await window.fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: queryBody
      });
      await flushAsync();
      expect(mockNativeFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling, Volatile Queries & Stale Fallback', () => {
    it('never caches volatile queries such as notifications or activities', async () => {
      mockNativeFetch
        .mockResolvedValueOnce(createJsonResponse({ data: { Activity: { id: 1 } } }))
        .mockResolvedValueOnce(createJsonResponse({ data: { Activity: { id: 1 } } }));

      const volatileBody = JSON.stringify({
        query: 'query GetActivities { Activity(id: 1) { id type } }'
      });

      await window.fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: volatileBody
      });
      await flushAsync();

      await window.fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: volatileBody
      });
      await flushAsync();

      expect(mockNativeFetch).toHaveBeenCalledTimes(2);
      expect((window as any).__ALFL_STATS__.cacheHits).toBe(0);
    });

    it('rejects caching responses containing GraphQL syntax or runtime errors', async () => {
      const errorResponse = { errors: [{ message: 'Field does not exist', status: 400 }] };
      mockNativeFetch
        .mockResolvedValueOnce(createJsonResponse(errorResponse, 200))
        .mockResolvedValueOnce(createJsonResponse({ data: { Media: { id: 1 } } }, 200));

      const queryBody = JSON.stringify({ query: 'query ErrorQuery { NonExistentField }' });

      await window.fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: queryBody
      });
      await flushAsync();

      await window.fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: queryBody
      });
      await flushAsync();

      expect(mockNativeFetch).toHaveBeenCalledTimes(2);
      expect((window as any).__ALFL_STATS__.cacheHits).toBe(0);
    });

    it('serves stale cached snapshot when network fetch encounters an HTTP 500 error', async () => {
      vi.useFakeTimers();
      const initialData = { data: { Media: { id: 99, title: { romaji: 'Steins;Gate' } } } };

      mockNativeFetch.mockResolvedValueOnce(createJsonResponse(initialData));

      const queryBody = JSON.stringify({ query: 'query StaleTest { Media(id: 99) { id title { romaji } } }' });
      const res1 = await window.fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: queryBody
      });
      expect(await res1.json()).toEqual(initialData);

      await vi.advanceTimersByTimeAsync(20_000);

      mockNativeFetch.mockResolvedValueOnce(createJsonResponse({ error: 'Server down' }, 500, 'Internal Server Error'));

      const res2 = await window.fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: queryBody
      });

      const data2 = await res2.json();
      expect(data2).toEqual(initialData);
      expect((window as any).__ALFL_STATS__.staleServed).toBe(1);

      vi.useRealTimers();
    });
  });
});