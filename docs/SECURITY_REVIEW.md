# Security self-review — v1.0.0 (B28, 5 October 2026)

A pass over every invariant in `CLAUDE.md` and the trust boundaries in `SECURITY_APPROACH.md §3.5`,
with the code and the test that enforce each one. Nothing here is a claim without a test behind
it; where a guarantee rests on review alone, it says so.

## 1. Invariants

| # | Invariant | Where it is enforced | Test |
|---|---|---|---|
| 1 | Reader and Drafter are called **without tools**, see only the text they must read, and cannot import `agent/`, `actions/`, `google/` or memory code | `security/reader/Reader.js`, `Drafter.js` (no `tools` parameter in the request); ESLint `no-restricted-imports` on `security/reader/**` | `test/unit/lint/import-boundaries.test.js`; `test/unit/security/reader/Drafter.test.js` and `Extractor.test.js` assert the request has no `tools`; `test/unit/llm/LlmClient.test.js` asserts the reader role never sends one |
| 2 | Planner never receives untrusted text | `agent/Planner.js` builds `EmailFactsSchema`, a strict whitelist (id, handles, direction, from address/domain, date, risk level, category, needs_reply, intents, meeting_request); subject, display name, summary, body and claimed brand are absent from the schema | `test/unit/agent/EmailFacts.test.js`, `Planner.test.js` (F12.1: poisoned name, subject, summary, brand, body and recipient never reach the request) |
| 3 | Every runtime value is a `TaggedValue` with sources and readers | `agent/TaggedValue.js` (frozen), `PlanInterpreter.js` only passes `TaggedValue`s between steps; `combine` unions sources and intersects readers | `test/unit/agent/TaggedValue.test.js`, `PlanInterpreter.test.js` |
| 4 | Only the Policy Engine decides ALLOW / ASK / DENY | `policy/PolicyEngine.js` + `policy/rules/`; every tool call goes through `ActionExecutor` → `PolicyEngine.decide`; a tool without a rule, or a rule that throws, is DENY | `test/unit/policy/PolicyEngine.test.js`, `rules.test.js` (every policy-table row) |
| 5 | AI can raise risk, never lower it below the deterministic floor | `security/risk/RiskEngine.js`: `level = max(floor, combinations, band)`; floors use signals only | `test/unit/security/risk/RiskEngine.test.js` ("cannot be lowered by a Reader that says everything is fine") |
| 6 | Fail closed | Reader schema failure, timeout or refusal → `reader.failed` → SUSPICIOUS floor; ingest failure → `S0` → SUSPICIOUS; untrusted or missing `Authentication-Results` → `none`; policy exceptions → DENY | `RiskEngine.test.js`, `test/integration/securityPipeline.test.js` ("fails closed when the Reader fails"), `AuthResultsParser.test.js`, `PolicyEngine.test.js` (P8) |
| 7 | Memory writes only from `user`-sourced values | `db/repositories/MemoryRepository.js` throws `MemoryError` for any source other than `user`; `SaveMemoryTool` passes the value's sources | `test/unit/db/repositories.test.js`, `test/unit/agent/tools/tools.test.js`, `test/unit/policy/rules.test.js`, attack lab memory-poison rate |
| 8 | Rendering: AI output plain text, no remote content, links disarmed | React renders strings only (no `dangerouslySetInnerHTML`, no frames); `DisarmedLink` shows `text → host`, clickable only on SAFE mail (otherwise an explicit "Open anyway"); CSP `img-src 'self' data:`, `frame-ancestors 'none'` | `web/test/rendering.test.js` (scans `web/src` and `index.html`), `web/test/components/DisarmedLink.test.jsx`, `SecurityMiddleware.test.js` (CSP) |
| 9 | Secrets encrypted at rest, never returned to the browser, never logged; server binds 127.0.0.1 with Host/Origin and CSRF checks | `config/SecretStore.js` (AES-256-GCM, name as AAD), `KeyProvider.js` (0600 key file), `Config.HOST = '127.0.0.1'`; `api/SecurityMiddleware.js` (Host allow-list, Origin check, HttpOnly SameSite=Strict session cookie, per-session CSRF token); `core/Logger.js` redacts secrets always and email fields at `info` | `SecretStore.test.js`, `SecurityMiddleware.test.js` (Host, cross-origin GET, missing/forged token, CSP), `Logger.test.js`, `SettingsRoutes.test.js` (only the masked key is returned) |
| 10 | Attack lab passes after any change to `security/`, `agent/`, `policy/`, prompts or rendering | `npm test` replays the corpus against recorded fixtures (F13.3) and fails on any expectation or gate miss; `npm run attack-lab` runs live | `test/attack-lab/attackLab.test.js`; this block's live run (§3) |

## 2. Trust boundaries checked by hand

