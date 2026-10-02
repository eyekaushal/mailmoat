# How users get and set up mailmoat

Decided on 3 Oct 2026. Plain-language record of how mailmoat reaches users, and why it costs **$0**.
Expected audience: 5–10 people. If that ever grows past ~80, read "If we ever grow" at the bottom.

## The short version

| Topic | Decision | Cost |
|---|---|---|
| Google sign-in | One shared mailmoat Google client, built into the app. Users click **Connect Google**. | $0 |
| Google verification | Not needed: Google's own rules exempt personal-use apps under 100 users. | $0 |
| Anthropic | Each user brings their own API key, with a guided setup (two flows). | user pays their own usage |
| Mac app | Later (v1.1): Electron `.dmg`, ad-hoc signed, downloaded from GitHub Releases. | $0 |
| Website | Later (v1.1): GitHub Pages. | $0 |
| Apple Developer Program ($99/year) | **Not needed.** | $0 |

**v1 (now):** shared Google client, built-in client ID, Connect Google button, guided warning screen, two Anthropic key flows.
**v1.1 (after v1.0.0):** website, Mac app, first-launch guide.

---

## 1. Google: one shared client, no verification

### What an "OAuth client" is
The client ID tells Google *which app* is asking for access. It is not the user's password and not
related to SQLite. Every "Sign in with Google" button in every app has a client behind it.

SQLite only stores what Google gives back after the user clicks Allow (a refresh token, encrypted).

### Before vs now
- **Before:** every user created their own Google Cloud project and client, then pasted the ID and
  secret into mailmoat. 10 users = 10 clients. Works, but setup is painful.
- **Now:** Kaushal creates **one** client for mailmoat. Its ID ships inside the app. Users just click
  **Connect Google → pick account → Allow**. Same feel as Happenstance.

### Is it safe to ship the client ID and secret in the app (and the public repo)?
Yes. For desktop apps Google treats the client secret as **not secret**. What actually protects the
sign-in is PKCE and the loopback redirect to `127.0.0.1`, which mailmoat already uses.

### Do we need Google verification?
**No.** Google says personal-use apps with **fewer than 100 users** can skip verification. Users click
through an "unverified app" warning instead. We expect 5–10 users.

### Setting that matters: "In production", not "Testing"
| Publishing status | Who can connect | Sign-in lasts | Use it? |
|---|---|---|---|
| Testing | only emails added as test users | **expires every 7 days** | No |
| In production (unverified) | anyone, up to 100 users | does not expire weekly | **Yes** |

So the project is set to **In production** and left unverified. If users ever get logged out every
7 days, the status has slipped back to Testing.

### The one awkward bit: the warning screen
During Connect Google, users see *"Google hasn't verified this app"*. They click **Advanced →
Go to mailmoat (unsafe)**. For a security product this looks odd, so mailmoat shows a short guided
screen *before* opening Google: why the warning appears (we're a small, free, local app; your mail
never leaves your Mac) and exactly where to click, with a screenshot.

### What does Google charge?
Nothing. The Google Cloud project, the Gmail API and the Calendar API are free at our size.

### What verification would involve (only if we ever grow)
1. **Brand check:** app name, logo, homepage, privacy policy, proof we own the domain. Free, a few days.
2. **Restricted-scope review** (Gmail is the strictest tier): written reasons, a demo video.
3. **Yearly security assessment (CASA)** by a Google-approved lab. Google itself charges nothing, but
   the lab does: about **$540/year** at the cheapest lab, up to a few thousand elsewhere.
4. Time: days for the brand check, usually **2–6+ weeks** for the rest, repeated every year.

We skip all of this while we stay under 100 users.

### Kaushal's one-time setup
1. Google Cloud Console → one project for mailmoat (the B03 project can be reused).
2. Enable the Gmail API and Google Calendar API.
3. OAuth consent screen: external, app name "mailmoat", scopes from PRD F1.5.
4. Create an OAuth client of type **Desktop app**.
5. Set publishing status to **In production**. Do **not** submit for verification.
6. Put the client ID and secret in the app's built-in config (see PRD F1.4).

---

## 2. Anthropic: users bring their own key, with two guided flows

There is no "Connect your Anthropic account" button that other apps can use for API billing, so each
user needs their own API key. We make it painless, like Happenstance's LinkedIn import guide:

- **"I have an Anthropic account":** one button opens the API keys page in the Anthropic Console, with a
  screenshot showing where to click. The user pastes the key; mailmoat tests it right away (green tick).
- **"I don't have one yet":** three numbered steps (sign up → add credits → create a key), each with a
  "Continue to Anthropic" button, plus a rough monthly cost so payment isn't a surprise.

Why not use our own key for everyone? That needs a mailmoat server, email text would leave the user's
Mac, and we would pay for everyone. Different product; not doing it.

---

## 3. Mac app: no $99 Apple account needed (v1.1)

We publish a `.dmg` on **GitHub Releases** and link it from the website. No App Store.

- The $99/year Apple Developer Program is only needed for the App Store and for *notarization*, which
  removes a one-time warning. **We skip it.**
- **First launch:** macOS says it can't verify the developer. Since macOS Sequoia there is no
  right-click → Open shortcut. Instead: **System Settings → Privacy & Security → Open Anyway**, then
  enter the Mac password. About 30 seconds, once. The website shows a 3-step guide with screenshots.
- **We must still "ad-hoc sign" the app.** Free, no account, done by the build tool. Apple Silicon Macs
  refuse to run unsigned code, and a broken signature gives a scarier "app is damaged" error.
- **No auto-update.** Electron's auto-updater needs a paid signature, so users download new versions
  from the website. Fine for 5–10 users.
- **No Swift.** Electron runs our existing JavaScript: `server/` runs inside Electron's built-in Node,
  and `web/` becomes the app window. Small adaptations only: window hardening, possibly secrets in the
  macOS Keychain, and checking that Electron's Node version supports `node:sqlite`.

## 4. Website (v1.1)
A simple GitHub Pages site (free): what mailmoat does, why it's safe, a Download button, the
first-launch guide, and a privacy policy.

---

## If we ever grow past ~80 users
- Google: complete verification (brand check + restricted-scope review + yearly assessment, ~$540/yr).
- Apple: consider the $99/year program for notarization and auto-updates.
- Neither is needed for a 5–10 person project.
