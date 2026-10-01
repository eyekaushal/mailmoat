import { OrgDomain } from '../OrgDomain.js';
import { Signal } from '../Signal.js';

// Roles and company words that a personal free-mail account has no business using.
const ORG_DISPLAY_NAME =
  /\b(ceo|cfo|coo|cto|president|director|founder|chairman|vp|vice president|head of|payroll|finance|accounts|billing|support|helpdesk|it department|hr|inc|ltd|llc|corp|gmbh|bank)\b/i;

const CLAIM_LABELS = {
  executive: 'an executive',
  colleague: 'a colleague',
  vendor: 'a vendor',
  bank: 'a bank',
  brand: 'a well-known brand',
  government: 'a government agency',
  it_support: 'IT support',
};

/**
 * S11: a free-mail address presents itself as a company or executive. Uses the display name
 * (deterministic) and, once available, the Reader's `claims_to_be`.
 */
export class FreemailClaimsOrgSignal extends Signal {
  constructor() {
    super({ id: 'S11', name: 'FREEMAIL_CLAIMS_ORG', severity: 'medium' });
  }

  evaluate(email, context) {
    if (!email.from) return null;
    const domain = OrgDomain.ofAddress(email.from.address);
    if (!OrgDomain.isFreemail(domain)) return null;

    const claim = context.readerForm?.claims_to_be;
    if (CLAIM_LABELS[claim]) {
      return this.fire(
        `The email presents itself as ${CLAIM_LABELS[claim]} but uses a free ${domain} address.`,
      );
    }
    if (email.from.name && ORG_DISPLAY_NAME.test(email.from.name)) {
      return this.fire(
        `The sender name suggests a company or role, but the address is a free ${domain} account.`,
      );
    }
    return null;
  }
}
