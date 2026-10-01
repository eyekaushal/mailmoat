## What

<!-- Blocks covered (e.g. B01–B04) and a one-line summary of each. -->

## Why

<!-- PRD / SECURITY_APPROACH references (e.g. F2.1, §7.6). -->

## How to verify

<!-- Commands or steps a reviewer can run. -->

## Checklist

- [ ] `npm run lint`, `npm run format:check` and `npm test` pass locally
- [ ] Every new class has tests
- [ ] If `security/`, `agent/`, `policy/`, prompts or rendering changed: attack lab passes
- [ ] No secrets, email content or personal data in code, tests or logs
- [ ] `docs/PLAN.md` §11 tracker updated
