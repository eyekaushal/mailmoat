import { z } from 'zod';
import { RISK_LEVELS } from '../constants/risk-levels.js';
import { RULE_ACTIONS } from '../constants/rules.js';

const GMAIL_ID = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid id');
const SLUG = z.string().regex(/^[a-z0-9_-]{1,40}$/, 'Invalid identifier');
const EMAIL_ADDRESS = z.string().trim().toLowerCase().email().max(254);
const LIMIT = z.coerce.number().int().min(1).max(500).default(50);
const DAYS = z.coerce.number().int().min(1).max(365);
const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

/** Path parameters. */
export const GmailIdParamSchema = z.object({ id: GMAIL_ID });
export const IdParamSchema = z.object({ id: z.string().min(1).max(64) });

/** Settings the UI may read and write (PRD F1.6); secrets have their own routes. */
export const SettingsSchema = z.strictObject({
  plannerModel: z.enum(['claude-opus-5-5', 'claude-sonnet-5-5']),
  drafterModel: z.enum(['claude-haiku-4-5', 'claude-sonnet-5-5']),
  pollIntervalSeconds: z.number().int().min(30).max(3600),
  autoArchiveDangerous: z.boolean(),
  trustedSenders: z.array(EMAIL_ADDRESS).max(500),
  workingHours: z.strictObject({
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    start: TIME,
    end: TIME,
  }),
  userName: z.string().trim().max(80),
  draftFooter: z.string().trim().max(500),
  meetingDurationMinutes: z.number().int().min(15).max(240),
  draftRetentionDays: z.number().int().min(1).max(90),
  wallpaper: z.enum(['tide', 'valley', 'gradient', 'none']),
});
export const SettingsPatchSchema = SettingsSchema.partial();

export const AnthropicKeySchema = z.strictObject({
  apiKey: z
    .string()
    .trim()
    .min(20)
    .max(300)
    .regex(/^sk-ant-[A-Za-z0-9_-]+$/, 'An Anthropic key starts with sk-ant-'),
});
export const AnthropicTestSchema = z.strictObject({
  apiKey: AnthropicKeySchema.shape.apiKey.optional(),
});

export const EmailListQuerySchema = z.object({
  label: SLUG.optional(),
  risk: z.enum(RISK_LEVELS).optional(),
  cursor: z.string().max(400).optional(),
  limit: LIMIT,
});
export const DraftReplySchema = z.strictObject({
  instructions: z.string().trim().max(2000).nullable().default(null),
  allowSuspicious: z.boolean().default(false),
});
export const ProposeMeetingSchema = z.strictObject({ allowRisky: z.boolean().default(false) });
export const SaveMeetingSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  start: z.iso.datetime({ offset: true, local: true }),
  end: z.iso.datetime({ offset: true, local: true }),
  attendees: z.array(EMAIL_ADDRESS).max(50),
});
export const TrustSenderSchema = z.strictObject({ trusted: z.boolean().default(true) });
export const NotPhishingSchema = z.strictObject({ notPhishing: z.boolean().default(true) });

export const RulePatchSchema = z
  .strictObject({
    enabled: z.boolean().optional(),
    actions: z.array(z.enum(RULE_ACTIONS)).max(RULE_ACTIONS.length).optional(),
  })
  .refine((patch) => patch.enabled !== undefined || patch.actions !== undefined, {
    message: 'Nothing to change',
  });
export const RuleTestSchema = z
  .strictObject({
    raw: z.string().min(1).max(2_000_000).optional(),
    gmailId: GMAIL_ID.optional(),
  })
  .refine((input) => (input.raw === undefined) !== (input.gmailId === undefined), {
    message: 'Give either raw or gmailId',
  });
export const RuleHistoryQuerySchema = z.object({
  ruleId: SLUG.optional(),
  level: z.enum(RISK_LEVELS).optional(),
  limit: LIMIT,
});
export const ProcessPastSchema = z.strictObject({ days: DAYS.default(7) });

export const ChatSendSchema = z.strictObject({
  chatId: z.string().max(64).optional(),
  message: z.string().trim().min(1).max(4000),
  emailId: GMAIL_ID.nullable().optional(),
});
export const ChatDecideSchema = z.strictObject({
  approvalId: z.string().min(1).max(64),
  action: z.enum(['approve', 'reject']),
});

/** Argument name → the user's replacement value (PRD F12.5 edit before approve). */
export const ApprovalEditSchema = z
  .record(z.string().regex(/^[a-z_]{1,40}$/), z.unknown())
  .refine((changes) => Object.keys(changes).length > 0, { message: 'Nothing to change' });

export const SenderAddressSchema = z.strictObject({ address: EMAIL_ADDRESS });
export const SenderListQuerySchema = z.object({
  since: z.iso.datetime({ offset: true }).optional(),
  sort: z.enum(['count', 'read']).default('count'),
  limit: LIMIT,
});

export const OverviewQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(7),
});
export const FeedQuerySchema = z.object({ limit: LIMIT });
export const AuditQuerySchema = z.object({
  filter: z
    .string()
    .regex(/^[a-z_]{1,40}$/)
    .optional(),
  subject: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});

export const DeleteAllSchema = z.strictObject({ confirm: z.literal('DELETE') });
