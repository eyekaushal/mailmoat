# mailmoat

**The AI inbox assistant that phishing can't talk into anything.**

mailmoat is an open-source, local-first AI email assistant for Gmail. It labels your inbox, drafts formal replies, schedules meetings, cleans up subscriptions and answers requests in a chat. It is built so that a malicious email **cannot hijack it**, and so that phishing and business-email-compromise attempts are **caught and explained**.

> 🚧 Under active development — v1.0.0 in progress.

## How it stays safe

- **Two AIs, kept apart** (based on Google DeepMind's CaMeL): a quarantined *Reader* that reads email but has no tools, and a privileged *Planner* that plans actions but never sees raw email text.
- **Code, not prompts, makes the decisions:** deterministic signals (SPF/DKIM/DMARC, lookalike domains, link tricks, hidden text) set a risk floor the AI cannot lower, and a Policy Engine decides what may run.
- **You approve anything irreversible:** sending, calendar invites, unsubscribing.
- **Runs on your machine:** click Connect Google (mailmoat's built-in client), bring your own Anthropic API key, no mailmoat server. Distribution and costs: [`docs/DISTRIBUTION.md`](docs/DISTRIBUTION.md).

Full design: [`docs/SECURITY_APPROACH.md`](docs/SECURITY_APPROACH.md) · Product spec: [`docs/PRD.md`](docs/PRD.md)

## Status

Setup instructions, screenshots and attack-lab results will be added with the v1.0.0 release.

## License

[MIT](LICENSE)
