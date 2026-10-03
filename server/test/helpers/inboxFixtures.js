import { Verdict } from '../../src/security/risk/Verdict.js';
import { VALID_FORM } from '../../../shared/test/schemas/fixtures.js';

/**
 * Stores one email as sync + pipeline + rules would leave it: metadata, a verdict, the Reader
 * form and the rules that ran. Returns the stored record.
 */
export function storeEmail(
  { emails, verdicts, rules },
  gmailId,
  {
    fromAddr = 'rahul@acme-corp.com',
    fromName = null,
    direction = 'inbound',
    date = '2026-10-07T09:00:00.000Z',
    level = 'SAFE',
    score = 0,
    reasons = [],
    injectionAttempt = false,
    summary = 'A note.',
    category = 'work',
    isRead = false,
    ruleIds = [],
    form = true,
    at = new Date(date),
  } = {},
) {
  const record = {
    gmailId,
    threadId: `t-${gmailId}`,
    direction,
    fromAddr,
    fromDomain: fromAddr.split('@')[1],
    fromName,
    toAddrs: ['me@gmail.com'],
    recipientNames: {},
    date,
    subjectHash: null,
    hasListUnsubscribe: false,
    unsubscribeUrl: null,
    oneClick: false,
    labels: [],
    isRead,
  };
  emails.insertIfAbsent(record, { pending: false });
  verdicts.save({
    gmailId,
    at,
    bodyHash: 'h',
    auth: {
      trusted: true,
      spf: { result: 'pass' },
      dkim: [{ result: 'pass', domain: record.fromDomain }],
      dmarc: { result: 'pass' },
    },
    signals: level === 'SAFE' ? [] : [{ id: 'S1', severity: 'high', reason: 'DMARC failed' }],
    readerForm: form ? { ...VALID_FORM, meeting_request: null, summary, category } : null,
    readerModel: 'm',
    verdict:
      direction === 'inbound'
        ? new Verdict({
            level,
            score,
            reasons,
            floor: level,
            floorReasons: [],
            injectionAttempt,
            verifyByPhone: false,
          })
        : null,
  });
  for (const ruleId of ruleIds) {
    rules?.recordRun({ gmailId, ruleId, actionsTaken: ['label'], status: 'done', at });
  }
  return record;
}
