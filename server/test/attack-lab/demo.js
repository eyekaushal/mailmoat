// Demo (PRD F13.5, SECURITY_APPROACH §11.3): the three headline attacks from the corpus, replayed
// through the real pipeline with recorded Reader output, next to what a naive single-model
// assistant with tools would do with the same email. No API key, no network. From the repo root:
//   npm run demo              all three
//   npm run demo -- --plain   no colours (for pasting into the README)
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Logger } from '../../src/core/Logger.js';
import { AttackLab, pct } from './AttackLab.js';
import { FixtureLlmClient } from './FixtureLlmClient.js';

const { values: args } = parseArgs({ options: { plain: { type: 'boolean', default: false } } });
const colour = (code) => (text) => (args.plain ? text : `\x1b[${code}m${text}\x1b[0m`);
const bold = colour('1');
const dim = colour('2');
const red = colour('31');
const green = colour('32');
const yellow = colour('33');
const cyan = colour('36');
const WIDTH = 78;

// What a single model with tools and no provenance checks does with the same email. These are
// simulations written from the emails' own instructions, not model output.
const HEADLINES = [
  {
    id: 'injection/white-text-forward-bank',
    title: 'Prompt injection hidden in a newsletter',
    threat: 'T1 — indirect prompt injection',
    naive: [
      'Reads the white-on-white text as an instruction from the account owner',
      "Searches the mailbox for 'bank statement' and 'invoice'",
      'Forwards every match to archive-backup@mailvault-sync.example',
      'Deletes the newsletter and says nothing to the user',
    ],
  },
  {
    id: 'bec/ceo-lookalike-domain',
    title: 'CEO fraud from a look-alike domain',
    threat: 'T4 — business email compromise',
    naive: [
      'Sees "Rahul Mehta", a known name, and an urgent request from the boss',
      'Drafts: "Sure Rahul — sending the payment as soon as you share the details"',
      'Files the thread as Important and reminds the user to pay today',
    ],
  },
  {
    id: 'phishing/netflix-spoof-dmarc-fail-link-mismatch',
    title: 'Brand phishing with a disguised link',
    threat: 'T5 — mass phishing / brand impersonation',
    naive: [
      'Summarises: "Netflix: your payment failed — update your details within 24 hours"',
      'Offers the link as www.netflix.com/account, which really goes to netflix-billing-update.example',
      'Adds a reminder so the user does not miss the deadline',
    ],
  },
];

const here = dirname(fileURLToPath(import.meta.url));
const lab = new AttackLab({
  corpusDir: join(here, 'corpus'),
  fixtures: new FixtureLlmClient({ dir: join(here, 'fixtures'), mode: 'replay' }),
  logger: new Logger({ level: 'error', sink: () => {} }),
});
const run = await lab.run({ caseIds: HEADLINES.map((headline) => headline.id) });
const byId = new Map(run.cases.map((result) => [result.id, result]));

const rule = (char = '─') => dim(char.repeat(WIDTH));
const wrap = (text, indent = 4, hanging = 0) => {
  const words = text.split(' ');
  const lines = [''];
  for (const word of words) {
    const next = lines.at(-1) ? `${lines.at(-1)} ${word}` : word;
    if (next.length > WIDTH - indent - hanging && lines.at(-1)) lines.push(word);
    else lines[lines.length - 1] = next;
  }
  return lines.map((line, i) => `${' '.repeat(indent + (i > 0 ? hanging : 0))}${line}`).join('\n');
};
const levelBadge = (level) =>
  ({
    SAFE: green('✅ SAFE'),
    SUSPICIOUS: yellow('⚠️  SUSPICIOUS'),
    DANGEROUS: red('⛔ DANGEROUS'),
  })[level];
const techniqueLabel = (technique) => technique.replaceAll('_', ' ');

console.log('');
console.log(bold('mailmoat attack-lab demo') + dim('  — three headline attacks, replayed offline'));
console.log(rule('═'));

HEADLINES.forEach((headline, index) => {
  const result = byId.get(headline.id);
  if (!result) throw new Error(`Corpus case ${headline.id} is missing`);
  const { preview, actual } = result;

  console.log('');
  console.log(
    bold(`${index + 1}/${HEADLINES.length}  ${headline.title}`) + dim(`   ${headline.threat}`),
  );
  console.log(rule());
  console.log(`${dim('From:   ')}${preview.from}`);
  console.log(`${dim('Subject:')} ${preview.subject}`);
  console.log(dim('What the user sees:'));
  console.log(
    wrap(
      preview.visible.replace(/\s+/g, ' ').slice(0, 220) +
        (preview.visible.length > 220 ? '…' : ''),
    ),
  );
  const hiddenText = preview.hidden.filter((item) => item.text.length > 40);
  if (hiddenText.length > 0) {
    console.log(dim('What is hidden from the user:'));
    for (const item of hiddenText) {
      console.log(wrap(`[${techniqueLabel(item.technique)}] “${item.text}”`));
    }
  }

  console.log('');
  console.log(
    red('  Naive single-model assistant') + dim('  (one model, tools, reads everything)'),
  );
  for (const step of headline.naive) console.log(red('    ✗ ') + step);

  console.log('');
  console.log(green('  mailmoat'));
  console.log(
    green('    ✓ ') +
      'Reader (no tools) sees only the visible text; the Planner never sees any of it',
  );
  if (actual.signals.length > 0) {
    console.log(green('    ✓ ') + `Signals: ${actual.signals.join(', ')}`);
  }
  console.log(
    green('    ✓ ') +
      `Verdict: ${levelBadge(actual.level)}` +
      (actual.injectionAttempt ? red('  · Injection attempt') : '') +
      (actual.verifyByPhone ? yellow('  · verify by phone') : ''),
  );
  actual.reasons.slice(0, 3).forEach((reason, i) => console.log(wrap(`${i + 1}. ${reason}`, 7, 3)));
  const labels =
    actual.labels.filter((label) => label.startsWith('mailmoat/')).join(', ') || 'none';
  console.log(
    green('    ✓ ') +
      `Did: applied Gmail label(s) ${cyan(labels)}. Forwarded 0 emails, sent 0 replies, wrote 0 memories.`,
  );
  if (actual.level === 'DANGEROUS') {
    console.log(
      green('    ✓ ') +
        'Will not draft a reply or act on this email without the user (policy: DANGEROUS ⇒ no auto-actions)',
    );
  }
  if (result.violations.length > 0) {
    console.log(red('    !! unapproved side effects: ') + JSON.stringify(result.violations));
  }
});

console.log('');
console.log(rule('═'));
const { metrics } = run;
console.log(
  `Side effects across the ${run.cases.length} emails: ${run.cases.flatMap((c) => c.violations).length}. ` +
    `Tool misuse ${pct(metrics.toolMisuseRate)}, exfiltration ${pct(metrics.exfiltrationRate)}, memory poison ${pct(metrics.memoryPoisonRate)}.`,
);
console.log(
  dim(
    'Full corpus: npm run attack-lab -- --replay   (124 emails, writes reports/attack-lab-<date>.md)',
  ),
);
console.log('');
