import { AuthResultsParser } from '../../src/security/ingest/AuthResultsParser.js';
import { EmailIngestor } from '../../src/security/ingest/EmailIngestor.js';
import { HiddenContentDetector } from '../../src/security/ingest/HiddenContentDetector.js';
import { LinkExtractor } from '../../src/security/ingest/LinkExtractor.js';
import { MimeParser } from '../../src/security/ingest/MimeParser.js';
import { TextNormalizer } from '../../src/security/ingest/TextNormalizer.js';

/** The real Layer 1 stack. */
export function realIngestor() {
  return new EmailIngestor({
    mimeParser: new MimeParser(),
    authResultsParser: new AuthResultsParser(),
    linkExtractor: new LinkExtractor(),
    hiddenContentDetector: new HiddenContentDetector(),
    textNormalizer: new TextNormalizer(),
  });
}

/**
 * Builds a raw RFC 822 message as Gmail would deliver it, with Google's Authentication-Results on top.
 * @param {{ from: string, replyTo?: string, subject: string, html?: string, text?: string, dmarc?: string, spf?: string, dkimDomain?: string }} mail
 */
export function rawEmail({
  from,
  replyTo,
  subject,
  html,
  text,
  dmarc = 'pass',
  spf = 'pass',
  dkimDomain,
}) {
  const fromDomain = /@([^>\s]+)/.exec(from)[1];
  const dkim = dmarc === 'pass' ? `dkim=pass header.i=@${dkimDomain ?? fromDomain}` : 'dkim=fail';
  const headers = [
    `Authentication-Results: mx.google.com; ${dkim}; spf=${spf} smtp.mailfrom=${fromDomain}; dmarc=${dmarc} header.from=${fromDomain}`,
    `From: ${from}`,
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    'To: kaushal@gmail.com',
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: ${html ? 'text/html' : 'text/plain'}; charset=utf-8`,
  ];
  return Buffer.from([...headers, '', html ?? text ?? '', ''].join('\r\n'));
}