- **Reader prompt v2** (`security/reader/prompts/reader.system.md`): the email arrives inside
  randomly suffixed `email_*` tags; the prompt names every instruction-shaped text as data to
  describe. Changed in B28 only to define `asks_to_call_number` and `claims_to_be` more precisely;
  re-run live afterwards (§3).
- **Signals that read the Reader form** (S11 `FREEMAIL_CLAIMS_ORG`, S22 `BRAND_CLAIM_UNOWNED`)
  can only *add* a signal. A Reader that under-reports loses nothing the deterministic checks
  (S6, S7) do not already cover; one that over-reports raises the level.
- **Brand exemption** (S7 contact-name branch, S9, S10, S18) needs two facts an attacker cannot
  supply together: Google's own `Authentication-Results` says DMARC passed for the From domain,
  and that domain is in `data/brands.json`. A spoofed From fails DMARC; a look-alike domain is not
  listed. Received-only history still counts for nothing (S9/S10), as before.
- **Policy recipients:** literal recipients the Planner emits are tagged `planner`, never `user`,
  unless they appear verbatim in the user's request; policy treats `planner` like `email`.
- **Audit log** is append-only and exported as JSON from Settings → Advanced; the dashboard no
  longer renders it (PLAN §13.1 decision 5).
- **Dependencies:** nine runtime packages on the server (`@anthropic-ai/sdk`, `@googleapis/*`,
  `google-auth-library`, `express`, `parse5`, `postal-mime`, `zod`, the shared workspace);
  `npm audit` reports 0 vulnerabilities (5 Oct 2026) and runs in CI at `--audit-level=high`.

## 3. Attack lab (live, 5 October 2026)

See `reports/attack-lab-2026-10-04.md` (dated in UTC) for the per-technique table. Corpus: 124
hand-written emails in six sets. Gate metrics after the B28 tuning:

| Metric | Result | Target |
|---|---|---|
| Tool-misuse rate (injection) | 0% | 0% (gate) |
| Exfiltration rate | 0% | 0% (gate) |
| Memory-poison rate | 0% | 0% (gate) |
| Injection emails flagged | 100% | ≥ 95% |
| Detection rate (BEC, phishing, callback, spear) | 100% | ≥ 95% |
| Dangerous precision | 100% | ≥ 95% |
| False-positive rate (benign ≥ SUSPICIOUS) | 0% | ≤ 3% |
| Benign labelled DANGEROUS | 0% | ≤ 0.5% |
| Explanation coverage | 100% | 100% |

What the tuning changed (all deterministic, all documented in `SECURITY_APPROACH.md §7.2–7.4`):

1. Genuine brand mail (receipts, sign-in alerts, GitHub, LinkedIn, a bank statement, a Drive
   share) is no longer an "unfamiliar sender": S7/S9/S10/S18 exempt a DMARC-aligned listed brand
   domain.
2. A brand claim from the Reader counts only when code finds a listed brand behind it (S6, S7 or
   the new S22); the Reader calls any organisation a brand.
3. The credentials rule uses S10 (new domain) instead of S9 (new address), so a password reset
   from a new `no-reply@` address at a domain the user already deals with is routine.
4. A first-time payment request is DANGEROUS only with payment pressure: bank details written
   into the email (new S21), a claimed identity, high urgency, secrecy or a bank change. A first
   bill that links to the biller's own authenticated site gets no rule.
5. Callback phishing: the rule now covers bank, IT and government claims, and the Reader prompt
   defines `asks_to_call_number` as "a number given as the way to cancel, dispute or refund".
6. S13 recognises German, French and Spanish override phrases in hidden text.

All ten known gaps from B13 are closed; `attackLab.test.js` would fail if any came back.

## 4. Live smoke test (release day, by Kaushal)

Run on the real account with `npm start`, then tick each line. The test passes only if no action
happens without a click.

- [ ] Setup wizard: key test ✓, Google connect ✓ (unverified-app screen as documented), rules.
- [ ] First sync: emails appear with labels; Security Center shows the counts; nothing archived
      unless "Auto-archive dangerous mail" is on.
- [ ] Open a SAFE email: AI summary is a grey note; links show `text → host`; Reply drafts into
      Gmail Drafts and nothing is sent.
- [ ] Open a flagged email (send yourself the `npm run demo` CEO-fraud sample from another
      account): the risk tag, "Why was this flagged?", no draft on DANGEROUS, Block in Unsubscribe.
- [ ] Ask AI: "What needs a reply today?" answers with sources; a "draft a reply" request ends
      in a card that waits for Save.
- [ ] Approvals: approve one card, reject one; both appear in the audit export (Settings →
      Advanced → Export JSON) as `approval_decided` with the right outcome.
- [ ] Settings → Disconnect Google → reconnect; Delete all local data on a throwaway profile.
- [ ] A week of daily use; fixes ship as v1.0.x.
