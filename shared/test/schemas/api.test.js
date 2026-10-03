import { describe, expect, it } from 'vitest';
import {
  AnthropicKeySchema,
  ApprovalEditSchema,
  AuditQuerySchema,
  ChatSendSchema,
  DeleteAllSchema,
  EmailListQuerySchema,
  RulePatchSchema,
  RuleTestSchema,
  SaveMeetingSchema,
  SenderAddressSchema,
  SettingsPatchSchema,
} from '../../src/schemas/api.js';

describe('API request schemas', () => {
  it('coerces and bounds query strings', () => {
    expect(EmailListQuerySchema.parse({ limit: '20', risk: 'SAFE', label: 'to_reply' })).toEqual({
      limit: 20,
      risk: 'SAFE',
      label: 'to_reply',
    });
    expect(EmailListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(EmailListQuerySchema.safeParse({ limit: '9999' }).success).toBe(false);
    expect(EmailListQuerySchema.safeParse({ label: 'To Reply' }).success).toBe(false);
    expect(AuditQuerySchema.parse({ filter: 'policy_decision' })).toEqual({
      filter: 'policy_decision',
      limit: 100,
    });
    expect(AuditQuerySchema.safeParse({ filter: "x'; DROP" }).success).toBe(false);
  });

  it('accepts only known settings with sane values', () => {
    expect(SettingsPatchSchema.parse({ trustedSenders: [' Boss@Acme.com '] })).toEqual({
      trustedSenders: ['boss@acme.com'],
    });
    for (const bad of [
      { unknown: 1 },
      { pollIntervalSeconds: 10 },
      { workingHours: { days: [7], start: '09:00', end: '18:00' } },
      { workingHours: { days: [1], start: '9am', end: '18:00' } },
      { userName: 'x'.repeat(81) },
    ]) {
      expect(SettingsPatchSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('recognises Anthropic keys and e-mail addresses', () => {
    expect(AnthropicKeySchema.parse({ apiKey: ' sk-ant-api03-abcdefghijklmnop ' }).apiKey).toBe(
      'sk-ant-api03-abcdefghijklmnop',
    );
    expect(AnthropicKeySchema.safeParse({ apiKey: 'sk-proj-abcdefghijklmnopqrstu' }).success).toBe(
      false,
    );
    expect(SenderAddressSchema.parse({ address: 'News@Example.COM' })).toEqual({
      address: 'news@example.com',
    });
    expect(SenderAddressSchema.safeParse({ address: 'not-an-address' }).success).toBe(false);
  });

  it('requires exactly one input for a rule test and something to change in a patch', () => {
    expect(RuleTestSchema.safeParse({ raw: 'x' }).success).toBe(true);
    expect(RuleTestSchema.safeParse({ gmailId: 'abc' }).success).toBe(true);
    expect(RuleTestSchema.safeParse({}).success).toBe(false);
    expect(RuleTestSchema.safeParse({ raw: 'x', gmailId: 'abc' }).success).toBe(false);
    expect(RulePatchSchema.safeParse({}).success).toBe(false);
    expect(RulePatchSchema.safeParse({ actions: ['label', 'delete'] }).success).toBe(false);
    expect(ApprovalEditSchema.safeParse({}).success).toBe(false);
    expect(ApprovalEditSchema.safeParse({ 'drop table': 1 }).success).toBe(false);
    expect(ApprovalEditSchema.parse({ to: 'x' })).toEqual({ to: 'x' });
  });

  it('validates chat, meeting and delete-all bodies', () => {
    expect(ChatSendSchema.parse({ message: ' hi ' })).toEqual({ message: 'hi' });
    expect(ChatSendSchema.safeParse({ message: 'hi', emailId: 'has space' }).success).toBe(false);
    expect(
      SaveMeetingSchema.safeParse({
        title: 'T',
        start: '2026-10-09T10:00',
        end: '2026-10-09T10:30',
        attendees: ['a@b.co'],
      }).success,
    ).toBe(true);
    expect(
      SaveMeetingSchema.safeParse({
        title: '',
        start: '2026-10-09T10:00',
        end: '2026-10-09T10:30',
        attendees: [],
      }).success,
    ).toBe(false);
    expect(DeleteAllSchema.safeParse({ confirm: 'DELETE' }).success).toBe(true);
    expect(DeleteAllSchema.safeParse({ confirm: 'delete' }).success).toBe(false);
  });
});
