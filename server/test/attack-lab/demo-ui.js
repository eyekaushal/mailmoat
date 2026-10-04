// Demo dashboard: the whole web UI on the attack-lab corpus, with no Google account, no Anthropic
// key and nothing written to disk. The 124 corpus emails run through the real pipeline (recorded
// Reader output), the rules, labels and audit log are real; Gmail and Calendar are in-memory fakes.
// Live LLM calls (chat, drafting) have no recordings, so they fail closed and the UI shows that.
// From the repo root:  npm run build && npm run demo:ui   → http://127.0.0.1:4747
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActionExecutor } from '../../src/actions/ActionExecutor.js';
import { ApprovalService } from '../../src/actions/ApprovalService.js';
import { PlanInterpreter } from '../../src/agent/PlanInterpreter.js';
import { Planner } from '../../src/agent/Planner.js';
import { TaggedValue } from '../../src/agent/TaggedValue.js';
import { ApplyLabelTool } from '../../src/agent/tools/ApplyLabelTool.js';
import { ArchiveTool } from '../../src/agent/tools/ArchiveTool.js';
import { BlockSenderTool } from '../../src/agent/tools/BlockSenderTool.js';
import { CreateCalendarEventTool } from '../../src/agent/tools/CreateCalendarEventTool.js';
import { CreateDraftTool } from '../../src/agent/tools/CreateDraftTool.js';
import { ExtractTool } from '../../src/agent/tools/ExtractTool.js';
import { GetEmailFieldsTool } from '../../src/agent/tools/GetEmailFieldsTool.js';
import { GetFreeBusyTool } from '../../src/agent/tools/GetFreeBusyTool.js';
import { MarkReadTool } from '../../src/agent/tools/MarkReadTool.js';
import { ReplyTool } from '../../src/agent/tools/ReplyTool.js';
import { SaveMemoryTool } from '../../src/agent/tools/SaveMemoryTool.js';
import { SearchEmailsTool } from '../../src/agent/tools/SearchEmailsTool.js';
import { SendEmailTool } from '../../src/agent/tools/SendEmailTool.js';
import { SummariseTool } from '../../src/agent/tools/SummariseTool.js';
import { ToolRegistry } from '../../src/agent/tools/ToolRegistry.js';
import { UnsubscribeTool } from '../../src/agent/tools/UnsubscribeTool.js';
import { App } from '../../src/api/App.js';
import { SecurityMiddleware } from '../../src/api/SecurityMiddleware.js';
import { ApprovalRoutes } from '../../src/api/routes/ApprovalRoutes.js';
import { ChatRoutes } from '../../src/api/routes/ChatRoutes.js';
import { EmailRoutes } from '../../src/api/routes/EmailRoutes.js';
import { GoogleRoutes } from '../../src/api/routes/GoogleRoutes.js';
import { RuleRoutes } from '../../src/api/routes/RuleRoutes.js';
import { SecurityRoutes } from '../../src/api/routes/SecurityRoutes.js';
import { SenderRoutes } from '../../src/api/routes/SenderRoutes.js';
import { SettingsRoutes } from '../../src/api/routes/SettingsRoutes.js';
import { SummaryRoutes } from '../../src/api/routes/SummaryRoutes.js';
import { SystemRoutes } from '../../src/api/routes/SystemRoutes.js';
import { AuditLog } from '../../src/audit/AuditLog.js';
import { Logger } from '../../src/core/Logger.js';
import { Database } from '../../src/db/Database.js';
import { Migrator } from '../../src/db/Migrator.js';
import { ApprovalRepository } from '../../src/db/repositories/ApprovalRepository.js';
import { AuditLogRepository } from '../../src/db/repositories/AuditLogRepository.js';
import { ChatRepository } from '../../src/db/repositories/ChatRepository.js';
import { ContactRepository } from '../../src/db/repositories/ContactRepository.js';
import { DraftRepository } from '../../src/db/repositories/DraftRepository.js';
import { EmailRepository } from '../../src/db/repositories/EmailRepository.js';
import { MemoryRepository } from '../../src/db/repositories/MemoryRepository.js';
import { RuleRepository } from '../../src/db/repositories/RuleRepository.js';
import { SenderRepository } from '../../src/db/repositories/SenderRepository.js';
import { SettingsRepository } from '../../src/db/repositories/SettingsRepository.js';
import { VerdictRepository } from '../../src/db/repositories/VerdictRepository.js';
import { ChatService } from '../../src/features/ChatService.js';
import { DraftService } from '../../src/features/DraftService.js';
import { MeetingService } from '../../src/features/MeetingService.js';
import { SafeHttpClient } from '../../src/features/SafeHttpClient.js';
import { SummaryService } from '../../src/features/SummaryService.js';
import { UnsubscribeService } from '../../src/features/UnsubscribeService.js';
import { PolicyEngine } from '../../src/policy/PolicyEngine.js';
import { BlockRule } from '../../src/policy/rules/BlockRule.js';
import { CalendarRule } from '../../src/policy/rules/CalendarRule.js';
import { DraftRule } from '../../src/policy/rules/DraftRule.js';
import { MemoryRule } from '../../src/policy/rules/MemoryRule.js';
import { OrganizeRule } from '../../src/policy/rules/OrganizeRule.js';
import { ReadRule } from '../../src/policy/rules/ReadRule.js';
import { SendRule } from '../../src/policy/rules/SendRule.js';
import { UnsubscribeRule } from '../../src/policy/rules/UnsubscribeRule.js';
import { BlockedSenderFilter } from '../../src/rules/BlockedSenderFilter.js';
import { PredefinedRules } from '../../src/rules/PredefinedRules.js';
import { RuleEngine } from '../../src/rules/RuleEngine.js';
import { SecurityPipeline } from '../../src/security/SecurityPipeline.js';
import { Drafter } from '../../src/security/reader/Drafter.js';
import { Extractor } from '../../src/security/reader/Extractor.js';
import { Reader } from '../../src/security/reader/Reader.js';
import { RiskEngine } from '../../src/security/risk/RiskEngine.js';
import { RiskRules } from '../../src/security/risk/RiskRules.js';
import { SignalCatalog } from '../../src/security/signals/SignalCatalog.js';
import { SignalEngine } from '../../src/security/signals/SignalEngine.js';
import { ContactHistoryBuilder } from '../../src/sync/ContactHistoryBuilder.js';
import { EmailMetadataMapper } from '../../src/sync/EmailMetadataMapper.js';
import { realIngestor } from '../helpers/securityFixtures.js';
import { AttackLab } from './AttackLab.js';
import { FakeGmail } from './FakeGmail.js';
import { FixtureLlmClient } from './FixtureLlmClient.js';

