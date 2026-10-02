import { domainToUnicode } from 'node:url';
import { OrgDomain } from './OrgDomain.js';

// Allowed edits by length of the shorter domain. Short domains collide with real, unrelated
// companies (ups.com / ubs.com), so below 8 characters only identical-looking text counts.
const ONE_EDIT_CHARS = 8;
const TWO_EDIT_CHARS = 10;

/** Decides whether one domain is made to look like another (typos, swaps, homoglyphs). */
export class DomainSimilarity {
  #confusables;

  /** @param {import('./Confusables.js').Confusables} confusables */
  constructor(confusables) {
    this.#confusables = confusables;
  }

  /**
   * True when `candidate` imitates `genuine` without being the same organisation.
   * @param {string} candidate e.g. the From domain
   * @param {string} genuine a domain the user or a brand really uses
   * @returns {boolean}
   */
  isLookalike(candidate, genuine) {
    const first = this.#readable(OrgDomain.of(candidate));
    const second = this.#readable(OrgDomain.of(genuine));
    if (first === second) return false;
    if (this.sameSkeleton(first, second)) return true;
    const shorter = Math.min(first.length, second.length);
    const limit = shorter >= TWO_EDIT_CHARS ? 2 : shorter >= ONE_EDIT_CHARS ? 1 : 0;
    return limit > 0 && this.distance(first, second) <= limit;
  }

  /** @returns {boolean} */
  sameSkeleton(first, second) {
    return this.#confusables.skeleton(first) === this.#confusables.skeleton(second);
  }

  /**
   * Optimal string alignment distance: Levenshtein plus adjacent swaps (`acme-copr`) as one edit.
   * @returns {number}
   */
  distance(first, second) {
    const a = [...first];
    const b = [...second];
    const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j += 1) rows[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
        }
      }
    }
    return rows[a.length][b.length];
  }

  /** Punycode labels are compared in their displayed (Unicode) form, which is what users see. */
  #readable(domain) {
    return domainToUnicode(domain) || domain;
  }
}
