/** Builds an IngestedEmail with sensible "legitimate" defaults; override what a test needs. */
export function ingestedEmail(overrides = {}) {
  return {
    headers: [],
    from: { address: 'rahul@acme-corp.com', name: 'Rahul Mehta' },
    replyTo: [],
    to: [{ address: 'me@gmail.com', name: null }],
    cc: [],
    subject: 'Hello',
    messageId: '<1@acme-corp.com>',
    auth: {
      trusted: true,
      spf: { result: 'pass', mailFrom: 'rahul@acme-corp.com' },
      dkim: [{ result: 'pass', domain: 'acme-corp.com' }],
      dmarc: { result: 'pass', headerFrom: 'acme-corp.com' },
    },
    links: [],
    attachments: [],
    html: '',
    hidden: [],
    readerText: 'Hi',
    readerTextTruncated: false,
    bodyHash: 'hash',
    ...overrides,
  };
}

/**
 * In-memory stand-in for ContactRepository.
 * @param {Record<string, { sentCount?: number, receivedCount?: number, trusted?: boolean }>} known
 */
export function signalContext(known = {}, readerForm = null) {
  const contacts = Object.entries(known).map(([address, fields]) => ({
    address,
    domain: address.split('@').pop(),
    sentCount: 0,
    receivedCount: 0,
    trusted: false,
    ...fields,
  }));
  return {
    contacts: {
      get: (address) => contacts.find((contact) => contact.address === address.toLowerCase()),
      hasSentToDomain: (domain) =>
        contacts.some((contact) => contact.domain === domain && contact.sentCount > 0),
    },
    readerForm,
  };
}
