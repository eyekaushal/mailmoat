import { Archive, ArrowBendUpLeft, UserCheck } from '@phosphor-icons/react';
import { shortDate } from '../../lib/dates.js';
import { Avatar } from '../../ui/Avatar.jsx';
import { Highlight } from '../../ui/Highlight.jsx';
import { IconButton } from '../../ui/IconButton.jsx';
import { Row } from '../../ui/Row.jsx';
import { Tag, labelFor } from '../../ui/Tag.jsx';
import { Tooltip } from '../../ui/Tooltip.jsx';

const RISK_WORDS = { SUSPICIOUS: 'Suspicious', DANGEROUS: 'Dangerous' };

/**
 * What the dot before the sender says. SAFE mail gets no dot and no word (PLAN §13.1 decision 4);
 * mail the pipeline has not judged yet is not safe either (invariant 6), so it gets a hollow one.
 * @param {{ level: string } | null | undefined} verdict
 * @returns {string | null}
 */
export function riskNote(verdict) {
  if (!verdict) return 'Not checked yet';
  return RISK_WORDS[verdict.level] ?? null;
}

/**
 * One inbox row (PLAN §13.5): unread dot · avatar · sender · one label · subject · snippet · time,
 * with archive / reply / trust on hover. Nothing AI-generated is shown here.
 * @param {{ email: object, terms?: string[], now?: Date, onOpen: () => void,
 *   onArchive: () => void, onReply: () => void, onTrust: () => void }} props
 */
export function EmailRow({ email, terms, now, onOpen, onArchive, onReply, onTrust }) {
  const label = labelFor(email.rules);
  const risk = riskNote(email.verdict);
  const sender = email.fromName || email.fromAddr;
  return (
    <Row
      onOpen={onOpen}
      trailing={
        <time dateTime={email.date} className="text-sm text-tertiary tabular-nums">
          {shortDate(email.date, now)}
        </time>
      }
      actions={
        <>
          <IconButton label="Archive" keys={['e']} icon={Archive} onClick={onArchive} />
          <IconButton label="Reply" keys={['r']} icon={ArrowBendUpLeft} onClick={onReply} />
          <IconButton label="Mark sender trusted" icon={UserCheck} onClick={onTrust} />
        </>
      }
    >
      <span className="flex w-2 shrink-0 justify-center">
        {!email.isRead && (
          <Tooltip label="Unread">
            <span role="img" aria-label="Unread" className="size-1.5 rounded-full bg-unread" />
          </Tooltip>
        )}
      </span>
      <Avatar
        name={sender}
        hueKey={email.fromAddr}
        initials={email.avatar?.initials}
        hue={email.avatar?.hue}
      />
      <span className="flex w-44 shrink-0 items-center gap-1.5">
        {risk && (
          <Tooltip label={risk}>
            <span
              role="img"
              aria-label={risk}
              className={`size-1.5 shrink-0 rounded-full ${
                email.verdict ? 'bg-danger' : 'border border-tertiary'
              }`}
            />
          </Tooltip>
        )}
        <span className={`truncate ${email.isRead ? '' : 'font-medium'}`}>
          <Highlight text={sender} terms={terms} />
        </span>
      </span>
      {label && <Tag label={label} />}
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">
          <Highlight text={email.subject || '(no subject)'} terms={terms} />
        </span>
        {email.snippet && (
          <span className="ml-2 text-secondary">
            <Highlight text={email.snippet} terms={terms} />
          </span>
        )}
      </span>
    </Row>
  );
}
