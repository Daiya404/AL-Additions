import { RateLimiter } from '../utils/limiter';
import { store, sleep, tryOr, memo, authError } from '../utils/helpers';
import { unsafeWindow } from 'vite-plugin-monkey/dist/client';

export interface ViewerInfo {
  id: number;
  name: string;
  scoreFormat: string;
}

export interface MediaEntry {
  id: number;
  idMal: number | null;
  format: string;
  title: {
    userPreferred?: string;
    english?: string;
    romaji?: string;
  };
  episodes: number | null;
  chapters: number | null;
  status: string;
  nextAiringEpisode?: {
    episode: number;
  };
  mediaListEntry?: {
    score: number;
    progress: number;
    status: string;
    completedAt?: {
      year?: number;
      month?: number;
      day?: number;
    };
  };
}

export const AniList = (() => {
  const API = 'https://graphql.anilist.co';
  const limiter = new RateLimiter({ rate: 25, max: 90, burst: 1, persistKey: 'ala_anilist_api_resume_at' });

  const header = (res: Response | undefined, name: string): string | null => {
    try {
      return res?.headers?.get?.(name) ?? null;
    } catch (_) {
      return null;
    }
  };

  function resetDelay(res: Response | undefined): number {
    const retry = Number(header(res, 'Retry-After'));
    if (retry > 0) return Math.min(retry * 1000, 120000);
    const reset = Number(header(res, 'X-RateLimit-Reset'));
    if (reset > 0) return Math.min((reset > 1e12 ? reset : reset * 1000) - Date.now(), 120000);
    return 0;
  }

  function handle(res: Response | undefined): void {
    const advertised = Number(header(res, 'X-RateLimit-Limit'));
    if (advertised > 0) limiter.setRate(Math.floor(advertised * 0.85));
    if (res?.status === 429) return limiter.limit(resetDelay(res) || 60000);
    const remaining = header(res, 'X-RateLimit-Remaining');
    if (remaining != null && Number(remaining) <= 1) limiter.limit(resetDelay(res));
  }

  async function query<T = any>(q: string, variables: Record<string, any> = {}, retries = 3): Promise<T> {
    const token = store.get<string | null>('al_token', null);
    const backoff = () => sleep(1500 * (4 - retries));
    let res: Response | undefined;
    try {
      await limiter.acquire();
      res = await fetch(API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ query: q, variables })
      });
    } catch (e: any) {
      if (retries > 0) {
        await backoff();
        return query<T>(q, variables, retries - 1);
      }
      throw new Error(`AniList network error: ${e?.message || e}`);
    }

    handle(res);
    if ((res.status === 429 || res.status >= 500) && retries > 0) {
      if (res.status >= 500) await backoff();
      return query<T>(q, variables, retries - 1);
    }

    let json: any = null;
    try {
      json = await res.json();
    } catch (_) {}

    const message = json?.errors?.length ? json.errors.map((e: any) => e.message).join('; ') : '';
    if (res.status === 401 || (token && /invalid token|unauthenticated|unauthorized/i.test(message))) {
      throw authError('AniList', 'AniList rejected the access token — reconnect AniList.');
    }
    if (message) throw new Error(message);
    if (!res.ok || !json) throw new Error(`AniList API HTTP ${res.status}`);
    return json.data as T;
  }

  async function viewer(): Promise<ViewerInfo | null> {
    const name = store.get<string | null>('al_username', null);
    const fmt = store.get<string | null>('al_score_format', null);
    const id = Number(store.get('al_user_id', 0));
    if (name && fmt && id) return { id, name, scoreFormat: fmt };
    if (!store.get('al_token', null)) return null;

    const d = await query<{ Viewer: { id: number; name: string; mediaListOptions: { scoreFormat: string } } }>(
      'query { Viewer { id name mediaListOptions { scoreFormat } } }',
      {}
    );
    store.set('al_user_id', d.Viewer.id);
    store.set('al_username', d.Viewer.name);
    store.set('al_score_format', d.Viewer.mediaListOptions.scoreFormat);
    return { id: d.Viewer.id, name: d.Viewer.name, scoreFormat: d.Viewer.mediaListOptions.scoreFormat };
  }

  const clearViewer = (): void => {
    store.del('al_username');
    store.del('al_user_id');
    store.del('al_score_format');
  };

  const resumeAt = (): number => limiter.resumeAt;

  return { query, viewer, clearViewer, resumeAt };
})();

export const MediaData = (() => {
  const fetchMedia = memo(
    async (id: number, type: 'ANIME' | 'MANGA'): Promise<MediaEntry | null> => {
      const data = await tryOr(() =>
        AniList.query<{ Media: MediaEntry }>(
          `query($id:Int,$type:MediaType){ Media(id:$id,type:$type){
            id idMal format title { userPreferred english romaji }
            episodes chapters status nextAiringEpisode { episode }
            mediaListEntry { score progress status completedAt { year month day } }
          } }`,
          { id, type }
        )
      );
      return data?.Media || null;
    },
    { keepNull: false, ttl: 60000 }
  );

  const get = (id: number | string, type: 'ANIME' | 'MANGA'): Promise<MediaEntry | null> =>
    fetchMedia(`${type}:${id}`, Number(id), type);

  async function save(
    id: number | string,
    type: 'ANIME' | 'MANGA',
    c: {
      score?: number;
      progress?: number;
      status?: string;
      completedAt?: { year: number; month: number; day: number };
    }
  ): Promise<any> {
    const data = await AniList.query(
      `mutation($mediaId:Int!,$score:Float,$progress:Int,$status:MediaListStatus,$completedAt:FuzzyDateInput){
        SaveMediaListEntry(mediaId:$mediaId,score:$score,progress:$progress,status:$status,completedAt:$completedAt){
          score progress status completedAt { year month day }
        } }`,
      { mediaId: Number(id), score: c.score, progress: c.progress, status: c.status, completedAt: c.completedAt }
    );
    const entry = data?.SaveMediaListEntry || null;
    const win = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window) as any;
    win.__ALFL_CLEAR__?.();
    const media = await get(id, type);
    if (media && entry) media.mediaListEntry = entry;
    return entry;
  }

  return { get, save };
})();