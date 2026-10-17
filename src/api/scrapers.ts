import { gm, tryOr, memo, clean } from '../utils/helpers';
import { normTitle, bestMatch } from '../utils/matching';

export function parseLatest(value: unknown): number | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || /^(n\/a|unknown|none)$/i.test(s)) return null;
  const nums = [...s.matchAll(/(?:^|[^\d])(?:v\d+[ ._-]*)?c?\s*(\d+(?:\.\d+)?)/gi)]
    .map((m) => Number(m[1]))
    .filter(Number.isFinite);
  if (nums.length) return Math.max(...nums);
  return Number(s.replace(/,/g, '').match(/\d+(?:\.\d+)?/)?.[0]) || null;
}

export async function mangaUpdates(title: string): Promise<number | null> {
  const search = await gm.json('https://api.mangaupdates.com/v1/series/search', {
    method: 'POST',
    anonymous: true,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    data: JSON.stringify({ search: title, stype: 'title', perpage: 8 })
  });

  const best = bestMatch(
    Array.isArray(search?.results) ? search.results : [],
    title,
    (r: any) => r?.hit_title || r?.record?.title
  );
  if (!best) return null;

  const rec = best.record || {};
  let latest = parseLatest(rec.latest_chapter);
  const id = rec.series_id || rec.id || rec.seriesId || String(rec.url || '').match(/\/series\/(\d+)/)?.[1];

  if (latest == null && id) {
    latest = await tryOr(async () => {
      const d = await gm.json(`https://api.mangaupdates.com/v1/series/${encodeURIComponent(id)}`, {
        anonymous: true,
        headers: { Accept: 'application/json' }
      });
      return parseLatest(d?.latest_chapter ?? d?.record?.latest_chapter);
    });
  }

  if (latest == null && rec.url) {
    latest = await tryOr(async () => {
      const m = (await gm.text(rec.url, { anonymous: true })).match(
        /Latest\s+Chapter[\s\S]{0,500}?\b(?:c\s*)?(\d+(?:\.\d+)?)/i
      );
      return m ? Number(m[1]) : null;
    });
  }

  return latest == null ? null : Math.floor(latest);
}

export async function novelUpdates(title: string): Promise<number | null> {
  const html = await gm.text(`https://www.novelupdates.com/?s=${encodeURIComponent(title)}&post_type=series`, {
    anonymous: true
  });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const seen = new Set<string>();
  const cands: Array<{ href: string; text: string }> = [];

  for (const a of doc.querySelectorAll('a[href*="/series/"]')) {
    const href = new URL(a.getAttribute('href') || '', 'https://www.novelupdates.com/').href;
    const text = clean(a.textContent);
    if (text && !seen.has(href)) {
      seen.add(href);
      cands.push({ href, text });
    }
  }

  const best = bestMatch(cands, title, (c) => c.text);
  if (!best) return null;

  const body = new DOMParser().parseFromString(await gm.text(best.href, { anonymous: true }), 'text/html').body?.textContent || '';
  let latest: number | null = null;
  const at = body.search(/Latest\s+Release/i);
  if (at >= 0) {
    const hits = [...body.slice(at, at + 5000).matchAll(/(?:^|\s)(?:v\d+[ ._-]*)?c\s*(\d+(?:\.\d+)?)/gi)]
      .slice(0, 30)
      .map((m) => Number(m[1]))
      .filter(Number.isFinite);
    if (hits.length) latest = Math.max(...hits);
  }

  if (latest == null) {
    const m = body.slice(0, 12000).match(/(?:Status in COO|Chapters)[\s\S]{0,500}?\b(\d+(?:\.\d+)?)\s+Chapters?/i);
    if (m) latest = Number(m[1]);
  }

  return latest != null && Number.isFinite(latest) ? Math.floor(latest) : null;
}

const lookup = memo((kind: string, title: string) => (kind === 'NU' ? novelUpdates(title) : mangaUpdates(title)), {
  ttl: 30 * 60e3
});

export async function externalReleased(info: any): Promise<number | null> {
  const kind = info?.format === 'NOVEL' ? 'NU' : 'MU';
  const titles = [
    ...new Set([info?.title?.userPreferred, info?.title?.romaji, info?.title?.english].filter(Boolean))
  ];
  for (const t of titles) {
    const n = await tryOr(() => lookup(`${kind}:${normTitle(t)}`, kind, t));
    if (n != null) return n;
  }
  return null;
}