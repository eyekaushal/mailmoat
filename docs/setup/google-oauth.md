# Connect Google (Gmail + Calendar)

mailmoat runs on your machine and talks to Google with **your own** OAuth client, so no third party ever holds access to your mail. Setup takes about 10 minutes.

## 1. Create the Google Cloud project

1. Open [console.cloud.google.com](https://console.cloud.google.com) → project picker → **New project** → name `mailmoat` → **Create**.
2. **APIs & Services → Library** → enable **Gmail API** and **Google Calendar API**.

## 2. Configure sign-in

1. **Google Auth Platform → Get started**: app name `mailmoat`, your support email, audience **External**, your contact email → **Create**.
2. **Audience → Test users → Add users**: add every Gmail address you will connect.

> **Testing vs production:** while the app is in *Testing* status, Google expires your sign-in after **7 days** and you must reconnect. For long-term personal use, choose **Publish app** on the Audience page; Google then shows an "unverified app" warning on the consent screen, which is expected for a personal OAuth client.

## 3. Create the OAuth client

1. **Clients → Create client** → type **Desktop app** → name `mailmoat local` → **Create**.
2. Copy the **Client ID** and **Client secret** into `.env` in the repository root (never into `.env.example`):

```
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
```

## 4. Connect

```bash
nvm use
npm run connect:google
```

Open the printed link, sign in, and allow **all** requested permissions. mailmoat refuses partial permissions instead of half-working.

## Permissions requested, and why

| Scope | Used for |
|---|---|
| `openid`, `email` | Knowing which account is connected |
| `gmail.modify` | Reading mail, applying labels, archiving, creating drafts and sending **after your approval** |
| `calendar.events` | Creating a meeting **after your approval** |
| `calendar.freebusy` | Seeing when you are busy, to propose free slots |

Not requested: permanent mail deletion (`mail.google.com`), Gmail settings or filters, Drive and Contacts.

## Security notes

- Sign-in uses PKCE and a one-time `state` value that expires after 10 minutes, and the redirect goes only to `127.0.0.1`.
- Only the refresh token is stored, encrypted with AES-256-GCM under a key file readable only by your user (`~/Library/Application Support/mailmoat/master.key` on macOS).
- To disconnect, use **Settings → Disconnect** in the app, or revoke access at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
