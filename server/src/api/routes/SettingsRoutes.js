import { Router } from 'express';
import {
  AnthropicKeySchema,
  AnthropicTestSchema,
  SettingsPatchSchema,
} from '@mailmoat/shared/schemas/api';
import { validate } from '../validate.js';

/** Defaults the UI sees until the user changes something (PRD F1.6, F6, F7). */
const DEFAULTS = Object.freeze({
  plannerModel: 'claude-opus-5-5',
  drafterModel: 'claude-haiku-4-5',
  pollIntervalSeconds: 60,
  autoArchiveDangerous: false,
  trustedSenders: [],
  workingHours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
  userName: '',
  draftFooter: '',
  meetingDurationMinutes: 30,
  draftRetentionDays: 7,
});

/**
 * Setup wizard and Settings (PRD F1, §13). Secrets are write-only: the Anthropic key is stored
 * encrypted and only ever read back masked (F1.2).
 */
export class SettingsRoutes {
  #deps;

  /**
   * @param {{
   *   settings: import('../../db/repositories/SettingsRepository.js').SettingsRepository,
   *   anthropic: import('../../llm/AnthropicProvider.js').AnthropicProvider,
   *   googleAuth: Pick<import('../../google/GoogleAuth.js').GoogleAuth, 'isConnected'|'connectedEmail'>,
   *   googleClientConfigured: boolean,
   *   auditLog: Pick<import('../../audit/AuditLog.js').AuditLog, 'record'>,
   * }} deps
   */
  constructor(deps) {
    this.#deps = deps;
  }

  router() {
    const router = Router();
    router.get('/settings', (_request, response) => response.json(this.#view()));
    router.put('/settings', (request, response) => {
      const patch = validate(SettingsPatchSchema, request.body);
      for (const [key, value] of Object.entries(patch)) this.#deps.settings.set(key, value);
      this.#deps.auditLog.record({
        actor: 'user',
        event: 'settings_updated',
        data: { keys: Object.keys(patch) },
      });
      response.json(this.#view());
    });
    router.put('/secrets/anthropic', (request, response) => {
      const { apiKey } = validate(AnthropicKeySchema, request.body);
      this.#deps.anthropic.setKey(apiKey);
      this.#deps.auditLog.record({ actor: 'user', event: 'secret_updated', subject: 'anthropic' });
      response.json(this.#view().anthropic);
    });
    router.delete('/secrets/anthropic', (_request, response) => {
      this.#deps.anthropic.clearKey();
      this.#deps.auditLog.record({ actor: 'user', event: 'secret_removed', subject: 'anthropic' });
      response.json(this.#view().anthropic);
    });
    router.post('/secrets/anthropic/test', async (request, response) => {
      const { apiKey } = validate(AnthropicTestSchema, request.body ?? {});
      response.json(await this.#deps.anthropic.test(apiKey));
    });
    return router;
  }

  #view() {
    const { settings, anthropic, googleAuth, googleClientConfigured } = this.#deps;
    const stored = settings.all();
    const values = {};
    for (const key of Object.keys(DEFAULTS)) values[key] = stored[key] ?? DEFAULTS[key];
    return {
      settings: values,
      anthropic: {
        configured: anthropic.isConfigured(),
        masked: anthropic.masked(),
        source: anthropic.source(),
      },
      google: {
        clientConfigured: googleClientConfigured,
        connected: googleAuth.isConnected(),
        email: googleAuth.connectedEmail() ?? null,
      },
    };
  }
}
