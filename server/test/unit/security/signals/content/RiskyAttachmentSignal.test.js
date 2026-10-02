import { describe, expect, it } from 'vitest';
import { RiskyAttachmentSignal } from '../../../../../src/security/signals/content/RiskyAttachmentSignal.js';
import { ingestedEmail, signalContext } from '../fixtures.js';

const signal = new RiskyAttachmentSignal();
const attachment = (filename, extra = {}) => ({
  filename,
  mimeType: 'application/octet-stream',
  disposition: 'attachment',
  size: 100,
  inline: false,
  encrypted: false,
  ...extra,
});
const evaluate = (...attachments) =>
  signal.evaluate(ingestedEmail({ attachments }), signalContext());

describe('RiskyAttachmentSignal (S19)', () => {
  it.each([
    ['Invoice.html', 'can open a fake login page'],
    ['scan.SVG', 'can open a fake login page'],
    ['setup.iso', 'is a disk image often used to deliver malware'],
    ['report.pdf.exe', 'can run code on your computer'],
    ['shortcut.lnk', 'can run code on your computer'],
    ['budget.xlsm', 'is an Office file with macros'],
    ['files.rar', 'is an archive that can hide its contents from scanners'],
  ])('fires for %s', (filename, danger) => {
    expect(evaluate(attachment(filename))).toMatchObject({
      id: 'S19',
      reason: `The attachment ${filename} ${danger}.`,
    });
  });

  it('sees through a right-to-left override in the filename', () => {
    const name = `invoice${String.fromCodePoint(0x202e)}fdp.exe`;
    expect(evaluate(attachment(name))?.reason).toBe(
      'The attachment invoicefdp.exe can run code on your computer.',
    );
  });

  it('fires for a password-protected ZIP and an unnamed HTML attachment', () => {
    expect(evaluate(attachment('docs.zip', { encrypted: true }))?.reason).toMatch(
      /password-protected/,
    );
    expect(evaluate(attachment(null, { mimeType: 'text/html' }))?.reason).toMatch(/web page/);
  });

  it('does not fire for ordinary attachments', () => {
    expect(
      evaluate(
        attachment('report.pdf'),
        attachment('photo.jpg', { inline: true }),
        attachment('budget.xlsx'),
        attachment('docs.zip'),
        attachment(null, { mimeType: 'text/html', inline: true }),
      ),
    ).toBeNull();
  });
});
