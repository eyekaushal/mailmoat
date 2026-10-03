# mailmoat — Build Plan (v1)

> **Status:** v3 · 1 Oct 2026 — 4-day build (Thu 1 Oct → Sun 4 Oct 2026), ~10 h/day with Claude Code (Max plan). **Slack moved to v2** (all alerts and approvals in the dashboard).
> **Inputs:** `docs/PRD.md` (what), `docs/SECURITY_APPROACH.md` (how it stays safe — wins any conflict).
> **Rule of the road:** Claude writes and tests code; **Kaushal/Sujay run every git command by hand.** No AI author or co-author lines anywhere.

---

## Table of contents

1. [How this plan works](#1-how-this-plan-works)
2. [Schedule: 4 days](#2-schedule-4-days)
3. [Branches (8) and git workflow](#3-branches-8-and-git-workflow)
4. [Block checklist](#4-block-checklist)
5. [Token and context strategy](#5-token-and-context-strategy)
6. [Cut list (only if behind schedule)](#6-cut-list-only-if-behind-schedule)
7. [Phase notes](#7-phase-notes)
8. [Final folder structure and file count](#8-final-folder-structure-and-file-count)
9. [Testing strategy](#9-testing-strategy)
10. [Definition of done](#10-definition-of-done)
11. [Progress tracker](#11-progress-tracker)
12. [v1.1 Distribution (after v1.0.0)](#12-v11-distribution-after-v100)

---

## 1. How this plan works

- **30 blocks (B00–B29)** are the units of work; they are grouped into **8 branches** (plus `main`). One branch = one pull request = roughly half a day of work.
- Each block ends with **1–3 commits** (Conventional Commits), so a branch carries several meaningful commits.
- Order follows dependencies: foundations → security core (layers 1–4) → attack lab (**first demo, end of Day 2**) → agent/policy (layers 5–6) → features → API → **UI (Fable 5)** → hardening → release.
- **Working loop per block:**
  1. Claude implements the block and runs its tests.
  2. Claude posts a short summary: what changed, how to verify, **suggested commit groups and messages**.
  3. You review and commit (Claude never runs git).
- **End of each branch:** you push and open the PR; CI runs; you merge.
- **End of each day:** 20-minute **explain-back** — Kaushal explains the day's classes and data flow in his own words. Anything he can't explain gets walked through before the next day starts.

> 🎨 **UI rule:** Before the UI branch starts, Claude will stop and say: **"We are starting UI now — please switch to Fable 5."**

---

## 2. Schedule: 4 days

Hours are Claude-Code-paced estimates including your review time. **Total ≈ 37 h of 40 h available.** Removing Slack frees ~1.5 h on Sunday; that plus ~1.5 h is the only buffer, which is why §6 exists.

| Day | Date | Branches | Hours | End-of-day outcome |
|---|---|---|---|---|
| **1** | Thu 1 Oct | `main` (scaffold) · `feature/foundation-and-sync` · start `feature/security-pipeline` (ingest) | ~8 | App boots; Gmail connected and syncing; raw emails parsed (auth results, links, hidden text) |
| **2** | Fri 2 Oct | finish `feature/security-pipeline` · `feature/attack-lab` | ~10 | **Milestone 1 — CLI demo:** every attack email gets a correct, explained verdict; first attack-lab report |
| **3** | Sat 3 Oct | `feature/agent-and-policy` · `feature/assistant-features` · `feature/api-server` | ~10.5 | **Milestone 2 — full backend** callable over the local API |
| **4** | Sun 4 Oct | 🎨 `feature/web-ui` (Fable 5) · `chore/hardening-and-release` | ~8.5 (+1.5 buffer) | **v1.0.0 tagged:** UI, release gate passed, README, demo |

**Things you do in parallel (not Claude):**
- **Day 1 morning:** create the Google Cloud project + OAuth client (guide in B03) and a test Gmail account; create an Anthropic API key with a small spend limit.
- **Day 3 (before B23):** in the Google Cloud project from B03, set the OAuth consent screen to **In production** (do **not** submit for verification) and hand over the client ID/secret for mailmoat's built-in config (`DISTRIBUTION.md` §1). Save the Happenstance reference screenshots to `notes/ux-references/` for B25.
- **Day 4:** live smoke test on Kaushal's own account; record the demo video.

> **Status 3 Oct:** about one branch behind (attack lab not started). Remaining v1 work ≈ 21 h against ~20 h available — if a day overruns, cut strictly from §6. Distribution decisions from 3 Oct (shared Google client, guided setup) add ~1 h to B23/B25; the Mac app and website are **v1.1** (§12), not v1.

---

## 3. Branches (8) and git workflow

### 3.1 The 8 branches

| # | Branch | Blocks | Day | Merge when |
|---|---|---|---|---|
| 0 | `main` (first commit) | B00 | 1 | Scaffold + docs reviewed |
| 1 | `feature/foundation-and-sync` | B01–B04 | 1 | Gmail connects, syncs, contacts built |
| 2 | `feature/security-pipeline` | B05–B12 | 1–2 | All SECURITY_APPROACH §8 examples give the documented verdict |
| 3 | `feature/attack-lab` | B13–B14 | 2 | First report + CLI demo |
| 4 | `feature/agent-and-policy` | B15–B17 | 3 | Every policy-table row tested |
| 5 | `feature/assistant-features` | B18–B22 | 3 | Rules, drafts, meetings, chat, unsubscribe, summary work in tests |
| 6 | `feature/api-server` | B23 | 3 | Every route tested; CSRF + DNS-rebinding tests pass |
| 7 | `feature/web-ui` 🎨 | B24–B27 | 4 | All screens work against the real backend |
| 8 | `chore/hardening-and-release` | B28–B29 | 4 | Release gate met; README; then tag `v1.0.0` |


**Naming (Conventional Branch):** `feature/…`, `bugfix/…`, `hotfix/…`, `chore/…`, `release/…`; lowercase, hyphens.
**Commits (Conventional Commits):** `type(scope): summary` — types `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `build`, `perf`, `style`; scopes `core`, `config`, `db`, `gmail`, `sync`, `ingest`, `signals`, `reader`, `risk`, `lab`, `llm`, `planner`, `policy`, `actions`, `rules`, `drafts`, `meetings`, `chat`, `unsubscribe`, `api`, `ui`, `audit`, `docs`, `ci`.

### 3.2 Very first commit

```bash
git status                       # notes/ and .env must NOT appear
git add .
git commit -m "chore(core): initial project scaffold and docs"
git push -u origin main
```
On GitHub (as eyekaushal): **Settings → Branches → rule for `main`** → require a pull request + passing CI.

### 3.3 Each branch

```bash
git checkout main && git pull
git checkout -b feature/<branch-name>
# per block: Claude implements → you review → you commit the suggested groups
git add <files> && git commit -m "feat(scope): …"
# … more blocks, more commits …
git push -u origin feature/<branch-name>
```
Open PR → CI green → **"Create a merge commit"** (keeps every commit visible) →
```bash
git checkout main && git pull && git branch -d feature/<branch-name>
```

### 3.4 Release

After `chore/hardening-and-release` is merged:
```bash
git checkout main && git pull
git tag -a v1.0.0 -m "mailmoat v1.0.0"
git push origin v1.0.0
```
Fixes after release: `bugfix/<desc>` branches → `v1.0.1`.

---

## 4. Block checklist

| Block | Branch | What gets built | PRD refs | Hrs | Done when |
|---|---|---|---|---|---|
| **B00** | main | npm workspaces (`server/ web/ shared/`), ESLint/Prettier, Vitest, `.gitignore`, `.env.example`, `.nvmrc`, LICENSE, `SECURITY.md`, `CLAUDE.md`, README stub | — | 0.75 | `npm install && npm test` passes |
| **B01** | foundation-and-sync | CI workflow (lint, test, `npm audit`), PR template, import-boundary lint rule | §15 | 0.25 | CI green on the PR |
| **B02** | foundation-and-sync | `Logger` (redaction), `errors`, `Config`, `SecretStore` (AES-256-GCM), `KeyProvider`, `Database`, `Migrator`, `001_init.sql`, `SettingsRepository`, `SyncStateRepository` | F1.3, F1.7, §12 | 1.5 | Secrets round-trip encrypted; migrations idempotent |
| **B03** | foundation-and-sync | `GoogleAuth` (loopback OAuth + PKCE), `GmailClient`, `CalendarClient`, `docs/setup/google-oauth.md` | F1.4, F1.5 | 1.5 | Real test Gmail connected from a CLI script; tokens encrypted |
| **B04** | foundation-and-sync | `EmailRepository`, `ContactRepository`, `SenderRepository`, `GmailSync`, `Backfill`, `ContactHistoryBuilder`, `Scheduler` | F2.1–F2.7 | 1.5 | New mail detected ≤ 60 s; no reprocessing after restart |
| **B05** | security-pipeline | `MimeParser`, `AuthResultsParser` (top-most Google stamp only), `LinkExtractor` | F3.1 | 1 | Forged `Authentication-Results` ignored; link text/href captured |
| **B06** | security-pipeline | `HiddenContentDetector`, `TextNormalizer`, `EmailIngestor` | F3.1 | 1 | White/0px/`display:none`/comments/zero-width/bidi detected |
| **B07** | security-pipeline | `Signal`, `SignalEngine`, S1–S4, S9–S11 | F3.2 | 1 | Positive + negative test per signal |
| **B08** | security-pipeline | `DomainSimilarity`, `Confusables`, brand list, S5–S8 | F3.2 | 1.25 | `acme-c0rp.com`, `xn--`, brand display names caught |
| **B09** | security-pipeline | S12–S20, shortener list | F3.2 | 1 | Link mismatch, userinfo trick, risky attachments caught |
| **B10** | security-pipeline | `LlmClient` (SDK, retries, refusal handling, cost tracking), `ModelConfig` | §14 | 0.5 | Live smoke call; usage recorded |
| **B11** | security-pipeline | `Reader`, prompt, Reader Zod schema (`shared/`), fail-closed | F3.3, F3.4 | 1.25 | Valid forms on samples; malformed output → SUSPICIOUS |
| **B12** | security-pipeline | `RiskEngine`, `RiskRules`, `Verdict`, `SecurityPipeline`, `VerdictRepository`, `AuditLog` + repo, Gmail security labels | F3.5–F3.8 | 1.5 | SECURITY_APPROACH §8 examples → documented levels |
| **B13** | attack-lab | `AttackLab`, `FakeGmail`, `RecordingToolbox`, `FixtureLlmClient`, `Report`, `run.js`; corpus v1 (~120 emails: injection, BEC, phishing, callback, spear, benign) | F13.1–F13.4 | 2 | `npm run attack-lab` writes report; `npm test` replays fixtures free |
| **B14** | attack-lab | `demo.js` CLI demo | F13.5 | 0.5 | Readable output of 3 headline attacks (**Milestone 1**) |
| **B15** | agent-and-policy | `TaggedValue`, `HandleStore`, plan schema, `Planner` + prompt | F12.1–F12.2 | 1 | Test proves no raw email text in any Planner request |
| **B16** | agent-and-policy | `Tool`, `ToolRegistry`, 15 tools, `PlanInterpreter` | F12.3, F12.6–F12.7 | 1.5 | Provenance rules tested; failures stop the plan |
| **B17** | agent-and-policy | `PolicyEngine`, `Decision`, 8 policy rules, `ActionExecutor`, `ApprovalService`, `ApprovalRepository`, `MemoryRepository` | F12.4–F12.5 | 1.5 | Every policy-table row has a test |
| **B18** | assistant-features | `RuleEngine`, `PredefinedRules`, `RuleRepository`, rule history, process-past-emails | F4 (backend) | 0.75 | 12 rules map from typed fields; toggles respected |
| **B19** | assistant-features | `Drafter` + prompt, `DraftService`, `DraftRepository` | F6 | 1 | Formal drafts; never for DANGEROUS; tainted to participants |
| **B20** | assistant-features | `MeetingService` | F7 | 1 | "Friday at 5" → conflict-checked proposal; attendees policy-checked |
| **B21** | assistant-features | `ChatService`, `ChatRepository`, 3 intents, step streaming, preview payloads | F8 | 1.25 | "find time … after my flight" works end-to-end in a test |
| **B22** | assistant-features | `SafeHttpClient`, `UnsubscribeService`, `SummaryService` | F9, F14 | 1 | SSRF tests pass; risky senders never contacted |
| **B23** | api-server | `App`, `SecurityMiddleware`, 10 route classes, SSE, `main.js`; **built-in Google client** (committed config default, `.env` override; `GoogleRoutes` start Connect Google with it — users never enter a client) | §13, §9, F1.4 | 1.75 | Routes tested; CSRF + DNS-rebinding tests pass; connect works with no user-supplied client (**Milestone 2**) |
| **B24** 🎨 | web-ui | Vite/Tailwind/router scaffold, `ApiClient`, layout, sidebar, shared components | §8 | 1.25 | Shell renders; CSP clean |
| **B25** 🎨 | web-ui | Setup wizard + Settings: **two Anthropic key flows** ("have an account?" yes → Console keys page + screenshot; no → sign up / add credits / create key steps + cost estimate; both → paste + Test ✓), **guided warning screen** (why Google says "unverified", where to click) → **Connect Google** button, rules step. Happenstance-style guidance (`notes/ux-references/`) | F1, `DISTRIBUTION.md` | 1.75 | New user connects Anthropic and Google without editing files or creating a Google client |
| **B26** 🎨 | web-ui | Inbox (tabs, list, detail + risk banner), Assistant (Rules/Test/History), Approvals | F4, F5, F6.3 | 1.5 | Pipeline trace visible; no remote loads |
| **B27** 🎨 | web-ui | Chat panel + preview cards, Bulk Unsubscribe, Security Center, Today card | F8, F9, F11, F14 | 1.5 | All PRD §8 screens work (**Milestone 3**) |
| **B28** | hardening-and-release | Live attack-lab run, threshold tuning, security self-review, `npm audit` clean, live smoke test on Kaushal's account | F13, §16 | 2 | Release gate met (0% misuse/exfil/poison; ≥ 95% detection; ≤ 3% FP) |
| **B29** | hardening-and-release | README (setup, architecture, results), screenshots, CHANGELOG, demo script | §16 | 1 | Ready to tag `v1.0.0` |

---

## 5. Token and context strategy

The Max plan has rolling usage windows and weekly limits; the context window fills fast on a project this size. Rules for the 4 days:

1. **One Claude Code session per branch.** At the end of a branch, run `/clear` and start fresh. Don't let one session carry a whole day.
2. **Every new session starts with one line:** *"Read CLAUDE.md and PLAN.md §11; continue with the next unchecked block."* `CLAUDE.md` + the progress tracker (§11) are the hand-off — no re-explaining.
3. **Claude updates the tracker (§11)** at the end of every block (a file edit, not git).
4. **Read narrowly.** Claude opens only the files a block needs; the docs are referenced by section, not re-read in full.
5. **Quiet test output.** Tests run with a compact reporter; only failures are shown in full.
6. **No subagents** unless you explicitly ask (they multiply token use).
7. **Short updates.** Claude's end-of-block message is ≤ 10 lines: what changed, how to verify, commit groups.
8. **Schedule heavy work after a usage reset.** If a limit is hit mid-block, the tracker lets the next session resume exactly where it stopped.
9. **Model use:** the current model for backend/security; **Fable 5 for the UI branch** (per your instruction).
10. **API spend is separate:** live attack-lab runs and the app's own calls use the Anthropic **API key** (cents per run), not the Max plan.

---

## 6. Cut list (only if behind schedule)

Not a watered-down v1 — this is the order in which **extras** move to v1.0.1 if a day overruns. Core security (B05–B17, B23 middleware), the attack lab and every "Must" screen are **never** on this list.

| Order | Cut | Moves to |
|---|---|---|
| 1 | Today card (F14) | v1.0.1 |
| 2 | "Process past emails" button (F4.5) — backfill still classifies new mail | v1.0.1 |
| 3 | Corpus beyond 120 emails | grows after release |
| 4 | Audit-log JSON export (F11.3 export only) | v1.0.1 |
| 5 | Settings: model switch + polling interval controls (defaults stay) | v1.0.1 |
| 6 | Drafts cleanup job (F6.5) | v1.0.1 |

---

## 7. Phase notes

- **Foundation & sync:** npm workspaces; Node 24 LTS in `.nvmrc`/`engines`; data folder is OS app-data (e.g. `~/Library/Application Support/mailmoat`), never the repo. `.gitignore`: `node_modules/`, `.env`, `notes/`, `data/`, `*.db`, `coverage/`, `dist/`, `reports/*.json`. ESLint `no-restricted-imports`: `security/reader/**` cannot import `agent/`, `actions/`, `google/`, `MemoryRepository`. Gmail via history polling every 60 s; 30-day metadata backfill builds contact history.
- **Security pipeline:** trust only the top-most `Authentication-Results` from `mx.google.com`; record hidden content, then strip it from Reader text; 20 signals, one class each; Reader has no `tools`, structured output + Zod, fails closed; risk floors that AI cannot lower.
- **Attack lab:** corpus = `name.eml` + `name.expected.json`; live mode records model outputs to fixtures; CI replays fixtures for free; release gate 0% misuse/exfil/poison.
- **Agent & policy:** Planner sees only typed fields and handles; `TaggedValue` provenance; Policy Engine implements SECURITY_APPROACH §7.6 exactly.
- **Assistant features:** rules matched in code from typed fields; replies written by the quarantined Drafter; meeting proposals via free/busy; chat with 3 intents; SSRF-safe one-click unsubscribe.
- **API server:** bind `127.0.0.1`; Host/Origin checks; CSRF; CSP; SSE for chat. Built-in Google OAuth client is a committed default (desktop-client secret is non-confidential; PKCE + loopback protect it); `.env` may override for development.
- **Web UI 🎨 (Fable 5):** Inbox Zero-style Assistant page and label tabs; Superhuman-style chat with Edit/Save cards; risk = icon + text; AI text plain only; email HTML only in sandboxed frame. Setup wizard follows Happenstance's guided-connector style: explain each external step with a screenshot and one "Continue to …" button.
- **Hardening & release:** live lab run, tuning only by measurement, `npm audit`, live smoke test, README with results, tag.

---

## 8. Final folder structure and file count

```
mailmoat/
├── .github/
│   ├── workflows/ci.yml
│   └── pull_request_template.md
├── docs/
│   ├── PRD.md · PLAN.md · SECURITY_APPROACH.md · DISTRIBUTION.md · INBOX_ZERO_TEARDOWN.md
│   └── setup/  google-oauth.md
├── notes/                                   (gitignored — private planning)
├── shared/
│   ├── package.json
│   └── src/
│       ├── schemas/    reader-form.js · drafter-output.js · plan.js · verdict.js · api.js
│       └── constants/  risk-levels.js · labels.js · rules.js
├── server/
│   ├── package.json
│   ├── src/
│   │   ├── main.js
│   │   ├── core/        Logger.js · Scheduler.js · errors.js
│   │   ├── config/      Config.js · SecretStore.js · KeyProvider.js
│   │   ├── db/          Database.js · Migrator.js · migrations/001_init.sql
│   │   ├── db/repositories/
│   │   │                EmailRepository.js · VerdictRepository.js · ContactRepository.js ·
│   │   │                SenderRepository.js · RuleRepository.js · ApprovalRepository.js ·
│   │   │                AuditLogRepository.js · MemoryRepository.js · ChatRepository.js ·
│   │   │                SettingsRepository.js · SyncStateRepository.js · DraftRepository.js
│   │   ├── google/      GoogleAuth.js · GmailClient.js · CalendarClient.js
│   │   ├── sync/        GmailSync.js · Backfill.js · ContactHistoryBuilder.js
│   │   ├── security/
│   │   │   ├── SecurityPipeline.js
│   │   │   ├── ingest/  EmailIngestor.js · MimeParser.js · AuthResultsParser.js ·
│   │   │   │            LinkExtractor.js · HiddenContentDetector.js · TextNormalizer.js
│   │   │   ├── signals/ Signal.js · SignalEngine.js · DomainSimilarity.js · Confusables.js
│   │   │   │   ├── data/      brands.json · shorteners.json · confusables.json
│   │   │   │   ├── sender/    DmarcFailSignal.js · SpfDkimFailSignal.js · DkimDomainMismatchSignal.js ·
│   │   │   │   │              ReplyToMismatchSignal.js · LookalikeContactDomainSignal.js ·
│   │   │   │   │              LookalikeBrandDomainSignal.js · DisplayNameImpersonationSignal.js ·
│   │   │   │   │              PunycodeDomainSignal.js · FirstTimeSenderSignal.js ·
│   │   │   │   │              FirstTimeDomainSignal.js · FreemailClaimsOrgSignal.js
│   │   │   │   └── content/   HiddenTextPresentSignal.js · HiddenTextInstructionsSignal.js ·
│   │   │   │                  LinkTextHrefMismatchSignal.js · LinkShortenerSignal.js ·
│   │   │   │                  LinkIpLiteralSignal.js · LinkUserinfoTrickSignal.js ·
│   │   │   │                  LinkFirstSeenDomainSignal.js · RiskyAttachmentSignal.js ·
│   │   │   │                  AuthFormInHtmlSignal.js
│   │   │   ├── reader/  Reader.js · Drafter.js · prompts/reader.system.md · prompts/drafter.system.md
│   │   │   └── risk/    RiskEngine.js · RiskRules.js · Verdict.js
│   │   ├── llm/         LlmClient.js · ModelConfig.js
│   │   ├── agent/       Planner.js · PlanInterpreter.js · TaggedValue.js · HandleStore.js ·
│   │   │                ToolRegistry.js · prompts/planner.system.md
│   │   │   └── tools/   Tool.js · SearchEmailsTool.js · GetEmailFieldsTool.js · ExtractTool.js ·
│   │   │                SummariseTool.js · ApplyLabelTool.js · ArchiveTool.js · MarkReadTool.js ·
│   │   │                CreateDraftTool.js · SendEmailTool.js · ReplyTool.js · GetFreeBusyTool.js ·
│   │   │                CreateCalendarEventTool.js · UnsubscribeTool.js · BlockSenderTool.js ·
│   │   │                SaveMemoryTool.js
│   │   ├── policy/      PolicyEngine.js · Decision.js
│   │   │   └── rules/   PolicyRule.js · ReadRule.js · OrganizeRule.js · DraftRule.js · SendRule.js ·
│   │   │                CalendarRule.js · UnsubscribeRule.js · BlockRule.js · MemoryRule.js
│   │   ├── actions/     ActionExecutor.js · ApprovalService.js
│   │   ├── rules/       RuleEngine.js · PredefinedRules.js
│   │   ├── features/    DraftService.js · MeetingService.js · UnsubscribeService.js ·
│   │   │                SafeHttpClient.js · SummaryService.js · ChatService.js
│   │   ├── audit/       AuditLog.js
│   │   └── api/         App.js · SecurityMiddleware.js
│   │       └── routes/  SettingsRoutes.js · GoogleRoutes.js · EmailRoutes.js ·
│   │                    RuleRoutes.js · ChatRoutes.js · ApprovalRoutes.js · SenderRoutes.js ·
│   │                    SecurityRoutes.js · SummaryRoutes.js · SystemRoutes.js
│   └── test/
│       ├── unit/ …                          (mirrors src/, one *.test.js per class)
│       ├── integration/ …                   (pipeline, policy, API)
│       └── attack-lab/
│           ├── AttackLab.js · FakeGmail.js · RecordingToolbox.js · FixtureLlmClient.js ·
│           │   Report.js · run.js · demo.js
│           ├── corpus/{injection,bec,phishing,spear,callback,benign}/   *.eml + *.expected.json
│           └── fixtures/                    recorded model responses
├── web/
│   ├── package.json · index.html · vite.config.js
│   └── src/
│       ├── main.jsx · App.jsx · styles.css
│       ├── lib/         ApiClient.js · useApi.js
│       ├── components/  Layout.jsx · Sidebar.jsx · RiskBadge.jsx · RiskBanner.jsx · CategoryBadge.jsx ·
│       │                DisarmedLink.jsx · SafeEmailFrame.jsx · PreviewCard.jsx · ApprovalCard.jsx ·
│       │                PipelineTrace.jsx · EmptyState.jsx · LoadingState.jsx
│       └── pages/
│           ├── setup/        SetupWizard.jsx · AnthropicStep.jsx · GoogleStep.jsx · RulesStep.jsx
│           ├── inbox/        InboxPage.jsx · LabelTabs.jsx · EmailList.jsx · EmailDetail.jsx
│           ├── assistant/    AssistantPage.jsx · RulesTab.jsx · TestTab.jsx · HistoryTab.jsx
│           ├── chat/         ChatPage.jsx · ChatMessage.jsx
│           ├── approvals/    ApprovalsPage.jsx
│           ├── unsubscribe/  BulkUnsubscribePage.jsx · SenderTable.jsx
│           ├── security/     SecurityCenterPage.jsx · ThreatFeed.jsx · AuditLogTable.jsx
│           ├── settings/     SettingsPage.jsx
│           └── today/        TodayCard.jsx
├── reports/                                 attack-lab-<date>.md
├── .gitignore · .env.example · .nvmrc · .editorconfig · .prettierrc · eslint.config.js
├── package.json · package-lock.json
├── README.md · LICENSE · SECURITY.md · CLAUDE.md · CHANGELOG.md
```

### 8.1 File count (hand-written; excludes lockfile, `notes/`, test data)

| Area | Files |
|---|---|
| Root config & docs | 12 |
| `.github/` | 2 |
| `docs/` | 5 |
| `shared/` | 9 |
| `server/src/` core, config, db, repositories, main | 22 |
| `server/src/google/` + `sync/` | 6 |
| `server/src/security/` | 41 |
| `server/src/llm/` + `agent/` + `tools/` | 24 |
| `server/src/policy/` + `actions/` + `rules/` | 15 |
| `server/src/features/` + `audit/` | 7 |
| `server/src/api/` | 12 |
| `server/package.json` | 1 |
| `web/` | 42 |
| **Source + config + docs total** | **198** |
| Unit + integration tests | ≈ 100 |
| Attack-lab code | 7 |
| Attack-lab corpus v1 (~120 emails × 2 files) | ≈ 240 |

---

## 9. Testing strategy

| Level | Tool | What | Runs |
|---|---|---|---|
| Unit | Vitest | Every class in `security/`, `policy/`, `agent/`, `rules/`, `features/` | Every commit |
| Integration | Vitest | Pipeline on fixture emails; Planner → Interpreter → Policy with fake tools; API routes | Every commit |
| Attack lab (fixtures) | Vitest + lab runner | Whole corpus, recorded model outputs, no API cost | Every commit (CI) |
| Attack lab (live) | `npm run attack-lab` | Whole corpus with real Claude calls | End of Day 2, end of Day 3, before release |
| UI checks | Manual checklist | No remote loads, CSP clean, risk banners, approvals | Day 4 |
| Live smoke test | Kaushal's Gmail | Real mail for a few hours; then daily use after release | Day 4 + following week |

Coverage target: **≥ 80%** lines on `security/` and `policy/`.

---

## 10. Definition of done

**Block:** its "Done when" is met; tests for every new class pass; lint clean; tracker (§11) updated; Claude has posted commit groups.
**Branch:** all its blocks done; attack lab (fixtures) passes if it touched `security/`, `agent/`, `policy/`, prompts or rendering; you pushed, opened the PR, CI green, merged.
**Day:** explain-back done; next day's first block identified in §11.

---

## 11. Progress tracker

Claude updates this table at the end of every block. New sessions resume from the first unchecked row.

| Block | Status | Notes |
|---|---|---|
| B00 | ✅ | Scaffold done 1 Oct. Node 24 via `.nvmrc`; added `.prettierignore` (Markdown hand-formatted). Waiting for first commit. |
| B01 | ✅ | CI (lint, format, test, audit; Node from .nvmrc), PR template, Reader/Drafter import-boundary rule + 6 tests. CI needs token Workflows permission to push. |
| B02 | ✅ | Logger (redaction), errors, Config (loopback-only), KeyProvider (0600 key file; keychain = later), SecretStore (AES-256-GCM + name AAD), Database (`node:sqlite`, no native dep), Migrator, full v1 schema (append-only audit log, user-only memory), 2 repos. 41 tests. |
| B03 | ✅ | GoogleAuth (loopback + PKCE S256, one-time 10-min state, rejects partial grants, encrypted refresh token, rotation, revoke), GmailClient, CalendarClient, `npm run connect:google`, setup guide. Scopes: dropped gmail.settings.basic, added calendar.freebusy. 60 tests. Live connect pending user run. |
| B04 | ✅ | GmailSync (history polling, pending queue + retries, expired-history recovery), Backfill (sent 365d, received 30d, metadata only), MessageImporter, EmailMetadataMapper (subject hashed, receive time not Date header), Contact/Sender/Email repos, Scheduler, migration 002, `npm run dev:sync`. **B07 note:** "known contact" = sentCount > 0; received-only is attacker-controllable. 80 tests. |
| B05 | ✅ | MimeParser (postal-mime → `ParsedEmail`, attachment metadata only, `IngestError` on failure), AuthResultsParser (only the **first** `Authentication-Results` counts and only if `mx.google.com`; otherwise untrusted `none`; comments stripped), LinkExtractor (parse5; href + visible text/img alt, `<area>`, plain-text URLs, punycode host). Added `parse5`. 104 tests. |
| B06 | ✅ | HiddenContentDetector (parse5 walk with CSS inheritance: display/visibility/opacity/tiny font/offscreen/clipped/colour≈background incl. `bgcolor`/`<font color>`; `<style>` simple selectors + `@media`; prose comments; long alt/title; zero-width + bidi in body/subject/display name), TextNormalizer (strip invisibles → NFKC → controls → whitespace; Reader cap 12k chars), EmailIngestor (`IngestedEmail`; Reader text = visible only; body SHA-256). 142 tests. |
| B07 | ✅ | `Signal` base (`fire(reason)`), `SignalEngine` (a crashing signal becomes `S0 SIGNAL_ERROR`, high → fail closed in B12), `OrgDomain` (org-domain approx without PSL, `data/freemail.json`), S1–S4, S9–S11 in `signals/sender/`. S2 also fires when there is no trusted Google stamp. S4 ignores List-Id (forgeable); only exemption = Reply-To the user wrote to. S9/S10 use sentCount > 0 or trusted; free-mail domains never count as known. S11 = free-mail + role/company display name or Reader `claims_to_be` (context.readerForm, null before Reader). 185 tests. |
| B08 | ✅ | `Confusables` (TR39 skeleton from bundled Unicode `confusables.json`, 6,712 entries; mapped → lower-cased → mapped again since TR39 is case-sensitive), `DomainSimilarity` (OSA distance; <8 chars skeleton-only, 8–9 → 1 edit, ≥10 → 2), `BrandList` + `brands.json` (46 brands; free-mail domains never prove a brand; "norton" dropped as a surname). S5–S8. Migration 003 adds `contacts.name`, taken **only** from the user's sent mail (To/Cc) for S7; existing contacts get names as new sent mail syncs. S7 also catches an address shown as display name. 239 tests. |
| B09 | ✅ | S12–S20 in `signals/content/`, `data/shorteners.json` (40). S12 needs ≥ 20 CSS-hidden words or a bidi **override** (U+202D/E); preheaders, ZW padding, comments, RTL embeddings ignored (tune in B28). S13 = AI-addressed wording + action verb, override phrases, or our tool names; "agent"/"bot"/"you are now"/"from now on" excluded (FP). S14 = text-domain ≠ href, plus real domain used as subdomain prefix (`netflix.com.account-verify.example`); tracker links exempt only if shown domain = DMARC-passing sender. S18 "seen" = sent-to domains + brands (no body history). S19 adds svg/one/hta/exe…, rar/7z always; MimeParser gets `encrypted` (all ZIP local headers). S20 via parse5. Signal reasons may quote attacker text → display-only, never to Planner. 296 tests. |
| B10 | ✅ | `LlmClient` (one `complete({role, system, user, schema})`; Zod → JSON-schema structured output with unsupported keywords stripped, Zod re-validates; **never sends `tools`**; system prompt cached; refusal → `LlmRefusalError`, non-`end_turn`/bad JSON/schema fail → `LlmOutputError`, SDK/network → `LlmError`; error messages carry issue paths only). Retries/timeouts = SDK (`maxRetries: 3`, 60 s). Opus/Sonnet 5.5 calls use server-side `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`). `ModelConfig` (PRD §14 roles, Settings overrides, prices). Usage + cost → audit log: minimal `AuditLog` + `AuditLogRepository` pulled forward from B12. Added `@anthropic-ai/sdk`. `npm run llm:smoke` — **live run pending user**. 314 tests. |
| B11 | ✅ | `ReaderFormSchema` in `shared/schemas/reader-form.js` (strict objects, enums, summary ≤ 300, brand ≤ 40, ≤ 5 ISO-8601 times; added `zod` to shared). `Reader` never throws: any error → `{ failed: true }` (B12 maps to SUSPICIOUS). Untrusted fields in per-call random-suffix tags; trusted receive time/time zone/direction first; `expects_reply` forced false for inbound; empty brand → null. Prompt `reader.system.md` v1 (data-not-instructions, "unsure → true" on risk intents, summary without links/addresses). `npm run reader:sample` (meeting / BEC / injection) — **live run pending user**. 338 tests. |
| B12 | ✅ | `RiskRules` (§7.4 floors + combinations as data; extra fail-closed floor: Reader failed or `S0` → SUSPICIOUS; weights low 8 / medium 20 / high 45, bands ≥ 40 SUSPICIOUS, ≥ 80 DANGEROUS — tune in B28), `RiskEngine` (max(floor, combos, band); rule reasons first), `Verdict` (frozen; `injectionAttempt`, `verifyByPhone`, `topReasons()`). `SecurityPipeline`: `analyse()` side-effect free (Ingest → Reader → Signals → Risk; parse failure → `S0 INGEST_ERROR`; outbound = Reader only), `process()` = store + audit + Gmail labels (`shared/constants/labels.js`) + opt-in `autoArchiveDangerous`. `VerdictRepository` (one transaction). `SignalCatalog` = single list of S1–S20. `dev:sync` now runs the real pipeline. §8 integration tests: 8.1/8.4/8.4-variant/8.5/8.6/8.7 + benign SAFE. 395 tests. **Branch `feature/security-pipeline` complete.** |
| B13 | ✅ | `server/test/attack-lab/`: `AttackLab` (runs the real `SecurityPipeline.process()` — ingest, Reader, signals, risk, store, labels — on an in-memory DB with `corpus/persona.json` contacts; scores each case against `name.expected.json`; §11.2 metrics + `releaseGate`), `FakeGmail` (reports every write), `RecordingToolbox` (misuse / exfiltration / memory-poison ledger; only label/archive of the email under test is approved), `FixtureLlmClient` (replay or record per `<set>/<case>`; recorded failures replay as failures; missing fixture = fail closed + reported), `Report` (`reports/attack-lab-<date>.md` + `.json`), `run.js` (`npm run attack-lab`, `--replay`, `--set`, `--case`). Corpus v1 = **124** emails (injection 28, bec 20, phishing 24, callback 10, spear 10, benign 32). `expect` = min level (benign: exactly SAFE), `injection`, `verifyByPhone`, required `signals`; `knownGap` = documented shortfall, counted in metrics but excused by `npm test` (and the test fails once a gap silently passes). Reader fixtures are **hand-written** until the first live run overwrites them. Replay run: 0% misuse/exfil/poison, 100% detection, 96% injection flagged, dangerous precision 96%, **FP 25% / DANGEROUS-FP 9.4% → 10 known gaps for B28**: brand claim + first-time sender flags genuine DMARC-aligned brand mail; credentials/money rules flag a requested password reset, a bank statement notice and a first utility bill; S7 fires on `(via Google Drive)` relays; S13 is English-only; callback rule covers `brand` claims only. Lab found and fixed: `BrandList.namedIn` never matched brands with a capital I (LinkedIn, IRS, ICICI — TR39 maps I→l before lower-casing), S14 missed `login.microsoftonline.com.<evil>` (genuine domain behind its own subdomain). 422 tests. |
| B14 | ☐ | |
| B15 | ☐ | |
| B16 | ☐ | |
| B17 | ☐ | |
| B18 | ☐ | |
| B19 | ☐ | |
| B20 | ☐ | |
| B21 | ☐ | |
| B22 | ☐ | |
| B23 | ☐ | |
| B24 | ☐ | |
| B25 | ☐ | |
| B26 | ☐ | |
| B27 | ☐ | |
| B28 | ☐ | |
| B29 | ☐ | |
| D01 | ☐ | v1.1 — see §12 |
| D02 | ☐ | v1.1 — see §12 |
| D03 | ☐ | v1.1 — see §12 |

---

## 12. v1.1 Distribution (after v1.0.0)

Decided 3 Oct 2026; background and costs in `DISTRIBUTION.md`. Starts only after `v1.0.0` is tagged. **Total cost: $0** (no Apple Developer Program, no Google verification).

| Block | Branch | What gets built | Hrs | Done when |
|---|---|---|---|---|
| **D01** | `chore/website` | GitHub Pages site: what mailmoat does, why it's safe, Download button (latest GitHub Release), first-launch guide with screenshots (System Settings → Privacy & Security → Open Anyway), privacy policy | 2 | Site live; download link points to the latest release |
| **D02** | `feature/desktop-app` | Electron wrapper: `server/` runs in Electron's Node, `web/` is the window; check Electron's Node supports `node:sqlite` (else swap `Database.js` only); window hardening (context isolation, sandbox, no Node in the renderer, deny navigation/new windows); optional Keychain via `safeStorage`; **ad-hoc signed** `.dmg` via the build tool; no auto-update | 4 | `.dmg` installs on a second Mac via "Open Anyway"; attack lab still passes |
| **D03** | `feature/desktop-app` | Release pipeline: GitHub Action builds the ad-hoc-signed `.dmg` on tag and attaches it to the GitHub Release; README + site link to it | 1 | Tagging `v1.1.0` publishes a downloadable `.dmg` |

**Rules:** no Swift; no notarization; no auto-update; still local-first (no mailmoat server). The Google client stays unverified and **In production** while users stay under ~80 (Google's cap is 100).