const PORT = Number(process.env.PORT ?? 4747);
const HOST = '127.0.0.1';
const here = dirname(fileURLToPath(import.meta.url));
const WEB_DIST = join(here, '../../../web/dist');
const SPREAD_MINUTES = 55; // corpus emails are spaced this far apart, newest first, ending now

const logger = new Logger({ level: process.env.LOG_LEVEL ?? 'warn' });
const db = new Database(':memory:');
new Migrator(db).migrate();
const settings = new SettingsRepository(db);
const emails = new EmailRepository(db);
const verdicts = new VerdictRepository(db);
const contacts = new ContactRepository(db);
const senders = new SenderRepository(db);
const ruleRepository = new RuleRepository(db);
const auditRepository = new AuditLogRepository(db);
const auditLog = new AuditLog(auditRepository);

const lab = new AttackLab({ corpusDir: join(here, 'corpus'), fixtures: null, logger });
const persona = lab.loadPersona();
const userEmail = () => persona.address;
const timeZone = persona.timeZone;
settings.set('userName', 'Kaushal');

// --- Fakes in place of Google and Anthropic ---------------------------------------------------
let counter = 0;
class DemoGmail extends FakeGmail {
  async createDraft() {
    return { id: `demo-draft-${++counter}` };
  }
  async deleteDraft() {}
  async sendMessage() {
    return { id: `demo-sent-${++counter}` };
  }
}
const gmail = new DemoGmail({ record() {} });
const calendar = {
  freeBusy: async () => [],
  createEvent: async () => ({
    id: `demo-event-${++counter}`,
    htmlLink: 'https://calendar.google.com/',
  }),
};
const googleAuth = {
  isConnected: () => true,
  connectedEmail: () => persona.address,
  createAuthUrl: async () => `http://${HOST}:${PORT}/?google=connected`,
  handleCallback: async () => {},
  disconnect: async () => ({ revoked: false }),
};
const anthropic = {
  isConfigured: () => true,
  masked: () => 'sk-ant-…demo',
  source: () => 'settings',
  setKey() {},
  clearKey() {},
  test: async () => ({ ok: true }),
};
const fixtures = new FixtureLlmClient({ dir: join(here, 'fixtures'), mode: 'replay' });
const llm = fixtures;

