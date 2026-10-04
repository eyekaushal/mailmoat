import { Phone } from '@phosphor-icons/react';
import { riskMeta, toneClasses } from './RiskBadge.jsx';

const TOP_REASONS = 3;

/** Reader intents for which the user should verify by phone (SECURITY_APPROACH §7.7). */
const PHONE_INTENTS = ['asks_for_payment', 'asks_bank_detail_change', 'asks_for_credentials'];

const BORDER = { warn: 'border-warn/40', danger: 'border-danger/40', neutral: 'border-line' };

/**
 * The banner on every non-SAFE email: level, top reasons and the phone advice for money or
 * credential asks. Reasons may quote the email, so they are rendered as plain text only.
 * An email without a verdict is treated as SUSPICIOUS, like the Policy Engine does.
 * @param {{ verdict: { level: string, reasons: string[], injectionAttempt?: boolean,
 *   userFeedback?: string | null } | null, readerForm?: { intents?: Record<string, boolean> } | null }} props
 */
export function RiskBanner({ verdict, readerForm }) {
  if (verdict?.level === 'SAFE') return null;
  const level = verdict?.level ?? null;
  const { label, Icon, tone } = verdict ? riskMeta(level) : riskMeta('SUSPICIOUS');
  const reasons = verdict
    ? verdict.reasons.slice(0, TOP_REASONS)
    : ['Not analysed yet. Until the security check runs, this email is treated as suspicious.'];
  const verifyByPhone = PHONE_INTENTS.some((intent) => readerForm?.intents?.[intent]);

  return (
    <section
      role="alert"
      aria-label={`Risk: ${verdict ? label : 'Not analysed'}`}
      className={`rounded-lg border p-4 ${BORDER[tone] ?? BORDER.neutral} ${toneClasses(tone)}`}
    >
      <div className="flex items-center gap-2 font-semibold">
        <Icon aria-hidden="true" className="size-5" />
        <span>{verdict ? label : 'Not analysed'}</span>
        {verdict?.injectionAttempt && (
          <span className="ml-auto rounded-md bg-surface/70 px-2 py-0.5 text-xs font-medium">
            Tried to instruct the assistant
          </span>
        )}
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fg">
        {reasons.map((reason, index) => (
          <li key={index} className="break-words whitespace-pre-wrap">
            {reason}
          </li>
        ))}
      </ul>
      {verdict?.injectionAttempt && (
        <p className="mt-2 text-sm text-fg">
          This email contained instructions aimed at the AI assistant. None of them were followed.
        </p>
      )}
      {verifyByPhone && (
        <p className="mt-3 flex items-start gap-2 text-sm font-medium text-fg">
          <Phone aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          Verify by phone using a number you already have, not one from this email.
        </p>
      )}
      {verdict?.userFeedback === 'not_phishing' && (
        <p className="mt-2 text-xs text-muted">
          You marked this as not phishing. The level stays as a record of what was found.
        </p>
      )}
    </section>
  );
}
