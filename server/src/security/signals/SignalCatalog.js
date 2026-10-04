import { BrandList } from './BrandList.js';
import { Confusables } from './Confusables.js';
import { DomainSimilarity } from './DomainSimilarity.js';
import { AuthFormInHtmlSignal } from './content/AuthFormInHtmlSignal.js';
import { BrandClaimUnownedSignal } from './sender/BrandClaimUnownedSignal.js';
import { BankDetailsInBodySignal } from './content/BankDetailsInBodySignal.js';
import { HiddenTextInstructionsSignal } from './content/HiddenTextInstructionsSignal.js';
import { HiddenTextPresentSignal } from './content/HiddenTextPresentSignal.js';
import { LinkFirstSeenDomainSignal } from './content/LinkFirstSeenDomainSignal.js';
import { LinkIpLiteralSignal } from './content/LinkIpLiteralSignal.js';
import { LinkShortenerSignal } from './content/LinkShortenerSignal.js';
import { LinkTextHrefMismatchSignal } from './content/LinkTextHrefMismatchSignal.js';
import { LinkUserinfoTrickSignal } from './content/LinkUserinfoTrickSignal.js';
import { RiskyAttachmentSignal } from './content/RiskyAttachmentSignal.js';
import { DisplayNameImpersonationSignal } from './sender/DisplayNameImpersonationSignal.js';
import { DkimDomainMismatchSignal } from './sender/DkimDomainMismatchSignal.js';
import { DmarcFailSignal } from './sender/DmarcFailSignal.js';
import { SpfDkimFailSignal } from './sender/SpfDkimFailSignal.js';
import { FirstTimeDomainSignal } from './sender/FirstTimeDomainSignal.js';
import { FirstTimeSenderSignal } from './sender/FirstTimeSenderSignal.js';
import { FreemailClaimsOrgSignal } from './sender/FreemailClaimsOrgSignal.js';
import { LookalikeBrandDomainSignal } from './sender/LookalikeBrandDomainSignal.js';
import { LookalikeContactDomainSignal } from './sender/LookalikeContactDomainSignal.js';
import { PunycodeDomainSignal } from './sender/PunycodeDomainSignal.js';
import { ReplyToMismatchSignal } from './sender/ReplyToMismatchSignal.js';

/**
 * The complete set of signals S1–S22, built once. The app, dev scripts and the attack lab all use
 * this, so none of them can silently run with a signal missing.
 */
export class SignalCatalog {
  /** @returns {import('./Signal.js').Signal[]} */
  create() {
    const confusables = new Confusables();
    const similarity = new DomainSimilarity(confusables);
    const brands = new BrandList(confusables);
    return [
      new DmarcFailSignal(),
      new SpfDkimFailSignal(),
      new DkimDomainMismatchSignal(),
      new ReplyToMismatchSignal(),
      new LookalikeContactDomainSignal(similarity),
      new LookalikeBrandDomainSignal(similarity, brands),
      new DisplayNameImpersonationSignal(brands, confusables),
      new PunycodeDomainSignal(),
      new FirstTimeSenderSignal(brands),
      new FirstTimeDomainSignal(brands),
      new FreemailClaimsOrgSignal(),
      new HiddenTextPresentSignal(),
      new HiddenTextInstructionsSignal(),
      new LinkTextHrefMismatchSignal(brands),
      new LinkShortenerSignal(),
      new LinkIpLiteralSignal(),
      new LinkUserinfoTrickSignal(),
      new LinkFirstSeenDomainSignal(brands),
      new RiskyAttachmentSignal(),
      new AuthFormInHtmlSignal(),
      new BankDetailsInBodySignal(),
      new BrandClaimUnownedSignal(brands),
    ];
  }
}
