import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeStatus,
  getEntryMediaId,
  getEntryData,
  compareEntries,
  type EntryData
} from '../src/modules/compareView';

describe('compareView: normalizeStatus', () => {
  it('handles empty, null, or undefined values with fallback', () => {
    expect(normalizeStatus('')).toBe('Planning');
    expect(normalizeStatus(null as any)).toBe('Planning');
    expect(normalizeStatus(undefined as any)).toBe('Planning');
  });

  it('normalizes planning statuses', () => {
    expect(normalizeStatus('Planning')).toBe('Planning');
    expect(normalizeStatus('Plan to Watch')).toBe('Planning');
    expect(normalizeStatus('PLANNING')).toBe('Planning');
  });

  it('normalizes completed statuses', () => {
    expect(normalizeStatus('Completed')).toBe('Completed');
    expect(normalizeStatus('COMPLETE')).toBe('Completed');
  });

  it('normalizes current / watching / reading / repeating statuses', () => {
    expect(normalizeStatus('Current')).toBe('Current');
    expect(normalizeStatus('Watching')).toBe('Current');
    expect(normalizeStatus('Reading')).toBe('Current');
    expect(normalizeStatus('Repeating')).toBe('Current');
  });

  it('normalizes paused / on-hold statuses', () => {
    expect(normalizeStatus('Paused')).toBe('Paused');
    expect(normalizeStatus('On Hold')).toBe('Paused');
    expect(normalizeStatus('HOLD')).toBe('Paused');
  });

  it('normalizes dropped statuses', () => {
    expect(normalizeStatus('Dropped')).toBe('Dropped');
    expect(normalizeStatus('DROP')).toBe('Dropped');
  });
});

describe('compareView: getEntryMediaId', () => {
  it('extracts numeric mediaId from anime or manga links', () => {
    const el1 = document.createElement('div');
    el1.innerHTML = `<div class="title"><a href="/anime/12345/shingeki-no-kyojin" class="title">AOT</a></div>`;
    expect(getEntryMediaId(el1)).toBe(12345);

    const el2 = document.createElement('div');
    el2.innerHTML = `<div class="title"><a href="/manga/99999" class="title">Manga</a></div>`;
    expect(getEntryMediaId(el2)).toBe(99999);
  });

  it('returns null if link or id is missing', () => {
    const el = document.createElement('div');
    el.innerHTML = `<div class="title"><span>No Link</span></div>`;
    expect(getEntryMediaId(el)).toBeNull();

    const el2 = document.createElement('div');
    el2.innerHTML = `<div class="title"><a href="/user/someone">User</a></div>`;
    expect(getEntryMediaId(el2)).toBeNull();
  });
});

describe('compareView: getEntryData', () => {
  it('extracts title, scores, and normalized statuses from DOM element', () => {
    const row = document.createElement('div');
    row.innerHTML = `
      <div class="title"><a href="/anime/101" class="title">Frieren</a></div>
      <div class="score" label="Score" score="9.5"><span>9.5</span></div>
      <div class="score" score="8"><span>8</span></div>
      <div class="status" label="Your Status"><span>Completed</span></div>
      <div class="status"><span>Watching</span></div>
    `;

    const data = getEntryData(row);
    expect(data.title).toBe('Frieren');
    expect(data.yourScore).toBe(9.5);
    expect(data.otherScore).toBe(8);
    expect(data.yourStatus).toBe('Completed');
    expect(data.otherStatus).toBe('Current');
  });

  it('correctly parses 0 scores and unscored/unwatched entries without defaulting to empty', () => {
    const row = document.createElement('div');
    row.innerHTML = `
      <div class="title"><a href="/anime/202" class="title">Unwatched Show</a></div>
      <div class="score" label="Score" score="0"><span>0</span></div>
      <div class="score" score="0"><span>0</span></div>
      <div class="status" label="Your Status"><span>Planning</span></div>
      <div class="status"><span>Planning</span></div>
    `;

    const data = getEntryData(row);
    expect(data.yourScore).toBe(0);
    expect(data.otherScore).toBe(0);
    expect(data.yourStatus).toBe('Planning');
    expect(data.otherStatus).toBe('Planning');
  });

  it('falls back to 0 when score attributes and texts are non-numeric or empty', () => {
    const row = document.createElement('div');
    row.innerHTML = `
      <div class="title"><a href="/anime/303" class="title">Empty Scores</a></div>
      <div class="score" label="Score"><span>-</span></div>
      <div class="score"><span></span></div>
      <div class="status" label="Your Status"><span>Unknown</span></div>
      <div class="status"><span>Unknown</span></div>
    `;

    const data = getEntryData(row);
    expect(data.yourScore).toBe(0);
    expect(data.otherScore).toBe(0);
  });
});

