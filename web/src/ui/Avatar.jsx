const SIZES = {
  sm: 'size-6 text-xs',
  md: 'size-8 text-sm',
  lg: 'size-10 text-base',
};

/** A stable hue (0–359) for an address, so the same sender always gets the same colour. */
export function hueOf(text) {
  let hash = 0;
  for (const char of String(text ?? '').toLowerCase())
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

/** "Ada Lovelace" → "AL"; "ada@example.com" → "A". */
export function initialsOf(name) {
  const words = String(name ?? '')
    .replace(/[<>"']/g, '')
    .trim()
    .split(/\s+/)
    .filter((word) => word && !word.includes('@'));
  if (words.length === 0)
    return (
      String(name ?? '?')
        .trim()
        .charAt(0)
        .toUpperCase() || '?'
    );
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

/**
 * Initials on a soft colour, Gmail size and border; a photo when one is available (the user's
 * own account only). The colour comes from `hueKey` (usually the address) so it never changes.
 * @param {{ name: string, hueKey?: string, src?: string | null, size?: keyof typeof SIZES,
 *   className?: string }} props
 */
export function Avatar({ name, hueKey, src, size = 'md', className = '' }) {
  const hue = hueOf(hueKey ?? name);
  const base = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium shadow-[inset_0_0_0_1px_var(--line)] select-none ${SIZES[size]} ${className}`;
  if (src) return <img src={src} alt="" className={`${base} object-cover`} />;
  return (
    <span
      aria-hidden="true"
      className={base}
      style={{ background: `hsl(${hue} 55% 90%)`, color: `hsl(${hue} 45% 32%)` }}
    >
      {initialsOf(name)}
    </span>
  );
}
