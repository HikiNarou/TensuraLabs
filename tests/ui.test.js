import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { paginationItems } from '../public/assets/js/core/pagination.js';

describe('paginationItems', () => {
  test('small totals render every page', () => {
    assert.deepEqual(paginationItems(1, 1), [1]);
    assert.deepEqual(paginationItems(2, 5), [1, 2, 3, 4, 5]);
  });

  test('collapses distant pages into gaps', () => {
    assert.deepEqual(paginationItems(6, 12), [1, null, 5, 6, 7, null, 12]);
    assert.deepEqual(paginationItems(1, 12), [1, 2, null, 12]);
    assert.deepEqual(paginationItems(12, 12), [1, null, 11, 12]);
  });

  test('never hides a single page behind a gap', () => {
    assert.deepEqual(paginationItems(4, 12), [1, 2, 3, 4, 5, null, 12]);
    assert.deepEqual(paginationItems(9, 12), [1, null, 8, 9, 10, 11, 12]);
  });

  test('items are unique, sorted and within range', () => {
    for (let total = 1; total <= 30; total += 1) {
      for (let page = 1; page <= total; page += 1) {
        const pages = paginationItems(page, total).filter((p) => p !== null);
        assert.deepEqual(pages, [...new Set(pages)].sort((a, b) => a - b));
        assert.ok(pages.includes(page) && pages[0] === 1 && pages.at(-1) === total);
      }
    }
  });
});
