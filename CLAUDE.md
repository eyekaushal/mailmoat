# CLAUDE.md — mailmoat

mailmoat is a local-first AI email assistant for Gmail whose selling point is security: a malicious email cannot hijack it, and phishing/BEC is detected and explained. Two AIs (quarantined **Reader/Drafter**, privileged **Planner**) plus deterministic code guards (**Signal/Risk Engine**, **Policy Engine**), based on CaMeL.

## Source of truth (in this order)
1. `docs/SECURITY_APPROACH.md` — security design; wins every conflict.
2. `docs/PRD.md` — features (F1–F14; F10 Slack is v2), stack, classes, data model, API.
3. `docs/PLAN.md` — blocks, branches, schedule; **§11 is the progress tracker**.
4. `docs/DISTRIBUTION.md` — how users get and set up mailmoat (shared Google client, guided Anthropic key, v1.1 Mac app); all $0.
Read docs by section when a block needs them; do not re-read them in full.

## Session routine
- Start: read `docs/PLAN.md §11`, continue with the first unchecked block (confirm with the user if unclear).
- Per block: implement → run tests → update the §11 tracker row → post a summary of **≤ 10 lines**: what changed, how to verify, and exactly **one `git add`, one `git commit` (Conventional Commit message), then `git push`** for the user to run. Never split a block into several commit groups.
- Read files narrowly; keep test output quiet; **no subagents** unless the user asks.
- If behind schedule, cut only from `PLAN.md §6`. Never cut core security.

## Git — hard rules
- **Never run any git command** (status, add, commit, branch, checkout, push, tag — nothing) unless the user explicitly asks for that exact command. The user runs all git by hand.
- **Never add AI attribution** anywhere: no `Co-Authored-By`, no "Generated with Claude Code", in commits, PRs, code, or docs. Kaushal is the sole author.
- Commits: Conventional Commits `type(scope): summary`. Types: `feat fix refactor test docs chore ci build perf style`. Scopes: `core config db gmail sync ingest signals reader risk lab llm planner policy actions rules drafts meetings chat unsubscribe api ui audit docs ci`.
- Branches: Conventional Branch `feature/… bugfix/… hotfix/… chore/… release/…`, lowercase-hyphenated; `main` is the trunk. Branch list is in `PLAN.md §3.1`.

## Model rule
Before any UI work (`web/`, PLAN blocks marked 🎨) stop and tell the user: **"We are starting UI now — please switch to Fable 5."**

## Commands
```bash
source ~/.nvm/nvm.sh && nvm use     # Node 24 (from .nvmrc)
npm install
npm test                            # all workspaces (Vitest)
npm run lint                        # ESLint
npm run format                      # Prettier write
```

## Code style
- **JavaScript ES modules**, Node 24. No TypeScript. JSDoc types on public classes/methods. **Zod** for all runtime validation (LLM output, API input, config).
- **OOP:** one class per file, file named after the class (`RiskEngine.js`). Small public methods; private helpers as `#private` methods. Dependencies passed through the **constructor**; objects are wired once in `server/src/main.js` (composition root). No singletons, no DI framework, no global state.
- **KISS, YAGNI:** build only what the current block needs; no speculative options, layers or abstractions. DRY only where duplicated logic must stay in sync for correctness.
- No barrel (`index.js` re-export) files; import from the source file.
- Comments explain **why**, not what.
- Errors: throw typed errors from `core/errors.js`; never swallow errors silently.
- Logging: use `Logger`; never log secrets, email bodies, subjects or addresses at `info`.
- New dependencies must be justified in the block summary.

## Security invariants — never break these
1. **Reader and Drafter** (`server/src/security/reader/`) are called **without tools**, see only the text they must read, and may not import `agent/`, `actions/`, `google/` or memory code.
2. **Planner never receives untrusted text**: no email body, subject, display name, or summary — only typed, validated fields and opaque handles.
3. Every runtime value in the agent is a **`TaggedValue`** with `sources` and `readers`; provenance survives every transformation.
4. **Only the Policy Engine** (plain code) decides ALLOW / ASK / DENY. No LLM is the final gate.
5. **AI can raise risk, never lower it** below the deterministic floor.
6. **Fail closed**: validation failure, exception or timeout → SUSPICIOUS / DENY.
7. **Memory writes** only from `user`-sourced values.
8. **Rendering:** AI output is plain text; email HTML only in the sandboxed iframe; no remote content; links disarmed.
9. **Secrets** encrypted at rest, never returned to the browser, never logged. Server binds **127.0.0.1** only, with Host/Origin and CSRF checks.
10. Any change to `security/`, `agent/`, `policy/`, prompts or rendering must keep the **attack lab** passing (0% tool-misuse / exfiltration / memory-poison).

## Testing
- Vitest. Tests live in each workspace's `test/` folder, mirroring `src/` (`server/test/unit/...`).
- Every new class gets tests; every signal/policy rule gets positive and negative cases; every bug fix gets a regression test.
- Prefer real objects with small fakes at boundaries (Gmail, Anthropic). Tests never call live APIs; live runs only via `npm run attack-lab`.

## Layout
```
shared/   Zod schemas + constants used by server and web
server/   Express API, sync, security pipeline, agent, policy, features
web/      React + Vite dashboard (UI phase, Fable 5)
docs/     PRD, PLAN, SECURITY_APPROACH, setup guides
notes/    private planning — gitignored, never reference in code
```
