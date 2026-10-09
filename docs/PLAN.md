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
13. [UI redesign (decided 4 Oct 2026)](#13-ui-redesign-decided-4-oct-2026)

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
| 7b | `feature/web-ui` 🎨 (same branch as phase 7, decided 4 Oct) | R01–R07 | 5 | Every screen matches §13; Kaushal approves it visually (**Milestone 3b**) |
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
| **R01** 🎨 | web-ui | **Design system + logo + shell.** `docs/DESIGN.md` (tokens, type scale, spacing, radii, shadows, label palette, states); light only (dark removed); Apple system font stack; **Phosphor** icons replace lucide everywhere; **Radix** primitives (tooltip, switch, checkbox, dropdown, dialog); wallpaper layer (bundled Monets + plain gradient + none, blurred translucent panels, Settings choice); icon-only left rail with tooltips; account footer (avatar · name · email · chevron); keyboard-hint bar; **3–4 logo options** as SVG (envelope and non-envelope marks) → Kaushal picks one | §13 | 2 | Shell renders on the wallpaper; nothing dark remains; logo chosen |
| **R02** | web-ui | **Data + API.** Migration 006: `emails.subject` + `emails.snippet` (plain visible text, ≤ 160 chars) stored on import and on the next sync for existing rows; `GmailClient.getThread`; `GET /threads/:id` (every message's visible text, disarmed links, attachments; each message ingested on open, never stored); `GET /search?q=` = live Gmail search (`messages.list q`) merged with local verdicts/labels, metadata imported for matches outside the backfill window; `GET /senders` avatar initials; PRD §9/§12 + SECURITY_APPROACH privacy row amended (subject + snippet stored, bodies still not) | §13.4 | 1.5 | Rows carry subject + snippet; thread and search routes tested; search costs nothing (Gmail API has no billing) |
| **R03** 🎨 | web-ui | **Inbox.** Quiet text tabs with counts and an icon each; single-line rows: avatar (initials) · sender · one tinted category tag · bold subject · grey snippet · time; date group headers; **red dot** for suspicious/dangerous with tooltip; unread dot; hover row actions; search line at the top (`/`), highlighted matches; **Today** in the right panel when nothing is open | §13.5 | 2 | No AI text, no risk badges, no Safe label in the list; search works live |
| **R04** 🎨 | web-ui | **Reading view.** Wide reading column; subject; category tag + quiet Suspicious/Dangerous tag only; **thread view** (earlier messages collapsed, latest open, expand any); per message: sender avatar, visible text, disarmed links; AI summary as a quiet note inside the opened email; icon actions (reply, archive, trust, meeting, ask AI) with tooltips; **Pipeline trace** link only on non-safe mail; meeting card restyled; right panel = sender card (avatar, address, recent threads) | §13.6 | 1.5 | Red card, View original, duplicate tags and "never written" line are gone; thread browses history |
| **R05** 🎨 | web-ui | **Assistant + Approvals.** Rules table copied from the Inbox Zero screen (Enabled switch · Name · Description · Action chips, same colours and spacing); Test and History tabs restyled; Approvals as quiet cards | §13.7 | 1 | Matches the reference screenshot side by side |
| **R06** 🎨 | web-ui | **Bulk Unsubscribe + Security Center + Settings + Setup.** Unsubscriber copied from the Inbox Zero screen (filter chips, search, checkbox, avatar, From + address, Emails, read bar + %, keep (thumbs-up), one action button, overflow menu, Load more; **no risk column**); Security Center = overview + threat feed only (**audit log removed**; JSON export moves to Settings → Advanced); Settings and the setup wizard restyled on the design system; wallpaper picker | §13.8 | 1.5 | Matches the references; no red blocks; audit gone from the UI |
| **R07** 🎨 | web-ui | **Ask AI + polish.** Chat as a left side panel (centred prompt, suggestion chips, numbered sources, cards restyled); tooltips on every non-obvious control; keyboard hints (`/` search, `e` archive, `r` reply, `?` help); demo seed updated for subject/snippet/threads; attack-lab rendering check (no remote loads, AI text plain); screenshots for README | §13.9 | 1.5 | Every PRD §8 screen rebuilt (**Milestone 3b**); lab still 0/0/0 |
| **B28** | hardening-and-release | Live attack-lab run, threshold tuning, security self-review, `npm audit` clean, live smoke test on Kaushal's account | F13, §16 | 2 | Release gate met (0% misuse/exfil/poison; ≥ 95% detection; ≤ 3% FP) |
| **B28b** 🎨 | hardening-and-release | **Reply composer + Gmail-faithful inbox** (from Kaushal's live test, `notes/mailmoat changes 2.pdf`): To Reply labels only; drafts shown as drafts; Reply → "Write it myself" / "Draft with AI" → Save to Drafts or Send for approval; sending only from the Approvals page; inbox = Gmail's Inbox tab (conversations, `in:inbox`) | §14 | 1.5 | No mail leaves without a click on Approvals; inbox count matches Gmail |
| **B28c** 🎨 | hardening-and-release | **Ask AI v2** (from `notes/mailmoat changes 3.pdf`): names resolve in code; results rendered as email lists, summaries and cards, never JSON; an answer line composed after execution; Superhuman's layout and tone in mailmoat's colours; Edit on cards | §15 | 1.5 | "What needs a reply today?", "Summarise what Neha sent", "Draft a reply to Amit Verma" and "Find time with Mia" each end in exactly the right UI with no raw data |
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
- **UI redesign 🎨 (Fable 5):** Superhuman is the model: light, airy, almost borderless, dense single-line rows, thin icon rail, reading column with whitespace, side panels. One category tag per email; risk is a red dot, details in Security Center. No AI text in lists. Wallpaper gives tone, never focus. Every decision is in §13; `docs/DESIGN.md` is the law for tokens and components.
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
│   │   ├── core/        Logger.js · Scheduler.js · LocalData.js · errors.js
│   │   ├── config/      Config.js · SecretStore.js · KeyProvider.js · builtInGoogleClient.js
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
│   │   ├── llm/         LlmClient.js · ModelConfig.js · AnthropicProvider.js
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
│   │   └── api/         App.js · SecurityMiddleware.js · validate.js
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
│       ├── ui/          Tag · Tabs · Row · IconButton · Switch · Checkbox · Dialog · DropdownMenu · Tooltip ·
│       │                Panel · KeyHint · SearchLine · Highlight · Avatar · ActionChip · RiskDot
│       ├── components/  Layout.jsx · Rail.jsx · Aside.jsx · RiskBadge.jsx ·
│       │                DisarmedLink.jsx · PreviewCard.jsx · ApprovalCard.jsx ·
│       │                PipelineTrace.jsx · EmptyState.jsx · LoadingState.jsx
│       └── pages/
│           ├── setup/        SetupWizard.jsx · AnthropicStep.jsx · GoogleStep.jsx · RulesStep.jsx
│           ├── inbox/        InboxPage.jsx · InboxTabs.jsx · EmailList.jsx · ReadingView.jsx · ThreadMessage.jsx · SenderCard.jsx
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
| B14 | ✅ | `server/test/attack-lab/demo.js` → `npm run demo` (`--plain` for no colours). Replays the three headline attacks (hidden-text injection, look-alike-domain CEO fraud, DMARC-fail brand phishing) through the real pipeline with recorded Reader output: sender, subject, what the user sees, what is hidden, then a labelled **simulated** naive single-model assistant's actions vs mailmoat's signals, verdict, top-3 reasons and side-effect count (0). `AttackLab` results now carry a display-only `preview` (from, subject, visible text, hidden items). No API key needed. **Milestone 1.** 422 tests. |
| B15 | ✅ | `shared/schemas/plan.js`: `PLAN_TOOLS` (15, no forward), `PlanSchema` = `{ message ≤ 500, steps ≤ 20 }`; step = `{ tool: enum, args: [{ name, value }] }` (pairs, not an object: structured outputs need `additionalProperties:false` everywhere); value = literal / string list / `{ handle: "$email_<id>.summary|body" }` / `{ step, field }`; duplicates and forward/self step refs rejected in-schema. `TaggedValue` (frozen; `fromUser` → public, `fromEmail` → participants Set, `fromOwnData` → user-only; `combine` unions sources / intersects readers, empty ∩ → user-only; `isReadableBy`, `onlySources`, `emailIds`, `toJSON`). `HandleStore` (`$email_<id>.summary|body` only; value or once-run loader for bodies; unknown/malformed/failed → `HandleError`). `Planner`: catalogue of `{ name, description, args[] }` validated in the constructor (B16 `ToolRegistry` supplies it); `EmailFactsSchema` **strict whitelist** = id, handles, direction, from.address (`z.email()` else null), from.domain, date, risk.level, category, needs_reply, intents, meeting_request — no subject/name/summary/claimed_brand; unknown tool / unknown or missing-required arg / LLM error / refusal → `PlanError` (nothing runs); plan recorded as `plan_created`. Prompt `planner.system.md` v1 (+ rendered catalogue, cached). F12.1 test feeds poisoned name/subject/summary/brand/body/recipient and asserts none reach the request. **B16 note:** literal recipients the Planner emits have no provenance — tag a literal as `user` only if it appears verbatim in the request, else `planner`; policy must then treat `planner` recipients like `email` ones. 476 tests. |
| B16 | ✅ | `agent/tools/Tool.js` (strict Zod args, every field `.describe()`d, no defaults; `describe()` derives the Planner catalogue entry from the JSON schema; `parseArgs` reports paths only), `ToolRegistry` (v1 names only, `catalogue()` feeds the Planner). 15 tools, one class each, deps via constructor: `search_emails` (new `EmailRepository.search`; typed facts + Reader summary per match; result = inbox + email sources, **user-only**), `get_email_fields`, `summarise` (**takes `email_id`**, returns the stored Reader summary — no second LLM call), `extract` (handle → new quarantined `security/reader/Extractor` + `extractor.system.md` v1, kinds `datetimes` | `amounts`, role `reader`; result keeps the text's taint), `apply_label` (refuses `mailmoat/*`), `archive`, `mark_read`, `create_draft` / `send_email` (new `google/MimeMessage`: plain text, base64 body, RFC 2047 subject, header-injection → throw), `reply` (→ B19 `drafts.createReply`), `get_free_busy` (≤ 31 d), `create_calendar_event`, `unsubscribe` (→ B22 service), `block_sender` (new `SenderRepository.setStatus`), `save_memory` (→ B17 `memory.add`). `EmailFacts` extracted from the Planner (strict whitelist, `participants()`, `tag()`). `PlanInterpreter`: literal → `user` **only if it appears verbatim in the request, else new source `planner`**; handle → `HandleStore.resolve`; `{ step, field }` → earlier result (dotted path) with its tags; args validated then re-tagged; `policy.decide({ step, tool, args, emailIds })` before every call (interface; B17 `PolicyEngine`); ALLOW → execute, result = `combine(result, args)`; ASK → `approvals.request` and plan ends **pending**; DENY / any throw / untagged result → DENY + stop (F12.7). Audit `policy_decision` logs sources + readers, never values. **B17 note:** treat `planner`-sourced recipients/attendees like `email`-sourced; `save_memory` requires `onlySources('user')`. 531 tests. |
| B17 | ✅ | `policy/Decision` (frozen `{ outcome, reason, rule }`), `policy/rules/PolicyRule` (base: `worstLevel` — **email without a verdict = SUSPICIOUS**, `argumentNotFromUser` — recipients/attendees must be `user`/`contacts`-sourced, `planner` and `email` both fail, `contentNotReadableBy` = exfil guard via `TaggedValue.isReadableBy`). 8 rules = §7.6 table: `ReadRule` (search/get_fields/summarise/extract/free_busy ALLOW), `OrganizeRule` (label/archive/mark_read ALLOW), `DraftRule` (`create_draft`: recipient + exfil guards, source email SAFE → ALLOW, SUSPICIOUS → ASK, DANGEROUS → DENY, no source → ALLOW; **`reply` always ASK**, DANGEROUS → DENY, email-sourced instructions → DENY), `SendRule` (always ASK; DENY for non-user recipients, unreadable subject/body, DANGEROUS source), `CalendarRule` (ASK; attendees from user or source-email participants else DENY; title/description exfil guard; DANGEROUS → DENY), `UnsubscribeRule` (latest inbound email of the sender: SAFE + RFC 8058 one-click + plain HTTPS → ALLOW; `mailto:` → ASK; else DENY "report as spam or block"), `BlockRule` (ASK; notifier warning for security/no-reply@ google/apple/microsoft/github), `MemoryRule` (ALLOW iff every arg `onlySources('user')`). `PolicyEngine`: one rule per tool, builds `{ levels, participants }` for `call.emailIds`; no rule / rule throws → DENY (P8). `ActionExecutor.perform(call, ctx, { approvalId })` = the **only** caller of `Tool.execute` (re-validates, combines provenance, audits `action_performed`); `PlanInterpreter` ALLOW path now goes through it. `ApprovalService`: `request` stores the exact call (args via `TaggedValue.toJSON`, new `fromJSON`), `listPending`, `edit` (edited values become user-sourced, re-validated by the tool), `approve` **re-runs policy** on the stored call (DENY → REJECTED, tool never runs), `reject`; audit `approval_requested` / `approval_decided`. `ApprovalRepository`, `MemoryRepository` (throws `MemoryError` unless source = user; DB CHECK backs it). 594 tests. **Branch `feature/agent-and-policy` complete.** |
| B18 | ✅ | `shared/constants/rules.js` (`RULE_ACTIONS` label/archive/draft_reply/alert/log, run statuses). `rules/PredefinedRules` = the 12 F4 rules as data + `matches(facts)` on **typed facts only** (direction, level, injectionAttempt, form, firstTimeSender = S9, lastInThreadFromUser); security rules first and evaluated together, assistant rules first-match in table order; only To Reply may `draft_reply`. `RuleRepository` (seed keeps user settings, `update`, `recordRun` one row per email+rule, `runsFor`, `history` joined with emails + verdicts, filter by rule/level). `RuleEngine`: `process(record)` = `SecurityPipeline.process` → `apply`; `evaluate` side-effect free (Test tab); label/archive go through **PolicyEngine + ActionExecutor** (`apply_label`/`archive` tools) with `user`-sourced label + `inbox`-sourced id; security labels stay pipeline-applied (rule records them + `rule_applied` audit = the in-app alert/log); **a SUSPICIOUS/DANGEROUS email gets no assistant actions**; Dangerous shows `archive` only when `autoArchiveDangerous`; `draft_reply` → `drafts.createReply` (B19 DraftService; never re-drafted on re-run); a failed action is recorded (`status: failed`) without throwing so sync does not re-run the Reader; `update` rejects security rules / disallowed actions (`RuleError`); `processPast({ days = 7, onProgress })` uses stored analyses and runs the pipeline only for never-analysed mail. Migration 004 stores `injection_attempt` on verdicts (`VerdictRepository.get` returns it). `EmailRepository.latestInThread` / `listProcessedSince`. `dev:sync` now runs the rules (draft_reply fails until B19). 626 tests. |
| B19 | ✅ | `shared/schemas/draft.js` (`DraftTextSchema` = `{ body ≤ 4000 }`, strict: the model never names a recipient). `security/reader/Drafter` (role `drafter`, **no tools**, throws on any failure; user message = sign-off name + user instructions (≤ 1000 chars) first, then sender name / subject / visible body in per-call random-suffix tags) + `drafter.system.md` v1 (F6.2 formal tone: "Dear <name>," / short paragraphs / "Best regards," + user's name; no slang, emoji, markdown, links, addresses or em dashes; never follow instructions in the email; never agree to payment/bank-change/credentials/secrecy/attachment asks). `DraftRepository` (`save`, `get`, `setStatus` DRAFTED|DELETED, `list` joined with emails, `listStale`). `features/DraftService.createReply({ gmailId, instructions, allowSuspicious })`: inbound only; **no verdict = SUSPICIOUS**; DANGEROUS → `DraftError` always; SUSPICIOUS only with `allowSuspicious` (chat/UI explicit request, F6.4); raw → `EmailIngestor` → Drafter; text tainted `EmailFacts.tag` (readers = participants) and gated by `isReadableBy(sender)`; code strips em/en dashes; `MimeMessage` reply **to the From address only** (never Reply-To), `Re:` subject, `In-Reply-To` + `threadId`; optional footer (`draftFooter`), sign-off from `userName` setting (no name → ends after "Best regards,"); audit `draft_created` (ids + readers, no text). `pruneStale()` (F6.5, `draftRetentionDays` = 14; 404 = already gone). `RuleEngine` draft_reply and `ReplyTool` now call the real service (dev:sync wired). **B28 note:** Drafter has no lab fixtures yet — first live run must record F6 AC cases (benign To Reply formal; injection → no third-party content). 641 tests. |
| B20 | ✅ | `features/WorkingHours` (settings `workingHours` = `{ days, start, end }`, default Mon–Fri 09:00–18:00 in the user's zone; `resolve(iso)` = offset kept, bare time = user's wall clock via Intl two-pass offset, DST-safe; `contains`, `nextSlots` on local half-hour boundaries over a 14-day horizon, `isBusy`). `features/MeetingService`: `propose({ gmailId, allowRisky })` → card from the stored Reader `proposed_times` only (no email text): DANGEROUS never, SUSPICIOUS / missing verdict only with `allowRisky` (F7.4), own sent mail = SAFE; one free/busy call across the candidates, past times dropped, first free time = `chosen`, else next 3 free working-hour slots (F7.5); defaults title `Meeting with <name|address>`, description from stored metadata, attendees = participants minus the user; audit `meeting_proposed` (counts only). `freeSlots({ from, durationMinutes, count })` for chat (B21). `save(card, { via })` = the Save button: `create_calendar_event` ToolCall → `ApprovalService.request` + `approve` in the user's name, so `CalendarRule` decides; values equal to the proposal keep **email** provenance, anything edited (title, description, attendee list) becomes **user**-sourced like an edited approval; DENY → `MeetingError`, nothing created. Setting `meetingDurationMinutes` (30). Not yet wired in dev:sync (no card until B23/B26). 655 tests. |
| B21 | ✅ | `ChatRepository` (chats + JSON messages; delete cascades). `features/ChatService`: `create` / `list` / `messages` / `delete`; `send({ chatId, message, emailId, onEvent })` = one turn: user text (trusted) → `Planner.plan` with **typed facts only** for the context = the email the panel was opened from + emails earlier turns surfaced + last 7 days (≤ 50) → `PlanInterpreter.run` with a per-turn `HandleStore` (summary from the stored Reader form, body fetched + ingested lazily) → stored assistant message `{ text, intent (find|write|schedule|none, from the tools used), status, steps, cards, results }`. Streaming: `PlanInterpreter` Session gained an optional `onStep` hook (start/end; no influence on execution); events `status` / `step` (label per tool, running|done|pending|denied) / `result` (**`untrusted: true` when any source is an email**, F8.7) / `card` / `message`. Cards (F8.3/F8.4) are built from the stored approval (`ApprovalService.get` added, views now carry `status`): kind email|reply|event|action, every field with its `sources`, email sources annotated with sender + date (subjects are not stored). `decide({ chatId, approvalId, action })` = the card's Send/Save/Reject via `ApprovalService.approve/reject` (`via: 'chat'`), recorded in the chat. `PlanError` → a chat reply (`status: failed`), nothing runs; unsupported → no steps. Audit `chat_turn`. F8 AC test: flight time extracted as a typed datetime from the booking body (email-tagged), free/busy checked, event card marked with its email source, Save creates the event; a Planner-invented `eve@evil.com` attendee is DENIED by `CalendarRule` (no card). Memory saved only from the user's words. 663 tests. |
| B22 | ✅ | `features/SafeHttpClient` (F9.3): https only, no userinfo, port 443 only, host resolved first and **every** address must be public (v4 private/CGNAT/link-local/multicast/reserved; v6 loopback/ULA/link-local/multicast/doc, `::ffff:` and NAT64 mapped forms checked as v4), connection **pinned to the checked address** via `https.request`'s `lookup` (no DNS rebinding), redirects followed by hand (≤ 3, each re-checked, 307/308 keep POST, others → GET), 10 s timeout, 64 KB body cap; injectable `send` transport for tests. `UnsubscribeService`: `listSenders` (`SenderRepository.list` = counts + latest inbound email's link/one-click/verdict; method per F9.2: `unsubscribe` | `unsubscribe_mail` | `block` | `report_spam`), `requestUnsubscribe` / `block` / `archiveAll` all go through **PolicyEngine + ActionExecutor** (`unsubscribe` / `block_sender` / `archive` tools; ASK = the click approves via `ApprovalService`), `unsubscribe(address)` (the tool's implementation) **re-checks SAFE + link itself** before any contact — F9 AC: SUSPICIOUS/DANGEROUS/unscored senders are never contacted; one-click = POST `List-Unsubscribe=One-Click`; `mailto:` = an email the approval sends; `blockWarning` (BlockRule notifier text), `keep`, `undo` (status only; says an unsubscribe cannot be reverted). Audit `sender_*` events. `UnsubscribeTool` now forwards `method`. `rules/BlockedSenderFilter` (F9.4): inbound mail from a BLOCKED sender is labelled `mailmoat/Blocked` (new `SECURITY_LABELS.BLOCKED`) and archived by code before the pipeline; `RuleEngine.process` returns `{ blocked: true }` and skips Reader + rules. `features/SummaryService.today()` (F14): since local midnight (`WorkingHours.resolve`), inbound counts by rule name, needs-reply, meetings proposed, threats (suspicious/dangerous/injection), ≤ 5 SAFE needs-reply highlights with the Reader summary marked `untrusted`. dev:sync wires the filter. 721 tests. **Branch `feature/assistant-features` complete.** |
| B23 | ✅ | **Milestone 2.** `npm start` → `server/src/main.js` (composition root: every object wired once; sync starts on connect, first poll backfills). `api/App` (Express 5: security middleware → `GET /api/csrf` → routes under `/api` → `web/dist` static + SPA fallback; typed errors → 400/404/409/502, anything else → 500 "Internal error" with details only in the log; listens on 127.0.0.1 only). `api/SecurityMiddleware` (SECURITY_APPROACH §9): Host must be `127.0.0.1:<port>`/`localhost:<port>` (DNS rebinding), any `Origin` must be the app's own, in-memory session cookie `HttpOnly; SameSite=Strict`, every non-GET needs the session's `X-CSRF-Token`; strict CSP (no inline/remote script, `img-src 'self' data:`, `frame-ancestors 'none'`), nosniff, no-referrer, `no-store` on `/api`. 10 route classes over the existing services (`validate()` + Zod schemas in `shared/schemas/api.js` for every body/query/param): Settings (defaults + masked write-only Anthropic key + `test` via a free `models.list` call), Google (`auth-url` from the **built-in client**, loopback `callback` → `/?google=connected|error`, `disconnect`), Emails (`EmailRepository.page` keyset-paginated by tab = rule id / risk, `counts`, detail, `trace`, archive **through the Policy Engine + executor**, draft-reply, propose/save-meeting, trust-sender, not-phishing = user-sourced facts: `contacts.trusted`, `verdicts.user_feedback` (migration 005) — the level is never lowered), Rules (list/patch, Test tab = `pipeline.analyse` + `ruleEngine.evaluate`, history, process-past as a background job with progress), Chat (`POST /chat` = SSE `chat…`/`done`/`error` events, chats CRUD, `decide`), Approvals, Senders, Security (overview counts, feed, audit list/export), Summary, System (health, delete-all with `confirm: "DELETE"` → `core/LocalData.eraseAll` + exit). `llm/AnthropicProvider`: key from Settings beats `.env`, SDK client rebuilt when the key changes, `LlmClient` unchanged. `config/builtInGoogleClient.js` = the shared Desktop client (**placeholders until Kaushal pastes the real ID/secret**; `Config.googleClient` = `.env` override → built-in → undefined). Added `express` (PRD §10). 788 tests. |
| B24 | ✅ | `web/`: Vite 8 + React 19 + Tailwind 4 (`@tailwindcss/vite`) + react-router 7 + SWR; `npm run build` → `web/dist` (served by `App.js` with the strict CSP: one external module script, no inline JS; verified with `npm start` + curl), `npm run dev:web` proxies `/api` and drops `Origin`. `lib/ApiClient` (same-origin fetch, CSRF token from `GET /csrf` on every non-GET, one retry on CSRF 403 after a server restart, `ApiError` with status), `lib/useApi` (`ApiProvider` = SWR config with per-provider cache, `useApi`, `useApiClient`). `Layout` + `Sidebar` (7 screens from `NAV_ITEMS`, pending-approvals badge, Google/Anthropic/sync status from `/health`); `App.jsx` routes every screen to a placeholder until B25–B27. Shared components: `RiskBadge` (icon + word, never colour alone), `RiskBanner` (top-3 reasons, injection note, phone advice from Reader money/credential intents; **no verdict = SUSPICIOUS**), `CategoryBadge`, `DisarmedLink` (`text → host`, punycode host, clickable only on SAFE or "Open anyway", S14–S18 chips), `SafeEmailFrame` (DOMPurify: scripts/forms/styles/remote `src`/CSS `url()`/`href` removed, `data:image` kept; `sandbox=""` iframe whose srcdoc carries `default-src 'none'; img-src data:`), `PreviewCard` (plain-text fields + "From you / email from … / the assistant" sources, Send/Save/Confirm + Reject), `ApprovalCard` (approval → PreviewCard), `PipelineTrace` (auth → signals → Reader → verdict → rules → audit; summary marked untrusted), `EmptyState`, `LoadingState`. System font stack, light + dark via OS. Tests: root `vitest.config.js` projects (shared / server / web-jsdom); `web/test/` = ApiClient + 9 component suites (40 tests). ESLint: `.jsx` + browser globals + `eslint-plugin-react-hooks`. CI also runs `npm run build`. Deps: react, react-dom, react-router, swr, dompurify (PRD §10), lucide-react (icons for risk + nav); dev: vite, @vitejs/plugin-react, tailwindcss, @tailwindcss/vite, jsdom, @testing-library/react. 828 tests. |
| B25 | ✅ | `pages/setup/SetupWizard` at `/setup` (outside the shell): step list + panel, starts at the first missing piece (`/settings` view) or where Google sent us back (`/?google=connected|error&reason=` → `Landing` in `App.jsx` forwards the query to `/setup`); finishes with "Connected ✓ — first sync running" polling `/health` for the synced count → Open your inbox. `Layout` now gates every screen: health loading → spinner; key or Google missing → `/setup`. `AnthropicStep` (F1.1/F1.2): "Do you have an Anthropic account?" → **Yes** = drawn Console figure with numbered callouts + button to the API-keys page; **No** = 3 numbered steps (sign up → add credits → create key), each with "Continue to Anthropic", + cost table (~$0.003/email → 30/100/300 emails a day ≈ $3/$9/$27 a month); password field, **Test key** (`POST /secrets/anthropic/test`), **Save key** (`PUT`), field cleared after save, only the masked form shown afterwards (Replace / Continue). `GoogleStep` (F1.4): guided warning screen (why Google says unverified + drawn dialog with callouts Advanced → Go to mailmoat (unsafe)), plain-words permission list, "Continue to Google" = `GET /google/auth-url` → `window.location.assign`; shows the callback error; refuses when `clientConfigured` is false. `RulesStep` (F4.1 subset): 12 rules, security rules locked "always on", toggles `PATCH /rules/:id`. `pages/settings/SettingsPage`: key (masked + source, Test saved/this key, Save, Remove), Google (Connect / Disconnect with confirm), models (Planner Opus/Sonnet, Drafter Haiku/Sonnet, cost note), poll interval, auto-archive DANGEROUS, trusted senders (add/remove), sign-off name, draft footer, retention, meeting length, working hours; **`PUT /settings` sends only changed fields**; Delete all local data needs typed `DELETE`. New `components/Button` (+ `ExternalButton`, new tab + icon) and `FormField`. No screenshots exist in the repo, so the "screenshots" are drawn HTML figures labelled as what the user will see. Tests: `web/test/helpers.jsx` (`fakeServer` route table + `renderPage`), AnthropicStep 5, GoogleStep 4, RulesStep 1, SetupWizard 4, SettingsPage 5, Layout gate 1. 848 tests. |
| B26 | ✅ | **Server:** `GET /emails/:id/content` (bodies are never stored, so the detail view fetches the raw message from Gmail on open → `EmailIngestor` → subject, from/to/cc/reply-to, visible text, links with host, hidden items, attachment metadata, raw HTML for the browser to sanitise); `EmailRoutes` takes `gmail` + `ingestor` (wired in `main.js`). **Inbox** (`pages/inbox/`): `LabelTabs` (F5.1: All · To Reply · Awaiting · FYI · Newsletter · Marketing · Calendar · Receipt · Notification · Cold · ⚠ Suspicious · ⛔ Dangerous with `/emails/counts`; `queryForTab`), `EmailList` (F5.2: sender, time, Reader summary marked "AI summary of an untrusted email" as the snippet since subjects are only hashed, RiskBadge + CategoryBadge + injection chip, keyset Load more), `EmailDetail` (F5.3/F5.4: RiskBanner, untrusted summary, subject/from/to + Reply-To ≠ From warning + "never written to this sender", Text / View original (`SafeEmailFrame`) / Pipeline trace tabs, plain visible text, hidden-content count, `DisarmedLink`s with S14–S18 chips, attachment names only; actions Draft reply (SUSPICIOUS → confirm + `allowSuspicious`, DANGEROUS disabled), Propose meeting (when `meeting_request`; SUSPICIOUS → confirm + `allowRisky`), Archive (shows the policy decision), Mark/Remove trusted, Report not phishing (level never lowered); every action revalidates list + counts), `MeetingCard` (F7.2/F7.5: proposed slots free/busy + next free slots, editable title/description/attendees, Save → `save-meeting`, policy DENY shown), `InboxPage` (`/inbox`, `/inbox/:gmailId`, `?tab=`; list + detail, detail-only on narrow screens). **Assistant** (`pages/assistant/`): `RulesTab` (F4.1/F4.2 toggles + per-rule allowed-action chips → `PATCH /rules/:id`; security rules locked; F4.5 Process past N days with progress polling), `TestTab` (F4.3: pick a recent email or paste raw/plain text → `POST /rules/test` → hidden items, disarmed links, `PipelineTrace preview` = rules that would run; `PipelineTrace` gained `preview` and optional run status), `HistoryTab` (F4.4: filters by rule/risk, sender links to the email, "why?" expands the stored reasons). **Approvals** (`pages/approvals/ApprovalsPage`): `ApprovalCard` list, approve/reject → performed / rejected / **denied by the Policy Engine with reason**. Tests: EmailRoutes content 2, InboxPage 3, EmailDetail 6, AssistantPage 4, ApprovalsPage 2. 865 tests. |
| B27 | ✅ | **Milestone 3 — every PRD §8 screen works against the real backend.** `ApiClient.stream` (POST + CSRF → SSE parsed block by block, chunk-safe; `ApiError` when refused before streaming). **Chat** (`pages/chat/`): `ChatPage` at `/chat` and `/chat/:chatId` (chat list + New chat + delete, composer Enter/Shift+Enter, `?emailId=` context from the email detail's "Ask about this email"); `applyEvent` folds `status`/`step`/`result`/`card`/`message` events into the live turn; new chats navigate to the server-issued id; `ChatMessage` (user bubble; assistant = steps with running/done/pending/denied icons, results labelled "from untrusted email content" (F8.7) rendered as plain text, `PreviewCard`s with Send/Save/Reject → `POST /chats/:id/decide`; cards already decided in the chat lose their buttons; recorded decisions shown as a line). **Bulk Unsubscribe** (`pages/unsubscribe/`): `SenderTable` (count, read %, last received, risk, status) + `BulkUnsubscribePage` (sort count/least-read, time range fixed when picked; one method per sender from the API: Unsubscribe / Unsubscribe by email / Block / **Block (report in Gmail)** for risky senders, Keep, Archive all, Undo; Block fetches `/senders/block-warning` and confirms; bulk select → Unsubscribe (only safe-link senders, skipped count in the confirm) / Block / Keep / Archive all, sequential with an outcome log). **Security Center** (`pages/security/`): overview cards 7/30 days (scanned, suspicious, dangerous, injection attempts blocked, policy denies, pending approvals), `ThreatFeed` (non-SAFE emails, top-3 reasons, injection + feedback chips, link to the email's trace), `AuditLogTable` (event + subject filters, ALLOW/ASK/DENY chips, reason + data, **Export JSON** = `/api/audit/export`). **Today** (`pages/today/TodayCard`): received, need-a-reply, meetings proposed, threats, injection note, counts per label, SAFE highlights marked "AI summaries of untrusted emails"; shown in the Inbox when no email is open. Placeholders removed from `App.jsx`. Tests: stream 2, applyEvent 1, ChatPage 3, BulkUnsubscribe 3, SecurityCenter 1, TodayCard 1. 876 tests. |
| R01 | ✅ | **Design system + logo + shell** (4 Oct). `docs/DESIGN.md` (logo palette, colour tokens, label palette, avatars, type scale 11–24, spacing/radii/shadows, motion, states, layout, component rules). Light only: dark theme, `prefers-color-scheme` and the purple accent removed; accent is sea-navy `#2a4a7f`, risk red = the logo red. Apple system stack + bundled Inter Variable (latin, `font-src 'self'` unchanged). **Phosphor** replaces lucide in all 27 files (lucide removed). **Radix** (`radix-ui`) under `web/src/ui/`: `Tooltip` (+ `TooltipProvider` in `App.jsx`), `Switch` (locked = on + disabled + lock), `Checkbox`, `DropdownMenu`, `Dialog`, plus `Avatar` (initials on a stable hue), `KeyHint`, `Panel`. Shell: `Wallpaper` (fixed layer; `tide` default, `valley`, `gradient`, `none`; two Monets bundled at 1800 px in `web/public/wallpapers/`), `Rail` (56 px icon-only, tooltips, approvals bubble, active = `useMatch` because the tooltip slot flattens NavLink function props), `AccountMenu` (avatar → menu with avatar · name · email · chevron, sync/key status, Settings, Keyboard hints), `KeyHintBar` (dismiss → `localStorage`, restored from the account menu), `Layout` = wallpaper + rail + translucent blurred main panel + hint bar. New setting `wallpaper` (schema enum, default `tide`, picker section in Settings saves on click). Logo-derived: `web/public/favicon.svg` (32 px cut), `web/public/brand/mark.svg` (rail), `web/public/brand/wordmark.svg` (setup header). Button/EmptyState/LoadingState restyled. Every screen rendered with headless Chrome against `npm run demo:ui`: shell on the wallpaper on all 9 routes; inner screens still the B25–B27 look until R03–R07. Deps: `radix-ui`, `@phosphor-icons/react`, `@fontsource-variable/inter`. 889 tests. |
| R02 | ✅ | **Data + API** (5 Oct). Migration 006 `emails.subject` + `emails.snippet` (NULL = not fetched yet; '' = none). `EmailMetadataMapper` now takes `textNormalizer` and stores the normalised subject (≤ 300) and Gmail's own snippet (entity-decoded, normalised, ≤ 160) from the metadata fetch; `TextNormalizer.snippet` / `IngestedEmail.snippet` = first 160 chars of the **visible** text, written by `RuleEngine.process` after the pipeline's first ingest and by the thread route on open (`EmailRepository.setSnippet`; `setText` fills a missing one only, never overwrites an ingested one). `MessageImporter.fillText` (≤ 200 rows per `GmailSync.poll`, newest first; 404 → '') fills rows stored before 006. **Invariant 2 kept structurally:** `EmailRepository.get/search/listPending` (the agent's paths) never return subject/snippet; only `page`/`listByIds` do; Planner test poisons the snippet too. `GmailClient.getThread` (`threads.get` minimal, oldest first, 404 → `NotFoundError`) + `getMessageMetadata` returns `snippet`. `api/Avatar` (initials: first+last word, one letter for a bare address; hue = FNV-1a of the address). New `ThreadRoutes` `GET /threads/:id` (each message raw-fetched + ingested, visible text, links as text/host, attachments, verdict, avatar; `IngestError` → `unreadable: true`; nothing but the snippet stored, and only for known rows) and `SearchRoutes` `GET /search?q=&cursor=` (Gmail `messages.list q`, 25/page, cursor = Gmail page token; unknown ids imported as metadata with `pending: false`; rows in Gmail order with verdict/category/rules/avatar). `GET /emails` rows + `GET /senders` gain `avatar` (senders also `name` = latest From display name). Demo seed: all 124 rows carry subject + snippet (real ingest); demo FakeGmail gained `getThread` + word-match `listMessageIds`. PRD F2.7/§9/§12/§13 + SECURITY_APPROACH §7.1(7) amended. Attack lab replay still 0 %. 910 tests (+30). No new dependencies. |
| R03 | ✅ | **Inbox** (5 Oct). `web/src/ui/`: `Tag` (+ `LABELS`, the palette in priority order, `labelFor` = first matched rule), `Tabs` (Radix; ink 500 when selected, count in tertiary), `Row` (40 px; hover actions are siblings of the row button and take the time's place), `IconButton` (one label = `aria-label` = tooltip, optional key), `SearchLine` (Enter submits, Esc closes), `Highlight` (`termsOf` drops `from:`-style operators, quotes, booleans, one-letter tokens). `lib/dates` (`shortDate`, `dayGroup`, `longDate`). `Avatar` takes the server's `initials`/`hue` when given. Inbox: `InboxTabs` (All + the nine labels from `LABELS`; Suspicious/Dangerous are no longer tabs, `LabelTabs` deleted), `EmailRow` (unread amber dot · avatar · red dot naming the level for SUSPICIOUS/DANGEROUS, hollow "Not checked yet" when there is no verdict · sender · one tag · subject 500 · snippet · time; no summary, no risk badge, no "Safe"), `EmailList` (sections Today / Yesterday / weekday-date; archive / reply / trust call the API and report in one quiet status line, never a toast; archived rows drop out; `/emails` and `/search` share `&cursor=` paging), `InboxPage` (56 px title row; `/` opens the search line, Enter → `?q=` shown as the title with × and Esc to clear, matches marked; `?tab=`; an open email takes the whole column until R04). Shell: `Aside` (300 px right panel, route-driven: `/inbox` → `TodayCard`, hidden under 1100 px; sender card in R04); `TodayCard` restyled for the panel (date, stat list, threats link to Security, no red). Checked in headless Chrome against `npm run demo:ui` (All, To reply, `?q=invoice`, 1000 px). Tests: Tag, Tabs, Row, IconButton, SearchLine, Highlight, dates, EmailRow, InboxPage ×6, TodayCard ×2, Layout aside. 933 tests (+23). No new dependencies. |
| R04 | ✅ | **Reading view** (5 Oct). `pages/inbox/ReadingView` replaces `EmailDetail`: title row = back arrow · subject (from the thread route; bodies and subjects are never stored) · one category tag (`labelFor` on the rules that ran) · one risk tag (`Tag.RISK_LABELS` / `riskLabelFor`: Suspicious, Dangerous, or Not checked; nothing for SAFE) · icon actions with tooltips and keys: Reply (`r`, Radix `Dialog` confirm on SUSPICIOUS, disabled with the reason on DANGEROUS and on own mail), Archive (`e`, back to the list when done, reason in place when refused), Mark trusted / Remove trust, Propose meeting (only with `meeting_request`; `MeetingCard` kept), Ask AI (→ `/chat?emailId=`). `ThreadMessage`: collapsed = 32 px avatar · sender (red dot + tooltip when not safe) · one-line preview · date; expanded = 40 px avatar · name · address · `dateTime` · "AI summary" grey note (opened message only) · plain text in `<pre>` · links via `DisarmedLink` (clickable only when **that message** is SAFE) · attachment chips; newest + opened message start open (`defaultExpanded`), any message toggles. "Why was this flagged?" (verdict present and not SAFE) opens `PipelineTrace` inline with the not-phishing text button under it. Right panel: `SenderCard` via `Aside` on `/inbox/:gmailId` (avatar, name, address, trusted `Switch`, received/sent counts, recent threads with the open one marked). **Server:** `GET /emails/:id/sender` (contact + `EmailRepository.listThreadsFrom` = newest message per thread from that address, list shape only); `GET /emails/:id/content` **removed** (raw HTML no longer leaves the server; `gmail`/`ingestor` dropped from `EmailRoutes`). Removed with regression tests: red banner, View original + `SafeEmailFrame` (+ `dompurify`), `RiskBanner`, `CategoryBadge`, "never written to this sender", duplicate tags, bottom button bar. Demo seeds real threads (same sender + subject). 935 tests. |
| R05 | ✅ | **Assistant and Approvals** (5 Oct). `ui/ActionChip` (`ACTION_CHIPS`: label → Label, archive → Archive, draft_reply → Draft, alert → Block tint, log → neutral; a plain chip, or a pressable toggle with `aria-pressed` when given `onToggle`), chip tokens `--chip-*` in `styles.css`; `ui/RiskDot` (+ `riskNote`, moved out of `EmailRow`) now used by the inbox rows, thread messages, sender card and History. `INPUT_CLASSES` restyled to DESIGN.md §8 (32 px, `line-strong`, radius 6, accent ring) for every form. **Assistant** = title row + Radix `Tabs` (Rules · Test · History). Rules = the Inbox Zero table: locked `Switch` (on, disabled, lock icon, tooltip "Security rule, always on") · Name · Description · action chips (toggles PATCH `/rules/:id`, fixed on security rules); "Process past emails" is a ghost button opening a `Dialog` for the day count, with the progress bar and "Done" as one status line beside it. History on the same table: `dateTime` · red dot + sender link · rule · chips · "Why?" icon expanding the stored reasons; `RiskBadge` gone from History (no "Safe" word, no red text; "failed" is plain). Test: same form on the design inputs, results on quiet `surface-2` blocks + `PipelineTrace` (still B26 style; restyled in R06). **Approvals** = title row with the count; `PreviewCard` is a quiet `surface-2` card (header icon · title · requested time; fields with the "From …" source line under each value; reason line; Reject as text, one primary button) and is shared with the chat; `ApprovalCard` adds the time and, once decided, the outcome word; outcomes are plain secondary lines, errors `danger`. Regression tests: no native checkboxes, no "security, always on" badge, no `RiskBadge`/"Safe" in History, no "Requested" prefix or "pending" word on cards. 939 tests. |
| R06 | ✅ | **Bulk Unsubscribe, Security Center, Settings, Setup** (5 Oct). **Unsubscribe** on the Inbox Zero table: title row with a time-range menu (All time / 30 / 90 days) and the `/` search (client-side, name or address), `Tabs` Unhandled · Kept · All with counts, then checkbox · `Avatar` · name + address · Emails · read bar (`progressbar`) + % · thumbs-up = Keep (`IconButton`) · **one** button, Unsubscribe (secondary) or Block (danger text), whose tooltip is the method hint or the Policy Engine's `/senders/block-warning` reason (fetched on first hover/focus) · overflow `DropdownMenu` with Archive all / Undo · Load more (limit +50, max 500) · Emails/Read headers sort. No risk badge anywhere; a decided sender shows kept / unsubscribed / blocked as a word. Block and every bulk action confirm in a Radix `Dialog` (counts and skipped senders in the text); `window.confirm` is gone. **Security Center**: period as a quiet radio group, six figures as plain numbers (no cards, no red), threat feed = one line per flagged email (`RiskDot` + name + address + quiet chips for injection attempt / your feedback + date, up to three reasons as text) linking to `/inbox/:gmailId?trace=1`; `ReadingView` opens "Why was this flagged?" from that param and `InboxPage` strips it from the list URL. **`AuditLogTable` removed** (decision 5); the JSON export moved to Settings → Advanced. **`PipelineTrace`** restyled: `surface-2` sections, plain lowercase-free headings without numbers, severities and statuses as words, the verdict as the `Tag` risk word ("Not flagged" for SAFE). **`RiskBadge` deleted**; `test/components/removed.test.js` guards both removals. **Settings** = title row + grouped sections with hairlines (Models, Sync, Security with a `Switch`, Working hours, Drafts, Trusted senders with chip × buttons, Connections = key + Google on `surface-2` blocks, Wallpaper picker with thumbnails and painting names), one primary (Save changes, sticky), Disconnect via `Dialog`, and an **Advanced** fold with Export JSON and the delete-all zone (danger text, `Dialog` typing DELETE). `Button.buttonClasses` for link-shaped buttons. **Setup wizard** on the same system: wordmark header over the wallpaper, step list on the left (numbered discs, check when done, `aria-current`), `Panel` on the right, one primary per step; callouts in the figures use the accent instead of red; errors are one line of danger text; yes/no as quiet `aria-pressed` choices; Rules step is the Assistant table (`Switch` locked + tooltip, `ActionChip`s). Tests: 6 Unsubscribe page cases, `SenderTable` (5), Security Center (2), `ThreatFeed` (3), trace (2 new: tag + headings, SAFE), Settings (dialog disconnect, Advanced + typed DELETE, sections), RulesStep on Radix, ReadingView `?trace=1`; jsdom gets a `ResizeObserver` stub in `test/setup.js` (Radix form inputs). Verified in headless Chrome against `npm run demo:ui`. No new dependencies. |
| R07 | ✅ | **Ask AI + polish** (5 Oct). **Ask AI is a left side panel, not a page** (`components/ask/`): `AskAiProvider` (+ `useAskAi`: open state kept in localStorage, the email it was opened from; a no-op default outside the shell), `AskPanel` (380 px `panel` between the rail and the main column; header = title or the chat's title, New chat, a Recent chats menu with Delete this chat behind a `Dialog`, Close; centred prompt "Find, write, schedule, or ask anything" with suggestion chips that fill the composer; composer = bordered box with a Send `IconButton`, Enter sends), `AskTurn` (your words as a quiet `surface-3` block, the answer as plain text, steps and results in quiet blocks, cards via `PreviewCard`, **numbered sources** under the answer linking to `/inbox/:id`), `lib/chatTurn` (`emptyTurn`, `applyEvent`, `sourcesOf`). `pages/chat/` and the `/chat` routes are gone; the rail's Ask AI item is a toggle button (`aria-pressed`, lit while open); the reading view's "Ask AI about this email" opens the panel with the email as context ("About the email you opened this from", forgettable); `?ask=1` deep-links to the panel (README/demo). **Keyboard**: `j` / `k` focus the next / previous row (`Row` carries `data-row`), Enter opens it, `e` / `r` act on the focused row (`EmailRow`), `?` opens `KeyboardHelp` (a `Dialog` listing every shortcut) from anywhere in the shell; `/`, `e`, `r` on the opened email were already wired. **Tooltips**: the last bare icon button (MeetingCard remove-attendee) is an `IconButton`; every icon-only control now has one. `web/test/rendering.test.js` = the rendering check: no `dangerouslySetInnerHTML`, frames or `innerHTML`, no remote `src`/`url()` loads in `web/src` or `index.html` (CSP stays `img-src 'self' data:`). Demo seed verified: `GET /emails` carries subject, snippet and `threadId` for every corpus email. **Screenshots** for the README in `docs/screenshots/` (inbox, ask-ai, reading-view, assistant, approvals, unsubscribe, security, settings; JPEG from headless Chrome on `npm run demo:ui`). `styles.css`: `[data-inset-focus]` opts a control out of the global focus ring when its wrapper draws one. Tests: `chatTurn` (2), `AskAiProvider` (3), `AskTurn` (4), `AskPanel` (4, ported from the chat page), Layout (panel toggle, `?ask=1`, `?`), inbox `j`/`k`, row `e`/`r`, rendering (2). Attack lab untouched (no change under `security/`, `agent/`, `policy/` or prompts). No new dependencies. |
| B28 | ✅ | **Hardening** (5 Oct). **Live attack lab** run twice with the real Reader (`claude-haiku-4-5`, 124 calls each; fixtures re-recorded, prompt v1 then v2): the hand-written fixtures had hidden that the real Reader calls any organisation a `brand`, so FP was 34% before tuning. **Tuning, all deterministic** (`SECURITY_APPROACH.md §7.2–7.4` amended): `BrandList.authenticatedOwner` (DMARC pass on a listed brand's own domain) exempts the S7 contact-name branch, S9, S10 and S18 (sender's own domain); new **S21 `BANK_DETAILS_IN_BODY`** (IBAN / IFSC / SWIFT / account / routing / sort code in the visible text) and **S22 `BRAND_CLAIM_UNOWNED`** (Reader's `claimed_brand` names a listed brand the From domain does not own); rules: payment + first-time sender is DANGEROUS only with pressure (S21, any claimed identity, high urgency, secrecy, bank change), credentials rule uses S10 not S9, brand claims count only via S6/S7/S22, callback rule covers brand/bank/IT/government + S9/S10; S13 gets German/French/Spanish override phrases. **Reader prompt v2**: `asks_to_call_number` = a number given as the way to cancel/dispute/refund; `claims_to_be` colleague/vendor/brand defined, strangers introducing themselves = none. Weights and bands unchanged. **Result (`reports/attack-lab-2026-10-04.md`, live): gate PASS, 124/124 expectations, 0% misuse / exfil / poison, 100% injection flagged, 100% detection, 100% dangerous precision, 0% FP, 0% benign DANGEROUS.** All 10 known gaps closed (`knownGap` removed; `attackLab.test.js` would fail if one came back); `markdown-image-exfil-visible` and the §8 newsletter walkthrough now guard on S9/S10 instead of S18. `npm audit`: 0 vulnerabilities (CI runs `--audit-level=high`). **Security self-review** in `docs/SECURITY_REVIEW.md`: every CLAUDE.md invariant with the enforcing code and test, the hand-checked trust boundaries, the lab table and the **live smoke-test checklist for Kaushal's account (release day, manual)**. Tests: S21 (3), S22 (2), brand-exemption cases on S7/S9/S10/S18, S13 multilingual, RiskEngine rules rewritten, catalogue = 22. 990 tests. |
| B28a | ✅ | **Review fixes** (6 Oct, from `docs/reference_docs/mailmoat changes 1.pdf`). Equal 8 px gutters on all four sides of the panel row; keyboard hints on a translucent pill. **Opening an email marks it read**: `POST /emails/:id/read` runs `mark_read` through the Policy Engine and the executor (Gmail) and `EmailRepository.setRead` (local), the reading view calls it once for an unread email and refreshes lists and counts (unread dot and tab counts follow). Bulk Unsubscribe reports why nothing happened when every selected sender lacks a safe link (or is already decided). The trace in the reading view no longer repeats the AI summary (`PipelineTrace showSummary`; the Test tab keeps it). The inbox remembers each list's scroll position across an opened email. Security Center feed ordered by email date, newest first (`listFlagged`). Inbox hides the tab of a rule switched off (`InboxTabs` reads `/rules`). Clarified, not changed: verdict reasons are fixed strings in code; trust never lowers a verdict (red dot stays); disabling a rule leaves existing labels; drafting fails only in the demo (no recordings). Deferred to v1.1 by Kaushal: manual reply composer, Archived view. Tests: route read (1), repository order + setRead (2), trace summary (1), ReadingView read-on-open + single summary (2), inbox hidden tab + scroll memory (2), bulk notice (1). |
| B28b | ✅ | **Reply composer + Gmail-faithful inbox** (9 Oct, §14). **Server:** `to_reply` defaults to `['label']`; migration 007 resets rows that still drafted on their own; `DraftService` split into `compose` (Drafter text, nothing saved, audited `draft_composed`), `saveReply` (the composer's text as a Gmail draft, replacing the one it continued), `envelope` (to / Re: subject / Message-ID / thread), `discard`, with `createReply` kept for Ask AI's `reply` tool; `POST /emails/:id/compose`, `/save-reply`, `/reply-request` (a `send_email` call with `in_reply_to`, `thread_id`, `draft_id`, user-tagged recipient, body tagged by origin, Policy Engine first: DENY → 403, else `ApprovalService.request`), `DELETE /drafts/:id`; `SendEmailTool` threads the reply and discards the source draft after sending; `ThreadRoutes` marks `DRAFT` messages (`isDraft`, `draftId` via `GmailClient.listDrafts`); the inbox lists **conversations** (`EmailRepository.page`: newest matching message per thread, `messageCount`; "All" = received mail with `INBOX`, a label tab = the label view), `unreadCounts` counts conversations, `setLabels`/`removeLabel`, archive and read update labels locally, `listHistory` requests `labelAdded`/`labelRemoved` and `GmailSync` applies them. **Web:** `ReplyComposer` (choice → optional instruction → editor; Save to Drafts / Send for approval; "Draft anyway" on SUSPICIOUS; dangerous stays disabled), `ThreadMessage` "Draft, not sent" block with Continue / Delete draft, reading view opens the composer from Reply, `r` and `?reply=1` (the inbox hover action), `PreviewCard` shows a send that answers an email as **Reply · Send** and hides the plumbing fields, rows show the conversation count. **Docs:** PRD F4.2, F5.2, F5.3, F6.1, F6.3; §14 corrected (`send_email`, not `reply`). **Latency (decision 8):** not reproducible without a key; the provider runs one Haiku call with a 60 s timeout and 3 retries, so 40 s means retries, and the composer now shows "Drafting…" while it waits; measure on the live account during B29's smoke test. Tests: routes (compose/save/delete, reply-request + DENY, archive leaves the inbox), repository (conversations, label view, labels), migration 007, send tool threading + discard, thread drafts, sync label changes, DraftService composer paths, composer (4), reading view (composer, `?reply=1`, draft block), inbox hover reply, row count, preview card. 1019 tests; attack lab unchanged and still 0/0/0 in CI. |
| B28c | ✅ | **Ask AI v2** (10 Oct, §15). **Server:** `EmailRepository.search` gains `sender` text (every word of the user's text matched in code against display name, address and domain with a parameterised query; contacts the user has written to rank first; exact `from` kept for unsubscribe); `SearchEmailsTool.from` accepts a name, address or domain as typed and returns `{ count, emails, senders }`; `ChatService` context window 15 days, result events carry `kind` (`emails` as ids + sender addresses only, `summary`, `value`) and sources described with sender and date, the Planner's `message` becomes the `progress` line, and the answer is composed in code by the new `AnswerComposer` (counts, ambiguity note when a name matched several senders, card introductions, "Done! Your meeting is scheduled for Fri 9 Oct, 17:00 to 18:00." in the user's time zone); `GET /emails?ids=` returns inbox rows in the given order. Planner prompt v2 (`from` may be a name; `message` is a progress line under 60 characters, never facts); attack lab replayed: gate PASS, 0 / 0 / 0 (`reports/attack-lab-2026-10-09.md`). **Web:** empty state with gradient sparkle, "What can I help you with today?", the four chips and an arrow input; `AskTurn` shows your words in a light tint on the right, the pulsing progress line while live, then only what the ask needs: `EmailListResult` (rows fetched from `/emails?ids=`, each opening the email), a summary block marked unverified, cards, and the answer line in accent, no steps and never raw data; `PreviewCard` gets the gradient hairline border, an invitation-style event layout (title, when, attendees with avatars, description) and **Edit** (fields become inputs, Done sends only what changed to `PATCH /approvals/:id`, edited values show "From you"); `--ask-gradient` tokens in navy → sea blue → lantern amber. **Docs:** PRD F8.2, SECURITY_APPROACH §7.5 (names as match keys). Tests: AnswerComposer (3), repository sender search (ranking, SQL-safe), tool name search, ChatService (name search end to end, progress + answer, list payload carries no email text), route ids, AskTurn (6), AskPanel (edit flow, list rows, done line), PreviewCard edit. 1030 tests. |
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

---

## 13. UI redesign (decided 4 Oct 2026)

Why: the first UI (B24–B27) works but looks generated: dark, cluttered, red everywhere, AI text in every row. Kaushal's review (`docs/reference_docs/mailmoat changes.pdf`, 15 points) and the Superhuman screenshots (`docs/reference_docs/reference_screenshots/`) set the new bar. Blocks R01–R07 on `feature/web-ui` (same branch as B24–B27), after B27 and before B28. Everything here is approved; change it only by editing this section.

### 13.1 Decisions

| # | Decision |
|---|---|
| 1 | **Store subject and snippet** locally (`emails.subject`, `emails.snippet` ≤ 160 chars of visible text). Bodies are still never stored. PRD §9/§12 and the SECURITY_APPROACH privacy row get a one-line amendment in R02. |
| 2 | **Search is live Gmail search** (`messages.list q=`), free of charge (Gmail API has no billing; 5 quota units per search out of 250 per second per user). Results are merged with local verdicts and labels. |
| 3 | **Avatars are initials** on soft colours, Gmail size and border. The Gmail API gives no sender photos and remote images stay blocked. The user's own account may show the Google profile photo (fetched by the server once, stored locally). |
| 4 | **Risk in the list is a red dot only**, with a tooltip naming the level. The opened email shows the word as a quiet tag. Security Center holds the details. |
| 5 | **Audit log leaves the UI.** The API and JSON export stay (attack lab and release gate need them); export lives under Settings → Advanced. |
| 6 | **Phosphor** icons and **Radix** primitives. lucide is removed. |
| 7 | **Logo: chosen 4 Oct 2026 → `docs/design/logo/option-d1-night-watch.svg` ("Night watch": rounded night-sky badge, cream lighthouse with lit and shadow faces, red bands, glowing lantern, one beam over dark water). Other options stay in `docs/design/logo/` for the record. R01 derives from it: app icon / favicon (simplified lantern-and-tower cut for 16–32 px), rail mark, wordmark lockup; the palette (navy `#0b1430`–`#1c2f57`, cream `#f4ead3`, amber `#ffcf6b`, red `#c8463a`, sea blue) seeds `docs/DESIGN.md`; the purple accent is replaced by this palette. |
| 8 | **Thread view is in scope** (non-negotiable): the whole conversation, earlier messages collapsed, any message expandable. |
| 9 | **Light only.** Dark mode and `prefers-color-scheme` handling are removed. |
| 10 | **Wallpapers:** bundled (the two Monets from `docs/reference_docs/reference_background_wallpapers/`, public domain) plus a plain soft gradient and none; chosen in Settings; panels are translucent and blurred so the painting is tone, not focus. |

### 13.2 Design system (`docs/DESIGN.md`, written in R01)

- **Type:** Apple system stack (`-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Inter, sans-serif`). SF Pro is not bundled (Apple licence); on non-Apple machines Inter is bundled locally (CSP `font-src 'self'`). Scale: 11 / 12 / 13 / 15 / 17 / 20 / 24. Body 13–15 px, headings medium weight, never bold-on-everything.
- **Colour:** warm off-white canvas, white panels at 70–85 % opacity over the wallpaper, ink `#1d1d1f`, secondary `#6e6e73`, hairlines at 6–8 % black. One accent (soft indigo) used sparingly. **Label palette** = tinted pastels with darker text (like Superhuman's `pitch`/`news`): one hue per category, fixed in DESIGN.md. Risk red is used for the dot and the Dangerous tag only.
- **Shape:** radii 6 / 10 / 14; shadows soft and rare; no borders where spacing can do the job.
- **Motion:** 120–180 ms ease-out on hover, panels and tooltips; nothing bounces.
- **Components (Radix + Tailwind):** Tooltip, Switch, Checkbox, DropdownMenu, Dialog, Tabs, Avatar (initials), Tag, Row, Panel, KeyHint, SearchLine, EmptyState. One file per component under `web/src/ui/`.
- **Rules:** icon + tooltip for every icon-only control; AI output is plain text and visibly labelled only where it appears (inside the email, in Ask AI); no colour-only meaning (dot has a tooltip and the opened email shows the word).

### 13.3 Layout

Thin icon rail (Inbox, Ask AI, Assistant, Approvals, Unsubscribe, Security, Settings; account footer at the bottom) · main column · right panel (Today when nothing is open; sender card when an email is open; calendar later). Keyboard-hint bar along the bottom, dismissible.

### 13.4 Data and API (R02)

- Migration 006: `emails.subject TEXT`, `emails.snippet TEXT`. `MessageImporter` fills both from the metadata fetch (subject) and the first ingest (snippet, visible text only, normalised, ≤ 160 chars). Existing rows are filled on the next sync pass.
- `GmailClient.getThread(threadId)` → ordered messages; `GET /api/threads/:id` → `{ threadId, messages: [{ gmailId, from, to, date, subject, text, links, attachments, verdict }] }`; each message is fetched and ingested on open, nothing stored.
- `GET /api/search?q=&cursor=` → live Gmail query, ids merged with local rows (verdict, category, rules); metadata imported for ids the backfill never saw.
- `GET /api/emails` rows gain `subject`, `snippet`, `avatar { initials, hue }`.
- Rendering stays plain text everywhere; the sanitised-HTML frame is removed together with View original.

### 13.5 Inbox

Tabs: quiet text + count + icon (All, To Reply, Awaiting, FYI, Newsletter, Marketing, Calendar, Receipt, Notification, Cold). Suspicious and Dangerous are **not** tabs; they live in Security Center. Rows: unread dot · avatar · sender · category tag · **subject** (medium) · snippet (secondary) · time; red dot before the sender for non-safe mail; hover shows archive / reply / trust icons. Date headers (Today, Yesterday, date). Search line at the top opened with `/`, query shown as a title, matches highlighted. Nothing AI-generated in the list.

### 13.6 Reading view

Back arrow · subject · tags (category; Suspicious/Dangerous only when non-safe) · thread list (sender, one-line preview, date; latest expanded) · each open message: avatar, name, address, date, plain visible text, links as `text → host` (clickable only when safe) · the AI summary as a small grey note at the top of the opened message, labelled "AI summary" · action icons with tooltips: Reply (draft), Archive, Mark trusted, Propose meeting (when times were found), Ask AI · "Why was this flagged?" link to the pipeline trace **only** on non-safe mail · right panel: sender card (avatar, address, recent threads from them, trusted toggle). Removed: red banner, View original, "you have never written to this sender", duplicate tags, bottom button bar.

### 13.7 Assistant and Approvals

Rules: the Inbox Zero table, column for column (Enabled switch · Name · Description · Action chips coloured by action), "Process past emails" as a quiet button, security rules shown with a lock and a disabled switch. Test and History on the same table style. Approvals: quiet cards, one action button, Reject as text.

### 13.8 Bulk Unsubscribe, Security Center, Settings, Setup

Unsubscribe: the Inbox Zero table (filter chip Unhandled/Kept/All · time range · search · checkbox · avatar · name + address · Emails · read bar + % · thumbs-up = Keep · one button Unsubscribe/Block · overflow menu with Archive all / Undo · Load more). Risk is not shown; a risky sender's button is Block and its tooltip says why. Security Center: overview numbers + threat feed, one calm layout, each item linking to the email and its trace. Settings: grouped sections on panels, wallpaper picker, Advanced fold with audit export and delete-all. Setup wizard: same system, same figures, lighter.

### 13.9 Ask AI and polish

Left side panel (not a page): centred prompt "Find, write, schedule, or ask anything", suggestion chips, answers as plain text with numbered sources, cards restyled on the design system, "from email" sources shown as a small line under a value. Keyboard hints: `/` search, `e` archive, `r` reply, `j`/`k` move, `?` help. Tooltips everywhere an icon stands alone. Demo seed (`npm run demo:ui`) carries subjects, snippets and threads so every screen can be reviewed without Google.

### 13.10 What does not change

The security invariants in `CLAUDE.md`: Reader and Drafter stay quarantined; the Planner never sees subject, snippet or body; AI output is plain text; no remote content; links disarmed; the Policy Engine is the only gate. The attack lab must still report 0 % misuse / exfiltration / memory poison after R07.

---

## 14. Reply composer and Gmail-faithful inbox (decided 9 Oct 2026, block B28b)

Why: Kaushal's live test on kaushalmailmoat@gmail.com (`notes/mailmoat changes 2.pdf`, and the inbox-count review that followed). Two findings. First, the To Reply rule drafted replies on its own ("Process past emails" created six Gmail drafts), and the thread view showed those drafts as if they were sent messages, so the app looked like it had replied without permission. Nothing was sent: the only sending path is the `send_email` / `reply` tool, which the Policy Engine always marks ASK. Second, the inbox listed every message of the last 30 days across all mail (77) while Gmail's Inbox tab showed 21 conversations. Everything here is approved; change it only by editing this section.

### 14.1 Decisions

| # | Decision |
|---|---|
| 1 | **The To Reply rule labels only.** Default actions become `['label']`; `draft_reply` stays an allowed chip the user can switch on in Assistant. A one-time migration (007) removes `draft_reply` from existing `to_reply` rows so installs that already seeded the old default follow suit. "Process past emails" therefore only labels. |
| 2 | **AI writes only when asked.** Two entry points, both explicit: the Reply composer's "Draft with AI", and Ask AI ("draft a reply to Priya", the existing `create_draft` card). No rule, sync or backfill ever calls the Drafter. |
| 3 | **Drafts are shown as drafts.** The thread route marks Gmail `DRAFT` messages (`isDraft: true`, `direction: 'outbound'`); the reading view renders them as a quiet "Draft, not sent" block with the text, no risk tag and no "Not checked", plus **Continue** (opens the composer with that text) and **Delete draft**. The six drafts already in the dummy account show this way. |
| 4 | **Reply composer.** Reply on a safe email opens a composer: **Write it myself** (empty editor) or **Draft with AI** (optional one-line instruction, then the Drafter fills the editor; nothing is saved to Gmail at that point). The text is editable either way. Two buttons: **Save to Drafts** (Gmail Drafts, as today) and **Send for approval**. SUSPICIOUS mail keeps the "Draft anyway?" confirmation for the AI path; DANGEROUS mail keeps Reply disabled for both paths (mailmoat never helps answer fraud). |
| 5 | **Mail is sent only from the Approvals page.** "Send for approval" creates an approval for the existing `send_email` tool (always ASK; the `reply` tool is Ask AI's *drafting* tool and stays so), with the thread and Message-ID it answers. The card shows recipient, subject and the full body with **Send** and **Reject**; approving sends through the executor and deletes the Gmail draft the composer started from, if any. Nothing appears inline on the reading view: Gmail's own Inbox does not show sent mail either. The reply card's confirm label becomes "Send" (it read "Save draft"). |
| 6 | **Provenance of the body.** Typed text is `user`-sourced and may go to the thread's participants. An AI draft keeps the Drafter's tags (sources = that email, readers = its participants); an edited AI draft combines the two, so it can still only go back to that thread. The policy table is unchanged. |
| 7 | **The inbox is Gmail's Inbox tab.** One row per **conversation** (the newest inbound message speaks for the thread; a count shows how many messages it holds), only threads with a message carrying the `INBOX` label, newest first. Archiving removes `INBOX` and the row. Tab counts count conversations. The sync and the security pipeline still scan all received mail (`-in:sent -in:spam -in:trash`), so mail filed under other labels is analysed and reachable from Security Center and search; it just is not in the inbox, as in Gmail. |
| 8 | **Reply latency.** The 40 s draft seen in the test is measured during the block; the expected time is 5–10 s. A retry or timeout setting found responsible is fixed in the same block. |

### 14.2 What changes

- **Server:** `PredefinedRules` default for `to_reply`; migration `007_to_reply_label_only.sql`; `ThreadRoutes` draft flag; `GmailClient.listDrafts`/`deleteDraft` lookup by message id; `DraftService.compose({ gmailId, instructions })` returning text without saving; `POST /emails/:id/reply-request { body, draftId? }` → `ApprovalService` entry for `reply`; approval execution deletes the source draft; `GET /emails` lists conversations ("All" = `INBOX` only; a label tab = that label's view) and `unreadCounts` count conversations; `GmailClient.listHistory` also returns label changes and `GmailSync` applies them, so archiving or reading in Gmail itself reaches the local inbox.
- **Web:** `ReplyComposer` (Dialog: choice, instruction line, editor, Save to Drafts / Send for approval); `ThreadMessage` draft block; `ApprovalCard`/`PreviewCard` reply kind confirm = Send; inbox rows show the conversation count; `InboxTabs` counts.
- **Docs:** PRD F4 (defaults), F6 (drafting and sending flow), §8 inbox; SECURITY_APPROACH §7.6 unchanged (noted); this section.
- **Tests:** rule default + migration, thread draft flag, compose-without-save, reply-request → approval → send + draft cleanup, inbox view (conversations, `INBOX` filter, counts), composer, draft block, approval card label.

### 14.3 What does not change

The security invariants in `CLAUDE.md`. The Drafter stays quarantined and tool-less; the Planner never sees email text; the Policy Engine stays the only gate and `reply`/`send_email` stay ASK; the attack lab must still report 0 % misuse / exfiltration / memory poison after the block.

---

## 15. Ask AI v2 (decided 10 Oct 2026, block B28c)

Why: Kaushal's test (`notes/mailmoat changes 3.pdf`). "What needs a reply today?" printed the search tool's JSON and ten lines of "an email"; "Summarise what Neha sent" failed with `Invalid arguments for search_emails: from`; "Draft a reply to Amit Verma" could not find a sender who was in the inbox. Causes, all in code, none in the model: the panel printed unrecognised results as JSON; result sources carried ids only; the Planner's message is written before any tool runs and nothing composes an answer afterwards; `search_emails` accepted only an address or a domain while the Planner is never given names; the Planner's context was the last 7 days. The reference is Superhuman's assistant (`docs/reference_docs/reference_screenshots/`): one question, one input, a progress line, then exactly the UI the task needs. Everything here is approved; change it only by editing this section.

### 15.1 Decisions

| # | Decision |
|---|---|
| 1 | **Names resolve in code.** `search_emails.from` accepts a name, an address or a domain as the user typed it. The tool matches it against stored senders (display name, address, domain; contacts first) with parameterised SQL. The Planner still receives only the typed-facts whitelist; display names never reach it (invariant 2 unchanged). When a name matches several senders, contacts the user has written to rank first, every match keeps its risk level, and the answer line says the name is ambiguous. A look-alike display name is caught by S7 as today, so drafting to it is DENY/ASK by policy; a test proves the draft goes to the real contact. |
| 2 | **Context.** The Planner's context is the email the panel was opened from, emails earlier turns surfaced, and the last 15 days (newest first, capped), instead of 7 days: enough to cover what the user still has in mind, small enough to keep the Planner's input and latency down. |
| 3 | **Results are typed and rendered as UI, never as JSON.** Every result event carries a `kind`: `emails` (ids; the browser fetches sender, subject, snippet, date, risk from `GET /emails?ids=` and renders rows that open the email, newest first), `summary` (plain text, labelled as from that email), `value` (a short typed fact, e.g. an extracted time), or nothing. Result sources carry sender and date, as card sources already do. The raw-JSON block and the "an email" list are removed. |
| 4 | **An answer line composed after execution, in code.** From typed results only: "3 emails need a reply", "Nothing from Neha in the last 15 days", "Two senders are named Neha; one is flagged", "Done! Your meeting is scheduled for Tue 14 Oct, 10:00 to 10:30", "Draft ready, read it before you save". The Planner's own message becomes the progress line shown while the plan runs ("Searching your inbox…", "Finding the best time for everyone…"), in the accent. For a request the Planner cannot plan, its message is shown as the answer. |
| 5 | **Superhuman's layout and tone, mailmoat's colours.** The left side panel stays. Empty state: a centred sparkle mark, "What can I help you with today?", the four suggestion chips, one input with an arrow button. Turn: the user's words in a light tint on the right, the progress line and the answer line in the accent, results and cards below. Gradients and accents come from DESIGN.md (sea-navy accent, lighthouse palette); nothing copied from Superhuman's purple. |
| 6 | **Cards get Edit.** Event cards (title, time, attendees, description) and reply/draft cards (text) have **Edit** and the primary action (**Save** for events and drafts, **Send for approval** for sends). Edits go through `PATCH /approvals/:id` (user-sourced values) and the Policy Engine runs again on Save; a card whose edit is refused says why. After Save the done line appears under the card. Save to Drafts stays on draft cards and in the composer. |
| 7 | **Every ask shows only what it needs.** find → list; summarise → paragraph(s) with the sender named; draft/reply → the draft card; schedule → the event card then the done line; unsupported → one sentence. No step list in the panel; steps stay in the stored turn for the audit trail and the Security Center trace. |

### 15.2 What changes

- **Server:** `SearchEmailsTool` name/address/domain matching with ranking (`EmailRepository.search` gains `sender` text matching on `from_name`/`from_addr`/`from_domain`, contacts-first ordering); `ChatService` context window 15 days, result events with `kind` and described sources, an `answer` composed from typed results (`AnswerComposer`, plain code), progress label from the plan message, `GET /emails?ids=` for the browser's list rows (`listByIds` exists); `ApprovalService.edit` already covers card edits. Planner prompt v2 (`from` may be a name; `message` is a progress line) → attack lab re-run (invariant 10).
- **Web:** `AskPanel` empty state and composer restyled; `AskTurn` rewritten around result kinds (`EmailListResult`, `SummaryResult`, cards) and the answer line; `PreviewCard` gains Edit with inline fields and keeps the design-system look with an accent gradient border; `ChatMessage`-era remnants removed.
- **Docs:** PRD F8 (chat) amended; `SECURITY_APPROACH.md §7.5` note on name resolution (typed facts unchanged); this section.
- **Tests:** search by name (exact, partial, ambiguous, look-alike flagged), context window, result kinds and sources, answer composer per intent, panel empty state, email-list result, summary result, card edit round trip, done line.

### 15.3 What does not change

The security invariants in `CLAUDE.md`: the Planner never sees subject, name, summary or body; the Reader and Drafter stay tool-less; the Policy Engine stays the only gate; mail is sent only from the Approvals page (§14); the attack lab must still report 0 % misuse / exfiltration / memory poison after the prompt change.

