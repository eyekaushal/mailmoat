import { Tooltip } from './Tooltip.jsx';

const RISK_WORDS = { SUSPICIOUS: 'Suspicious', DANGEROUS: 'Dangerous' };

/**
 * What the dot before a sender says. SAFE mail gets no dot and no word (PLAN §13.1 decision 4);
 * mail the pipeline has not judged yet is not safe either (invariant 6), so it gets a hollow one.
 * @param {{ level: string } | null | undefined} verdict
 * @returns {string | null}
 */
export function riskNote(verdict) {
  if (!verdict) return 'Not checked yet';
  return RISK_WORDS[verdict.level] ?? null;
}

/**
 * The 6 px risk dot with its tooltip: red for a flagged verdict, hollow for "not checked yet",
 * nothing for SAFE. Lists use it wherever the opened email would show the word.
 * @param {{ verdict: { level: string } | null | undefined }} props
 */
export function RiskDot({ verdict }) {
  const note = riskNote(verdict);
  if (!note) return null;
  return (
    <Tooltip label={note}>
      <span
        role="img"
        aria-label={note}
        className={`size-1.5 shrink-0 rounded-full ${verdict ? 'bg-danger' : 'border border-tertiary'}`}
      />
    </Tooltip>
  );
}
