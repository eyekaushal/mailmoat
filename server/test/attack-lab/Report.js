import { AttackLab, SETS, pct } from './AttackLab.js';

const MAX_REASONS = 3;

/**
 * Turns a {@link LabRun} into the Markdown report (`reports/attack-lab-<date>.md`) and its JSON
 * twin (PRD F13.2). The Markdown is also the demo material, so it leads with the release gate.
 */
export class Report {
  #run;
  #meta;

  /**
   * @param {import('./AttackLab.js').LabRun} run
   * @param {{ mode: 'live'|'replay', models?: string[], llmCalls?: number, costUsd?: number | null }} meta
   */
  constructor(run, meta) {
    this.#run = run;
    this.#meta = meta;
  }

  /** @returns {string} */
  markdown() {
    const { cases, metrics, bySet, missingFixtures } = this.#run;
    const gate = AttackLab.releaseGate(metrics);
    const failures = cases.filter((c) => !c.pass && !c.expected.knownGap);
    const gaps = cases.filter((c) => c.expected.knownGap);
    const effects = cases.flatMap((c) => c.violations.map((v) => ({ id: c.id, ...v })));
    const lines = [
      `# Attack lab report — ${this.#run.startedAt.slice(0, 10)}`,
      '',
      this.#modeLine(),
      `Corpus: ${cases.length} emails in ${Object.keys(bySet).length} sets. ` +
        `Expectations met: ${cases.filter((c) => c.pass).length}/${cases.length}` +
        (gaps.length ? ` (${gaps.length} known gaps)` : '') +
        '.',
      '',
      '## Release gate',
      '',
      '| Metric | Result | Target | |',
      '|---|---|---|---|',
      ...gate.checks.map(
        (check) =>
          `| ${check.label}${check.gate ? ' **(gate)**' : ''} | ${pct(check.value)} | ${check.target} | ${check.pass ? '✅' : '❌'} |`,
      ),
      '',
      gate.pass
        ? '**Gate: PASS** — every §11.2 target met.'
        : `**Gate: FAIL** — ${gate.checks
            .filter((check) => !check.pass)
            .map((check) => check.label.toLowerCase())
            .join(', ')}.`,
      '',
      '## Results by set',
      '',
      '| Set | Emails | SAFE | SUSPICIOUS | DANGEROUS | Injection flagged | Expectation met |',
      '|---|---|---|---|---|---|---|',
      ...SETS.filter((set) => bySet[set]).map((set) => {
        const row = bySet[set];
        return `| ${set} | ${row.total} | ${row.SAFE} | ${row.SUSPICIOUS} | ${row.DANGEROUS} | ${row.injectionFlagged} | ${row.pass}/${row.total} |`;
      }),
      '',
      '## Results by technique',
      '',
      '| Set | Technique | Emails | Met | Levels |',
      '|---|---|---|---|---|',
      ...this.#techniqueRows(),
      '',
      `## Failures (${failures.length})`,
      '',
      ...(failures.length ? failures.map((c) => this.#caseLine(c)) : ['None.']),
      '',
      `## Known gaps (${gaps.length})`,
      '',
      'Counted in the metrics above; `npm test` does not fail on them until the gap is closed.',
      '',
      ...(gaps.length
        ? gaps.map((c) => `${this.#caseLine(c)}\n  Gap: ${c.expected.knownGap}`)
        : ['None.']),
      '',
      `## Side effects (${effects.length})`,
      '',
      ...(effects.length
        ? effects.map((e) => `- \`${e.id}\` — ${e.metric}: ${e.effect.kind} on ${e.effect.target}`)
        : ['None. Handling the corpus labelled only the email under test.']),
      '',
    ];
    if (missingFixtures.length) {
      lines.push(
        `## Missing fixtures (${missingFixtures.length})`,
        '',
        ...missingFixtures.map((id) => `- \`${id}\``),
        '',
      );
    }
    return lines.join('\n');
  }

  /** The machine-readable twin of the Markdown. */
  json() {
    return {
      meta: this.#meta,
      gate: AttackLab.releaseGate(this.#run.metrics),
      ...this.#run,
    };
  }

  #modeLine() {
    const { mode, models = [], llmCalls, costUsd } = this.#meta;
    if (mode === 'replay') return 'Mode: **replay** — recorded Reader fixtures, no model calls.';
    const cost = costUsd === null || costUsd === undefined ? 'n/a' : `$${costUsd.toFixed(4)}`;
    return `Mode: **live** — models ${models.join(', ') || 'n/a'}; ${llmCalls ?? 0} model calls, estimated cost ${cost}.`;
  }

  #techniqueRows() {
    const groups = new Map();
    for (const c of this.#run.cases) {
      const key = `${c.set}|${c.expected.technique}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    return [...groups].map(([key, rows]) => {
      const [set, technique] = key.split('|');
      const levels = rows.map((c) => c.actual.level[0] + (c.actual.injectionAttempt ? '!' : ''));
      return `| ${set} | ${technique} | ${rows.length} | ${rows.filter((c) => c.pass).length} | ${levels.join(' ')} |`;
    });
  }

  #caseLine(c) {
    const reasons = c.actual.reasons.slice(0, MAX_REASONS).join(' / ') || '(no reasons)';
    return `- \`${c.id}\` — ${c.failures.join('; ') || 'ok'}. Got ${c.actual.level} (score ${c.actual.score}, signals ${c.actual.signals.join(' ') || 'none'}). Reasons: ${reasons}`;
  }
}
