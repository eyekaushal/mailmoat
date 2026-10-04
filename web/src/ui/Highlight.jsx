const NOISE = new Set(['and', 'or', 'not']);

/**
 * The words of a Gmail query worth highlighting in the results: operators (`from:x`,
 * `is:unread`), quotes, one-letter tokens and boolean words are dropped. Longest first, so a
 * longer term wins over a shorter one it contains.
 * @param {string} query
 * @returns {string[]}
 */
export function termsOf(query) {
  const terms = new Set();
  for (const raw of String(query ?? '').split(/\s+/)) {
    if (!raw || raw.includes(':')) continue;
    const word = raw.replace(/^["'(-]+|["')]+$/g, '').toLowerCase();
    if (word.length >= 2 && !NOISE.has(word)) terms.add(word);
  }
  return [...terms].sort((a, b) => b.length - a.length);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Plain text with every case-insensitive occurrence of a term wrapped in `<mark>`.
 * @param {{ text: string | null | undefined, terms?: string[] }} props
 */
export function Highlight({ text, terms }) {
  const value = String(text ?? '');
  if (!terms?.length || !value) return value;
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  return value.split(pattern).map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index} className="rounded-[3px] bg-tag-reply px-px text-inherit">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
