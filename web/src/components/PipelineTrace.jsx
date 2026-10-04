import { Tag, riskLabelFor } from '../ui/Tag.jsx';

/** A quiet block per pipeline layer: a plain heading, no numbers, no capitals (DESIGN.md §8). */
function Section({ title, children }) {
  return (
    <section className="rounded-md bg-surface-2 px-4 py-3">
      <h3 className="text-sm font-medium text-secondary">{title}</h3>
      <div className="mt-2 text-base">{children}</div>
    </section>
  );
}

function Pairs({ entries }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="font-mono text-xs text-secondary">{key}</dt>
          <dd className="break-words">{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * How the pipeline reached its verdict for one email (PRD F4 Test tab, F5): authentication,
 * every signal with its reason, the Reader's typed form, the verdict, the rules that ran and the
 * audit events. Signal reasons and the Reader summary may quote the email: plain text only. The
 * verdict wears the same quiet tag as the opened email; severities and statuses are words.
 * @param {{ trace: {
 *   direction: string,
 *   auth: Record<string, unknown> | null,
 *   signals: { id: string, severity: string, reason: string }[],
 *   reader: { failed: boolean, form: Record<string, unknown> | null },
 *   verdict: { level: string, score: number, floor: string, reasons: string[] } | null,
 *   rules: { ruleId: string, actionsTaken: string[], status?: string }[],
 *   events: { id: number, ts: string, actor: string, event: string, decision?: string | null, reason?: string | null }[],
 * }, preview?: boolean }} props `preview` = the Test tab: rules that would run, nothing ran
 */
export function PipelineTrace({ trace, preview = false }) {
  const { auth, signals, reader, verdict, rules, events } = trace;
  const form = reader.form;
  const intents = form ? Object.keys(form.intents ?? {}).filter((key) => form.intents[key]) : [];
  const riskTag = verdict ? riskLabelFor(verdict) : null;

  return (
    <div className="space-y-2">
      <Section title="Authentication">
        {auth ? (
          <Pairs entries={Object.entries(auth)} />
        ) : (
          <p className="text-secondary">No trusted authentication results (treated as a fail).</p>
        )}
      </Section>

      <Section title={`Signals (${signals.length})`}>
        {signals.length === 0 ? (
          <p className="text-secondary">No signals fired.</p>
        ) : (
          <ul className="space-y-1.5">
            {signals.map((signal) => (
              <li key={signal.id} className="flex items-start gap-2">
                <span className="shrink-0 font-mono text-xs leading-[18px]">{signal.id}</span>
                <span className="shrink-0 text-sm leading-[18px] text-secondary">
                  {signal.severity}
                </span>
                <span className="break-words whitespace-pre-wrap">{signal.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Reader (quarantined, no tools)">
        {reader.failed || !form ? (
          <p>The Reader failed or refused, so the email is treated as suspicious.</p>
        ) : (
          <div className="space-y-2">
            <Pairs
              entries={[
                ['category', form.category],
                ['needs_reply', form.needs_reply],
                ['urgency', form.urgency],
                ['claims_to_be', form.claims_to_be],
                ['claimed_brand', form.claimed_brand ?? 'none'],
                ['intents', intents.length ? intents.join(', ') : 'none'],
                [
                  'meeting_request',
                  form.meeting_request
                    ? `${form.meeting_request.proposed_times?.length ?? 0} proposed time(s)`
                    : 'no',
                ],
              ]}
            />
            {form.summary && (
              <p className="rounded-sm bg-surface-3 px-2 py-1.5 text-sm">
                <span className="font-medium text-secondary">Summary of an untrusted email: </span>
                <span className="whitespace-pre-wrap">{form.summary}</span>
              </p>
            )}
          </div>
        )}
      </Section>

      <Section title="Verdict (deterministic floor, AI can only raise)">
        {verdict ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              {riskTag ? <Tag label={riskTag} /> : <span>Not flagged</span>}
              <span className="text-sm text-secondary">
                score {verdict.score} · floor {verdict.floor}
              </span>
            </div>
            {verdict.reasons.length > 0 && (
              <ul className="list-disc space-y-1 pl-5">
                {verdict.reasons.map((reason, index) => (
                  <li key={index} className="break-words whitespace-pre-wrap">
                    {reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-secondary">No verdict stored.</p>
        )}
      </Section>

      <Section title={`${preview ? 'Rules that would run' : 'Rules'} (${rules.length})`}>
        {rules.length === 0 ? (
          <p className="text-secondary">No rule matched.</p>
        ) : (
          <ul className="space-y-1">
            {rules.map((run) => (
              <li key={run.ruleId} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{run.ruleId}</span>
                <span className="text-secondary">
                  {run.actionsTaken.join(', ') || 'no actions'}
                </span>
                {run.status && <span className="text-sm text-secondary">{run.status}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {!preview && (
        <Section title={`Audit events (${events.length})`}>
          {events.length === 0 ? (
            <p className="text-secondary">No events yet.</p>
          ) : (
            <ol className="space-y-1 font-mono text-xs">
              {events.map((event) => (
                <li key={event.id} className="flex flex-wrap gap-x-2">
                  <time dateTime={event.ts} className="text-secondary">
                    {event.ts.replace('T', ' ').slice(0, 19)}
                  </time>
                  <span>{event.actor}</span>
                  <span className="font-medium">{event.event}</span>
                  {event.decision && <span>{event.decision}</span>}
                  {event.reason && <span className="text-secondary">{event.reason}</span>}
                </li>
              ))}
            </ol>
          )}
        </Section>
      )}
    </div>
  );
}
