import { SECURITY_LABELS } from '@mailmoat/shared/constants/labels';

/**
 * Mail from a BLOCKED sender (PRD F9.4) is labelled `mailmoat/Blocked` and archived by code before
 * any analysis: it never reaches the Reader, the rules or the inbox.
 */
export class BlockedSenderFilter {
  #senders;
  #gmail;
  #auditLog;

  /**
   * @param {{
   *   senders: Pick<import('../db/repositories/SenderRepository.js').SenderRepository, 'get'>,
   *   gmail: Pick<import('../google/GmailClient.js').GmailClient, 'ensureLabel'|'modifyLabels'|'archive'>,
   *   auditLog: Pick<import('../audit/AuditLog.js').AuditLog, 'record'>,
   * }} deps
   */
  constructor({ senders, gmail, auditLog }) {
    this.#senders = senders;
    this.#gmail = gmail;
    this.#auditLog = auditLog;
  }

  /**
   * @param {import('../sync/EmailMetadataMapper.js').EmailRecord} record
   * @returns {Promise<boolean>} true if the email was handled here and needs no further processing
   */
  async handle(record) {
    if (record.direction !== 'inbound') return false;
    if (this.#senders.get(record.fromAddr)?.status !== 'BLOCKED') return false;
    const labelId = await this.#gmail.ensureLabel(SECURITY_LABELS.BLOCKED);
    await this.#gmail.modifyLabels(record.gmailId, { add: [labelId] });
    await this.#gmail.archive(record.gmailId);
    this.#auditLog.record({
      actor: 'system',
      event: 'blocked_sender_handled',
      subject: record.gmailId,
      decision: 'BLOCKED',
      data: { labels: [SECURITY_LABELS.BLOCKED], archived: true },
    });
    return true;
  }
}
