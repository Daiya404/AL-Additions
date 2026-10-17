export const normTitle = (s: string | null | undefined): string =>
  String(s || '')
    .toLowerCase()
    .replace(/[[\](){},.:!?_"'’“”]/g, ' ')
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
  if (x.includes(y) || y.includes(x)) return 85;

  const setA = new Set(x.split(' '));
  const setB = new Set(y.split(' '));
  let common = 0;
  for (const w of setA) {
    if (setB.has(w)) common++;
  }
  return Math.round((common / Math.max(setA.size, setB.size)) * 70);
}

export function bestMatch<T>(
  list: T[],
  title: string,
  getTitle: (item: T) => string | null | undefined,
  min = 45
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