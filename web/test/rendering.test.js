import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = join(import.meta.dirname, '..');

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

const sources = files(join(WEB, 'src')).filter((file) => /\.(jsx?|css)$/.test(file));

/**
 * Security invariant 8: AI output and email text are plain text, nothing is rendered as HTML
 * and nothing loads from the network at runtime (CSP `img-src 'self' data:`).
 */
describe('rendering stays plain and local', () => {
  it('never renders HTML strings or frames', () => {
    const offenders = sources.filter((file) =>
      /dangerouslySetInnerHTML|<iframe|srcDoc|innerHTML\s*=/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('references no remote images, scripts, styles or fonts', () => {
    const offenders = [];
    for (const file of [...sources, join(WEB, 'index.html')]) {
      const text = readFileSync(file, 'utf8');
      if (/(src|href|url\()\s*[=(]?\s*["']?https?:\/\//.test(text)) {
        // Outbound links are fine (`href` to the Console, Google); loading is not.
        const loads = text.match(/(src=|url\()\s*["']?https?:\/\/[^"')\s]+/g) ?? [];
        if (loads.length > 0) offenders.push(`${file}: ${loads.join(', ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
