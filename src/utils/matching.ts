export const normTitle = (s: string | null | undefined): string =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[’‘'`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const strictTitle = (s: string | null | undefined): string =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[’‘'`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');

export function titleScore(a: string | null | undefined, b: string | null | undefined): number {
  const x = normTitle(a);
  const y = normTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 100;

  const wordsA = x.split(' ').filter(Boolean);
  const wordsB = y.split(' ').filter(Boolean);
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);

  let common = 0;
  for (const w of setA) {
    if (setB.has(w)) common++;
  }

  const totalUnique = new Set([...wordsA, ...wordsB]).size;
  const wordScore = totalUnique > 0 ? (common / totalUnique) * 100 : 0;

  const strA = ` ${x} `;
  const strB = ` ${y} `;
  const isWordSubstring = strA.includes(strB) || strB.includes(strA);

  if (isWordSubstring) {
    const lenRatio = Math.min(x.length, y.length) / Math.max(x.length, y.length);
    const subScore = Math.round(60 + lenRatio * 35);
    return Math.max(Math.round(wordScore), subScore);
  }

  return Math.round(wordScore);
}

export function bestMatch<T>(
  list: T[],
  title: string,
  getTitle: (item: T) => string | null | undefined,
  min = 70
): T | null {
  let best: T | null = null;
  let bestScore = -1;

  for (const item of list) {
    const s = titleScore(title, getTitle(item));
    if (s > bestScore) {
      best = item;
      bestScore = s;
    }
  }
  return best && bestScore >= min ? best : null;
}