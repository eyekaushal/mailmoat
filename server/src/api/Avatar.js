/**
 * The initials-on-a-colour avatar the UI draws for a sender (DESIGN.md §2 Avatars): one or two
 * letters and a hue (0–359) that is a stable hash of the address, so one person always gets the
 * same colour. Computed here so every list route agrees and the browser never hashes.
 */
export class Avatar {
  /**
   * @param {{ name?: string | null, address: string }} who
   * @returns {{ initials: string, hue: number }}
   */
  static for({ name, address }) {
    const words = (name ?? '')
      .split(/\s+/)
      .map((word) => [...word].find((char) => /[\p{L}\p{N}]/u.test(char)))
      .filter(Boolean);
    const initials =
      words.length >= 2
        ? `${words[0]}${words.at(-1)}`
        : (words[0] ?? [...address].find((char) => /[\p{L}\p{N}]/u.test(char)) ?? '?');
    return { initials: initials.toUpperCase(), hue: Avatar.#hue(address.toLowerCase()) };
  }

  /** FNV-1a over the address, folded onto the colour wheel. */
  static #hue(address) {
    let hash = 0x811c9dc5;
    for (const char of address) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash % 360;
  }
}
