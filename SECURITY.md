# Security Policy

mailmoat's whole purpose is to be safe to point an AI at your inbox, so security reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue**. Report privately through GitHub:
**Security tab → "Report a vulnerability"** on this repository.

Include:
- what you found and its impact,
- steps or an example email that reproduces it,
- the mailmoat version or commit.

You can expect an acknowledgement within 72 hours and a status update within 7 days.

## In scope

- An email that causes any action, data leak or memory write the user did not approve (prompt injection, exfiltration, memory poisoning).
- Bypasses of the risk floors or the Policy Engine.
- Rendering-based leaks (remote content loaded, unsafe HTML or links).
- Attacks on the local app (CSRF, DNS rebinding, access from other machines) and secret exposure.

## Out of scope

- A compromised host machine or Google account.
- Phishing emails that mailmoat labels SAFE without any policy bypass. Please report these as regular issues with the email attached (redacted), so they can be added to the attack lab.

The design and threat model are documented in [`docs/SECURITY_APPROACH.md`](docs/SECURITY_APPROACH.md).