// --- The real pipeline, policy, actions and features -----------------------------------------
const ingestor = realIngestor();
const pipeline = new SecurityPipeline({
  gmail,
  ingestor,
  reader: new Reader({ llm, logger }),
  signalEngine: new SignalEngine({ signals: new SignalCatalog().create(), logger }),
  riskEngine: new RiskEngine(new RiskRules()),
  contacts,
  verdicts,
  settings,
  auditLog,
  readerModel: 'attack-lab-replay',
  timeZone,
  logger,
});
const policy = new PolicyEngine({
  rules: [
    new ReadRule(),
    new OrganizeRule(),
    new DraftRule(),
    new SendRule(),
    new CalendarRule(),
    new UnsubscribeRule({ emails, verdicts }),
    new BlockRule(),
    new MemoryRule(),
  ],
  emails,
  verdicts,
  logger,
});
const drafts = new DraftService({
  gmail,
  ingestor,
  drafter: new Drafter({ llm }),
  emails,
  verdicts,
  repository: new DraftRepository(db),
  settings,
  auditLog,
  logger,
});
const lateDeps = {};
const registry = new ToolRegistry([
  new SearchEmailsTool({ emails, verdicts }),
  new GetEmailFieldsTool({ emails, verdicts }),
  new ExtractTool({ extractor: new Extractor({ llm }) }),
  new SummariseTool({ emails, verdicts }),
  new ApplyLabelTool({ gmail }),
  new ArchiveTool({ gmail }),
  new MarkReadTool({ gmail }),
  new CreateDraftTool({ gmail }),
  new SendEmailTool({ gmail }),
  new ReplyTool({ emails, drafts }),
  new GetFreeBusyTool({ calendar }),
  new CreateCalendarEventTool({ calendar }),
  new UnsubscribeTool({
    unsubscribes: { unsubscribe: (address) => lateDeps.unsubscribes.unsubscribe(address) },
  }),
  new BlockSenderTool({ senders }),
  new SaveMemoryTool({ memory: new MemoryRepository(db) }),
]);
const executor = new ActionExecutor({ registry, auditLog });
const approvals = new ApprovalService({
  approvals: new ApprovalRepository(db),
  registry,
  policy,
  executor,
  auditLog,
});
const interpreter = new PlanInterpreter({
  registry,
  policy,
  executor,
  approvals,
  auditLog,
  logger,
});
const planner = new Planner({ llm, tools: registry.catalogue(), auditLog, logger });
const predefined = new PredefinedRules();
const ruleEngine = new RuleEngine({
  pipeline,
  blocked: new BlockedSenderFilter({ senders, gmail, auditLog }),
  rules: predefined,
  repository: ruleRepository,
  emails,
  verdicts,
  policy,
  executor,
  drafts,
  settings,
  auditLog,
  logger,
  timeZone,
});
const unsubscribes = new UnsubscribeService({
  http: new SafeHttpClient(),
  emails,
  verdicts,
  senders,
  gmail,
  policy,
  executor,
  approvals,
  auditLog,
  logger,
  timeZone,
});
lateDeps.unsubscribes = unsubscribes;
const chatRepository = new ChatRepository(db);
const chats = new ChatService({
  planner,
  interpreter,
  approvals,
  emails,
  verdicts,
  gmail,
  ingestor,
  repository: chatRepository,
  auditLog,
  logger,
  timeZone,
});
const meetings = new MeetingService({
  calendar,
  emails,
  verdicts,
  approvals,
  settings,
  auditLog,
  userEmail,
  timeZone,
});
const summary = new SummaryService({
  emails,
  verdicts,
  rules: ruleRepository,
  predefined,
  timeZone,
});

