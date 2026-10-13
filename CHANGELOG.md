# Changelog

All notable changes to mailmoat are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-13

The first release. Built between 1 and 13 October 2026 from the security design in `docs/SECURITY_APPROACH.md`.

### Added

- Setup wizard: guided Anthropic key flows (with or without an account, with a cost estimate), Connect Google with mailmoat's built-in client and a guided "unverified app" screen, rule selection, first sync.
- Gmail sync every minute with history polling, a 30-day backfill of received mail and a year of sent mail (metadata only), and label changes made in Gmail reflected locally.
- Security pipeline: MIME ingest, Google-only authentication results, link extraction, hidden-text detection, 21 deterministic signals (SPF/DKIM/DMARC, look-alike domains, confusables, brand impersonation, link tricks, risky attachments, bank details, brand claims), a quarantined Reader with a strict form, and a Risk Engine in which the AI can raise risk but never lower it.
- Gmail labels for every category and for Suspicious, Dangerous and Injection attempt.
- Agent: a privileged Planner that never sees email text, tagged values with provenance, fifteen tools, an interpreter that fails closed, a Policy Engine in plain code with eight rules, approvals for anything that leaves, and an append-only audit log.
- Rules dashboard with twelve predefined rules, a test tab and history; "process past emails".
- Reply composer: write it yourself or draft with AI, save to Gmail Drafts or send for approval; mail is sent only from the Approvals page.
- Draft conversation box under every draft with `/` skills: rewrite, humanize, tone (formal, semi-formal, casual), shorter, longer, proofread, complete. One open draft per email.
- Meeting proposals from emails, conflict-checked against Google Calendar, with editable event cards.
- Ask AI side panel: senders by name, typed results rendered as email lists, summaries and cards, an answer line composed in code, editable cards.
- Bulk Unsubscribe and Block with per-sender read rates, safe one-click or mailto unsubscribe only, SSRF-checked, and outcomes shown in the row.
- Security Center with overview counts, a threat feed and a pipeline trace per email.
- Inbox as Gmail conversations with one label per row, search across Gmail and local data, a reading view with disarmed links and plain-text rendering only.
- Attack lab: 124 emails in six sets, recorded model fixtures replayed in the test suite, a release gate (0% tool misuse, exfiltration and memory poison), a report per run, and two demos (`npm run demo`, `npm run demo:ui`).
- Light design system (`docs/DESIGN.md`) with the lighthouse logo, Phosphor icons and Radix primitives.

### Security

- Reader and Drafter are tool-less and import-boundary checked; the Planner receives only typed, validated fields and opaque handles.
- Secrets encrypted at rest with AES-256-GCM; the server binds to 127.0.0.1 only, with Host, Origin and CSRF checks and a strict Content Security Policy.
- Memory writes only from user-sourced values; AI output rendered as plain text; no remote content ever loaded.
