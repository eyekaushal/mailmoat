import { BIDI_CONTROL_CHARS, ZERO_WIDTH_CHARS } from '../../ingest/TextNormalizer.js';
import { Signal } from '../Signal.js';

const RISKY_EXTENSIONS = new Map([
  ...['html', 'htm', 'shtml', 'xhtml', 'svg'].map((ext) => [ext, 'can open a fake login page']),
  ...['iso', 'img', 'vhd', 'vhdx'].map((ext) => [
    ext,
    'is a disk image often used to deliver malware',
  ]),
  ...[
    'lnk',
    'js',
    'jse',
    'vbs',
    'vbe',
    'wsf',
    'hta',
    'exe',
    'scr',
    'bat',
    'cmd',
    'ps1',
    'msi',
    'jar',
    'one',
  ].map((ext) => [ext, 'can run code on your computer']),
  ...['docm', 'dotm', 'xlsm', 'xltm', 'xlam', 'pptm', 'potm', 'ppam'].map((ext) => [
    ext,
    'is an Office file with macros',
  ]),
  // Encryption inside these formats cannot be checked cheaply, so they are treated as if it were present.
  ...['rar', '7z'].map((ext) => [ext, 'is an archive that can hide its contents from scanners']),
]);

/** S19: attachments of types that phishing and malware rely on. */
export class RiskyAttachmentSignal extends Signal {
  constructor() {
    super({ id: 'S19', name: 'RISKY_ATTACHMENT', severity: 'medium' });
  }

  evaluate(email) {
    for (const attachment of email.attachments) {
      // A direction override (U+202E) can make `invoice<RLO>fdp.exe` display as `invoiceexe.pdf`;
      // the real extension is the last one in the stored name.
      const name = (attachment.filename ?? '')
        .replace(BIDI_CONTROL_CHARS, '')
        .replace(ZERO_WIDTH_CHARS, '')
        .slice(-80);
      const extension = /\.([a-z0-9]+)\s*$/i.exec(name)?.[1].toLowerCase();
      const danger = RISKY_EXTENSIONS.get(extension);
      if (danger) return this.fire(`The attachment ${name} ${danger}.`);
      if (attachment.encrypted) {
        return this.fire(
          `The attachment ${name} is a password-protected archive, which hides it from scanners.`,
        );
      }
      if (!extension && attachment.mimeType === 'text/html' && !attachment.inline) {
        return this.fire('An attachment is a web page that can open a fake login page.');
      }
    }
    return null;
  }
}