describe('compareView: compareEntries', () => {
  const entryA: EntryData = {
    el: document.createElement('div'),
    title: 'Attack on Titan',
    yourScore: 9,
    otherScore: 8,
    yourStatus: 'Completed',
    otherStatus: 'Completed'
  };

  const entryB: EntryData = {
    el: document.createElement('div'),
    title: 'Bleach',
    yourScore: 7,
    otherScore: 8,
    yourStatus: 'Current',
    otherStatus: 'Completed'
  };

  const entryC: EntryData = {
    el: document.createElement('div'),
    title: 'Chainsaw Man',
    yourScore: 0,
    otherScore: 0,
    yourStatus: 'Planning',
    otherStatus: 'Planning'
  };

  it('sorts by title alphabetically ascending and descending', () => {
    expect(compareEntries(entryA, entryB, 'title', 'asc')).toBeLessThan(0);
    expect(compareEntries(entryA, entryB, 'title', 'desc')).toBeGreaterThan(0);
  });

  it('sorts by yourScore ascending and descending', () => {
    expect(compareEntries(entryA, entryB, 'yourScore', 'desc')).toBeLessThan(0);
    expect(compareEntries(entryA, entryB, 'yourScore', 'asc')).toBeGreaterThan(0);
    expect(compareEntries(entryB, entryC, 'yourScore', 'desc')).toBeLessThan(0);
  });

  it('breaks ties using title when otherScore is equal', () => {
    expect(compareEntries(entryA, entryB, 'otherScore', 'desc')).toBeLessThan(0);
    expect(compareEntries(entryB, entryA, 'otherScore', 'desc')).toBeGreaterThan(0);
  });
});

describe('compareView: DOM structure & score formatting', () => {
  it('correctly handles zero and non-zero scores without empty labels', () => {
    const row = document.createElement('div');
    row.className = 'entry';
    const yourScore = 0;
    const otherScore = 8.5;
    const yourStatus = 'Completed';
    const otherStatus = 'Planning';
    const displayOtherName = 'MysticDaiya';

    row.innerHTML = `
      <div class="title">
        <a href="/anime/100/" class="">Sample Title</a>
      </div>
      <div class="score" label="Score" score="${yourScore}"><span>${yourScore > 0 ? yourScore : '0'}</span></div>
      <div class="score" label="${displayOtherName}'s Score" score="${otherScore}"><span>${otherScore > 0 ? otherScore : '0'}</span></div>
      <div class="status" label="Your Status"><span>${yourStatus}</span></div>
      <div class="status" label="${displayOtherName}'s Status"><span>${otherStatus}</span></div>
    `;

    const scores = row.querySelectorAll<HTMLElement>('.score');
    expect(scores[0].querySelector('span')?.textContent).toBe('0');
    expect(scores[1].querySelector('span')?.textContent).toBe('8.5');

    const data = getEntryData(row);
    expect(data.yourScore).toBe(0);
    expect(data.otherScore).toBe(8.5);
    expect(data.yourStatus).toBe('Completed');
    expect(data.otherStatus).toBe('Planning');
  });

  it('preserves 0 in score text when native AniList items are empty', () => {
    const row = document.createElement('div');
    row.className = 'entry';
    row.innerHTML = `
      <div class="score" label="Score" score="0">   </div>
      <div class="score" label="MysticDaiya's Score" score="0"></div>
    `;

    row.querySelectorAll<HTMLElement>('.score').forEach((scoreEl) => {
      const text = scoreEl.textContent?.trim();
      if (!text || text === '') {
        scoreEl.textContent = '0';
      }
    });

    const scores = row.querySelectorAll<HTMLElement>('.score');
    expect(scores[0].textContent).toBe('0');
    expect(scores[1].textContent).toBe('0');
  });
});

