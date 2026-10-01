// Developer CLI: connect a Google account before the dashboard exists.
// Usage (repo root): npm run connect:google
import { createServer } from 'node:http';
import { join } from 'node:path';
import { Config } from '../src/config/Config.js';
import { KeyProvider } from '../src/config/KeyProvider.js';
import { SecretStore } from '../src/config/SecretStore.js';
import { Database } from '../src/db/Database.js';
import { Migrator } from '../src/db/Migrator.js';
import { SettingsRepository } from '../src/db/repositories/SettingsRepository.js';
import { CalendarClient } from '../src/google/CalendarClient.js';
import { GmailClient } from '../src/google/GmailClient.js';
import { GoogleAuth } from '../src/google/GoogleAuth.js';

const CALLBACK_PATH = '/api/google/callback';

const config = new Config(process.env);
if (!config.googleClient) {
  console.error(
    'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first (docs/setup/google-oauth.md).',
  );
  process.exit(1);
}

const db = new Database(config.databasePath);
new Migrator(db).migrate();
const secretStore = new SecretStore(db, new KeyProvider(join(config.dataDir, 'master.key')));
const redirectUri = `http://${config.host}:${config.port}${CALLBACK_PATH}`;
const googleAuth = new GoogleAuth({
  ...config.googleClient,
  redirectUri,
  secretStore,
  settings: new SettingsRepository(db),
});

const server = createServer(async (request, response) => {
  const url = new URL(request.url, redirectUri);
  if (url.pathname !== CALLBACK_PATH) {
    response.writeHead(404).end();
    return;
  }
  const reply = (status, text) =>
    response
      .writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
      .end(`mailmoat: ${text}`);
  try {
    const { email } = await googleAuth.handleCallback(Object.fromEntries(url.searchParams));
    await verifyAccess(email);
    reply(200, 'Google account connected. You can close this tab.');
  } catch (error) {
    reply(400, error.message);
    console.error(`\n✗ ${error.message}`);
    process.exitCode = 1;
  } finally {
    server.close();
    db.close();
  }
});

server.listen(config.port, config.host, async () => {
  console.log(`\nOpen this link in your browser and sign in with your TEST Gmail account:\n`);
  console.log(await googleAuth.createAuthUrl());
  console.log(`\nWaiting for Google to redirect to ${redirectUri} …`);
});

async function verifyAccess(email) {
  const profile = await new GmailClient(googleAuth).getProfile();
  const now = new Date();
  const busy = await new CalendarClient(googleAuth).freeBusy({
    timeMin: now,
    timeMax: new Date(now.getTime() + 24 * 60 * 60 * 1000),
  });
  console.log(`\n✓ Connected ${email}`);
  console.log(`✓ Gmail: ${profile.messagesTotal} messages, history ID ${profile.historyId}`);
  console.log(`✓ Calendar: ${busy.length} busy slot(s) in the next 24 h`);
  console.log(`✓ Refresh token stored encrypted in ${config.databasePath}`);
}
