/**
 * Updates contact history and sender statistics from each stored email.
 */
export class ContactHistoryBuilder {
  #contacts;
  #senders;
  #userEmail;

  /**
   * @param {import('../db/repositories/ContactRepository.js').ContactRepository} contacts
   * @param {import('../db/repositories/SenderRepository.js').SenderRepository} senders
   * @param {() => string | undefined} userEmail the connected account's address
   */
  constructor(contacts, senders, userEmail) {
    this.#contacts = contacts;
    this.#senders = senders;
    this.#userEmail = userEmail;
  }

  /** @param {import('./EmailMetadataMapper.js').EmailRecord} record */
  record(record) {
    const at = new Date(record.date);
    const self = this.#userEmail()?.toLowerCase();

    if (record.direction === 'outbound') {
      for (const address of new Set(record.toAddrs)) {
        // Names come only from the user's own sent mail, so an attacker cannot set them.
        if (address !== self)
          this.#contacts.recordSent(address, at, record.recipientNames[address]);
      }
      return;
    }
    if (!record.fromAddr || record.fromAddr === self) return;
    this.#contacts.recordReceived(record.fromAddr, at);
    this.#senders.recordReceived(record.fromAddr, { at, isRead: record.isRead });
  }
}