// --- Seed: the corpus through the real pipeline and rules -------------------------------------
for (const contact of persona.contacts) {
  contacts.recordSent(contact.address, new Date('2026-06-01T09:00:00Z'), contact.name);
}
const history = new ContactHistoryBuilder(contacts, senders, userEmail);
const mapper = new EmailMetadataMapper();
// Drafting needs a live model, so To Reply only labels while seeding.
ruleRepository.update('to_reply', { actions: ['label'] });

// Interleaved deterministically so the inbox mixes benign mail and attacks like a real one.
const cases = lab
  .loadCases()
  .map((entry, index) => ({ entry, key: (index * 2654435761) % 4294967296 }))
  .sort((a, b) => a.key - b.key)
  .map(({ entry }) => entry);
const now = Date.now();
let seeded = 0;
for (const [index, entry] of cases.entries()) {
  // Route params only accept [A-Za-z0-9_-]; spread the mail over the last few days so Today and
  // the 7-day overview have something to show.
  const gmailId = `${entry.set}-${entry.name}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 64);
  const internalDate = new Date(now - index * SPREAD_MINUTES * 60_000);
  gmail.addMessage({ id: gmailId, raw: entry.raw, internalDate });
  if (index % 3 === 0) await gmail.modifyLabels(gmailId, { remove: ['UNREAD'] });
  const message = await gmail.getRawMessage(gmailId);
  const record = mapper.toRecord({
    id: message.id,
    threadId: message.threadId,
    labelIds: message.labelIds,
    internalDate: message.internalDate,
    headers: entry.headers,
  });
  emails.insertIfAbsent(record, { pending: true });
  history.record(record);
  fixtures.beginCase(entry.id);
  try {
    await ruleEngine.process(record);
    seeded += 1;
  } catch (error) {
    logger.warn('demo seed: case failed', { id: entry.id, error: error.name });
  }
  emails.markProcessed(gmailId, internalDate);
}
ruleRepository.update('to_reply', { actions: ['label', 'draft_reply'] });
// Anything after this point has no recording: the chat's Planner and the Drafter fail closed.
fixtures.beginCase('demo/live');

// --- Seed: things waiting for the user, and one chat ------------------------------------------
const safeItems = emails.page({ level: 'SAFE', limit: 200 }).items;
const knownSafe =
  safeItems.find((item) => item.fromAddr === 'rahul@acme-corp.com') ?? safeItems[0] ?? null;
const participants = knownSafe ? [knownSafe.fromAddr, persona.address] : [persona.address];
const fromEmail = (value) =>
  knownSafe
    ? TaggedValue.fromEmail(value, { id: knownSafe.gmailId, participants })
    : TaggedValue.fromUser(value);

await approvals.request({
  call: {
    step: 1,
    tool: 'send_email',
    emailIds: knownSafe ? [knownSafe.gmailId] : [],
    args: {
      to: TaggedValue.fromUser(['rahul@acme-corp.com']),
      subject: TaggedValue.fromUser('Re: launch timeline'),
      body: TaggedValue.fromUser(
        'Dear Rahul,\n\nThank you for the update. Friday works for me; I will send the deck beforehand.\n\nBest regards,\nKaushal',
      ),
    },
  },
  reason: 'Sending email always needs your approval.',
});
const eventStart = new Date(now + 2 * 86_400_000);
eventStart.setHours(15, 0, 0, 0);
const eventEnd = new Date(eventStart.getTime() + 30 * 60_000);
const eventApproval = await approvals.request({
  call: {
    step: 3,
    tool: 'create_calendar_event',
    emailIds: knownSafe ? [knownSafe.gmailId] : [],
    args: {
      title: TaggedValue.fromUser('Launch strategy with Rahul'),
      start: fromEmail(eventStart.toISOString()),
      end: fromEmail(eventEnd.toISOString()),
      attendees: TaggedValue.fromUser(['rahul@acme-corp.com']),
      description: TaggedValue.fromUser('Proposed in chat.'),
    },
  },
  reason: 'Calendar events always need your approval.',
});

const chatId = 'demo-chat';
const chatAt = new Date(now - 10 * 60_000);
chatRepository.create({ id: chatId, title: 'Find time with Rahul after my flight', at: chatAt });
chatRepository.addMessage({
  chatId,
  role: 'user',
  content: { text: 'Find 30 minutes with Rahul to talk launch strategy, after my flight lands.' },
  at: chatAt,
});
const describeSource = (source) =>
  source.type === 'email' && knownSafe
    ? { ...source, from: knownSafe.fromAddr, date: knownSafe.date }
    : source;
const eventView = approvals.get(eventApproval.id);
chatRepository.addMessage({
  chatId,
  role: 'assistant',
  content: {
    text: 'Your flight lands at 13:40, so I looked after that. Rahul is free at 15:00 in two days; here is the event. Nothing is created until you save it.',
    intent: 'schedule',
    status: 'pending',
    steps: [
      { step: 1, tool: 'search_emails', label: 'Searching inbox…', status: 'done' },
      { step: 2, tool: 'get_free_busy', label: 'Checking calendar…', status: 'done' },
      { step: 3, tool: 'create_calendar_event', label: 'Creating event…', status: 'pending' },
    ],
    results: [
      {
        step: 1,
        tool: 'search_emails',
        value: knownSafe
          ? [
              {
                from: { address: knownSafe.fromAddr },
                date: knownSafe.date,
                risk: { level: 'SAFE' },
                summary:
                  verdicts.readerForm(knownSafe.gmailId)?.summary ?? 'Flight booking confirmation.',
              },
            ]
          : [],
        untrusted: true,
        sources: [],
      },
    ],
    cards: [
      {
        approvalId: eventApproval.id,
        kind: 'event',
        tool: 'create_calendar_event',
        reason: eventView.reason,
        fields: Object.fromEntries(
          Object.entries(eventView.args).map(([name, arg]) => [
            name,
            { value: arg.value, sources: arg.sources.map(describeSource) },
          ]),
        ),
      },
    ],
  },
  at: new Date(chatAt.getTime() + 8_000),
});

const firstNewsletter = senders.list({ sort: 'count', limit: 50 }).find((s) => s.level === 'SAFE');
if (firstNewsletter) senders.setStatus(firstNewsletter.address, 'KEPT');

// --- Serve ------------------------------------------------------------------------------------
const app = new App({
  security: new SecurityMiddleware({ port: PORT }),
  routes: [
    new SettingsRoutes({ settings, anthropic, googleAuth, googleClientConfigured: true, auditLog }),
    new GoogleRoutes({
      googleAuth,
      clientConfigured: true,
      onConnected: async () => {},
      onDisconnected: async () => {},
      auditLog,
      logger,
    }),
    new EmailRoutes({
      emails,
      verdicts,
      rules: ruleRepository,
      contacts,
      audit: auditRepository,
      policy,
      executor,
      drafts,
      meetings,
      gmail,
      ingestor,
      auditLog,
      timeZone,
    }),
    new RuleRoutes({ ruleEngine, pipeline, emails, gmail, logger }),
    new ChatRoutes({ chats }),
    new ApprovalRoutes({ approvals, timeZone }),
    new SenderRoutes({ unsubscribes }),
    new SecurityRoutes({ verdicts, audit: auditRepository, approvals }),
    new SummaryRoutes({ summary }),
    new SystemRoutes({
      version: 'demo',
      googleAuth,
      anthropic,
      syncState: { getLastPollAt: () => new Date() },
      emails,
      deleteAllData: async () => setTimeout(() => process.exit(0), 100),
    }),
  ],
  host: HOST,
  port: PORT,
  staticDir: WEB_DIST,
  logger,
});
await app.listen();
console.log(`mailmoat demo → http://${HOST}:${PORT}`);
console.log(
  `  ${seeded}/${cases.length} corpus emails analysed · ${approvals.listPending().length} approvals waiting · chat "${chatRepository.get(chatId)?.title ?? chatId}"`,
);
console.log(
  '  Google and Anthropic are fakes; chat and drafting fail closed (no recordings). Ctrl+C to stop.',
);
