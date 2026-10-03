import { RiskBadge } from './RiskBadge.jsx';

const SEVERITY_CLASSES = {
  low: 'bg-neutral-soft text-neutral',
  medium: 'bg-warn-soft text-warn',
  high: 'bg-danger-soft text-danger',
};

function Section({ title, children }) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      <h3 className="border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </h3>
      <div className="px-4 py-3 text-sm">{children}</div>
    </section>
  );
}

function Pairs({ entries }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="font-mono text-xs text-muted">{key}</dt>
          <dd className="break-words">{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * How the pipeline reached its verdict for one email (PRD F4 Test tab, F5): authentication,
 * every signal with its reason, the Reader's typed form, the verdict, the rules that ran and the
 * audit events. Signal reasons and the Reader summary may quote the email: plain text only.
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

  return (
    <div className="space-y-3">
      <Section title="1 · Authentication">
        {auth ? (
          <Pairs entries={Object.entries(auth)} />
        ) : (
          <p className="text-muted">No trusted authentication results (treated as a fail).</p>
        )}
      </Section>

      <Section title={`2 · Signals (${signals.length})`}>
        {signals.length === 0 ? (
          <p className="text-muted">No signals fired.</p>
        ) : (
          <ul className="space-y-2">
            {signals.map((signal) => (
              <li key={signal.id} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 font-mono text-xs">{signal.id}</span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${SEVERITY_CLASSES[signal.severity] ?? SEVERITY_CLASSES.low}`}
                >
                  {signal.severity}
                </span>
                <span className="break-words whitespace-pre-wrap">{signal.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="3 · Reader (quarantined, no tools)">
        {reader.failed || !form ? (
          <p className="text-warn">
            The Reader failed or refused, so the email is treated as suspicious.
          </p>
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
              <p className="rounded-md bg-surface-2 p-2 text-xs">
                <span className="font-medium text-muted">Summary of an untrusted email: </span>
                <span className="whitespace-pre-wrap">{form.summary}</span>
              </p>
            )}
          </div>
        )}
      </Section>

      <Section title="4 · Verdict (deterministic floor, AI can only raise)">
        {verdict ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <RiskBadge level={verdict.level} />
              <span className="text-xs text-muted">
                score {verdict.score} · floor {verdict.floor}
              </span>
            </div>
            <ul className="list-disc space-y-1 pl-5">
              {verdict.reasons.map((reason, index) => (
                <li key={index} className="break-words whitespace-pre-wrap">
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted">No verdict stored.</p>
        )}
      </Section>

      <Section title={`5 · ${preview ? 'Rules that would run' : 'Rules'} (${rules.length})`}>
        {rules.length === 0 ? (
          <p className="text-muted">No rule matched.</p>
        ) : (
          <ul className="space-y-1">
            {rules.map((run) => (
              <li key={run.ruleId} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{run.ruleId}</span>
                <span className="text-muted">{run.actionsTaken.join(', ') || 'no actions'}</span>
                {run.status && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] ${run.status === 'done' ? 'bg-safe-soft text-safe' : 'bg-danger-soft text-danger'}`}
                  >
                    {run.status}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {!preview && (
        <Section title={`6 · Audit events (${events.length})`}>
          {events.length === 0 ? (
            <p className="text-muted">No events yet.</p>
          ) : (
            <ol className="space-y-1 font-mono text-xs">
              {events.map((event) => (
                <li key={event.id} className="flex flex-wrap gap-x-2">
                  <time dateTime={event.ts} className="text-muted">
                    {event.ts.replace('T', ' ').slice(0, 19)}
                  </time>
                  <span>{event.actor}</span>
                  <span className="font-medium">{event.event}</span>
                  {event.decision && <span>{event.decision}</span>}
                  {event.reason && <span className="text-muted">{event.reason}</span>}
                </li>
              ))}
            </ol>
          )}
        </Section>
      )}
    </div>
  );
}
