import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '../../src');

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

/** PLAN §13.8: the risk badge and the audit table left the dashboard; nothing may bring them back. */
describe('removed components', () => {
  it.each(['components/RiskBadge.jsx', 'pages/security/AuditLogTable.jsx'])(
    '%s no longer exists',
    (path) => {
      expect(existsSync(join(SRC, path))).toBe(false);
    },
  );

  it('nothing imports RiskBadge or AuditLogTable', () => {
    const offenders = files(SRC).filter((file) =>
      /RiskBadge|AuditLogTable/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
