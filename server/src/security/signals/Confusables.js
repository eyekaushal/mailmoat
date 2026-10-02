import confusables from './data/confusables.json' with { type: 'json' };

/**
 * Unicode TR39 "skeleton": two strings that look alike map to the same skeleton
 * (`раypal` with Cyrillic letters, `paypaI` with a capital i, and `paypal` all become `paypal`).
 * TR39 is case-sensitive (`m` → `rn` but `M` is untouched, `0` → `O`), so the text is mapped,
 * lower-cased and mapped again: `Microsoft`, `rnicrosoft` and `acme-c0rp`/`acme-corp` then agree.
 */
export class Confusables {
  #prototypes = new Map(Object.entries(confusables.map));

  /**
   * @param {string} text
   * @returns {string}
   */
  skeleton(text) {
    return this.#map(this.#map(text).toLowerCase()).toLowerCase();
  }

  #map(text) {
    let mapped = '';
    for (const char of text.normalize('NFD')) mapped += this.#prototypes.get(char) ?? char;
    return mapped.normalize('NFD');
  }
}
