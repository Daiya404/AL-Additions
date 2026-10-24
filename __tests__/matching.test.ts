import { describe, it, expect } from 'vitest';
import {
  normTitle,
  strictTitle,
  titleScore,
  bestMatch
} from '../src/utils/matching';

describe('Matching: normTitle', () => {
  it('handles null, undefined, and empty string inputs', () => {
    expect(normTitle(null)).toBe('');
    expect(normTitle(undefined)).toBe('');
    expect(normTitle('')).toBe('');
    expect(normTitle('   ')).toBe('');
  });

  it('normalizes punctuation, semicolons, slashes, dashes, and casing', () => {
    expect(normTitle('Steins;Gate 0')).toBe('steins gate 0');
    expect(normTitle('Fate/stay night [Unlimited Blade Works]!')).toBe('fate stay night unlimited blade works');
    expect(normTitle('“Kaguya-sama”, (Love is War)...')).toBe('kaguya sama love is war');
    expect(normTitle('Re:Zero kara Hajimeru Isekai Seikatsu')).toBe('re zero kara hajimeru isekai seikatsu');
    expect(normTitle('Hello_World?')).toBe('hello world');
  });

  it('strips English standalone articles (the, a, an)', () => {
    expect(normTitle('The Melancholy of Haruhi Suzumiya')).toBe('melancholy of haruhi suzumiya');
    expect(normTitle('A Silent Voice')).toBe('silent voice');
    expect(normTitle('An Another Story')).toBe('another story');
    expect(normTitle('Another')).toBe('another');
    expect(normTitle('Theater')).toBe('theater');
  });

  it('normalizes internal and surrounding whitespace', () => {
    expect(normTitle('   Attack    on    Titan   ')).toBe('attack on titan');
  });
});

describe('Matching: strictTitle', () => {
  it('handles null, undefined, and empty string inputs', () => {
    expect(strictTitle(null)).toBe('');
    expect(strictTitle(undefined)).toBe('');
    expect(strictTitle('')).toBe('');
  });

  it('strips quotes without inserting spaces', () => {
    expect(strictTitle("JoJo's Bizarre Adventure")).toBe('jojos bizarre adventure');
    expect(strictTitle('Shingeki no Kyojin ‘Final’')).toBe('shingeki no kyojin final');
  });

  it('preserves unicode letters and numbers with NFKC normalization', () => {
    expect(strictTitle('ＳＰＹ×ＦＡＭＩＬＹ')).toBe('spy family');
    expect(strictTitle('Mob Psycho 100 Ⅱ')).toBe('mob psycho 100 ii');
    expect(strictTitle('進撃の巨人')).toBe('進撃の巨人');
    expect(strictTitle('Sousou no Frieren: 2nd Season')).toBe('sousou no frieren 2nd season');
  });

  it('strips symbols, slashes, and semicolons to single spaces', () => {
    expect(strictTitle('Steins;Gate 0')).toBe('steins gate 0');
    expect(strictTitle('Fate/stay night [Unlimited Blade Works]')).toBe('fate stay night unlimited blade works');
    expect(strictTitle('Code Geass: Lelouch of the Rebellion R2 (TV)')).toBe(
      'code geass lelouch of the rebellion r2 tv'
    );
  });
});

describe('Matching: titleScore', () => {
  it('returns 0 when either or both titles are empty or missing', () => {
    expect(titleScore(null, 'Frieren')).toBe(0);
    expect(titleScore('Frieren', undefined)).toBe(0);
    expect(titleScore('', '')).toBe(0);
  });

  it('returns 100 for exact matches under normTitle', () => {
    expect(titleScore('Bocchi the Rock!', 'bocchi the rock')).toBe(100);
    expect(titleScore('Steins;Gate', 'Steins Gate')).toBe(100);
    expect(titleScore('The Dangers in My Heart', 'Dangers in My Heart')).toBe(100);
  });

  it('scores whole-word substring containment proportionally', () => {
    const scoreA = titleScore('Frieren', "Frieren: Beyond Journey's End");
    expect(scoreA).toBeGreaterThanOrEqual(60);
    expect(scoreA).toBeLessThanOrEqual(95);

    const scoreB = titleScore('Chainsaw Man', 'Chainsaw Man Part 2');
    expect(scoreB).toBeGreaterThan(scoreA);
  });

  it('scores word set token overlaps using Jaccard index', () => {
    const score = titleScore('My Hero Academia Movie', 'Boku no Hero Academia');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('returns 0 for completely unrelated titles', () => {
    expect(titleScore('Death Note', 'Bleach')).toBe(0);
    expect(titleScore('Naruto', 'One Piece')).toBe(0);
  });
});

describe('Matching: bestMatch', () => {
  interface AnimeEntry {
    id: number;
    title: string;
  }

  const catalog: AnimeEntry[] = [
    { id: 1, title: 'Bocchi the Rock!' },
    { id: 2, title: 'K-On!' },
    { id: 3, title: 'Chainsaw Man' },
    { id: 4, title: 'Chainsaw Man: Reze Arc' }
  ];

  it('returns the best matching item above threshold', () => {
    const match = bestMatch(catalog, 'bocchi the rock', (item) => item.title);
    expect(match).not.toBeNull();
    expect(match?.id).toBe(1);
  });

  it('correctly prefers specific sequel/arc titles over the generic parent show', () => {
    const match = bestMatch(catalog, 'Chainsaw Man: Reze', (item) => item.title, 50);
    expect(match?.id).toBe(4);
  });

  it('returns null if no item achieves the minimum required score', () => {
    const match = bestMatch(catalog, 'Attack on Titan', (item) => item.title, 70);
    expect(match).toBeNull();
  });

  it('returns null when querying an empty array', () => {
    const match = bestMatch([], 'Any Title', (item: AnimeEntry) => item.title);
    expect(match).toBeNull();
  });
});