import { describe, expect, it } from 'vitest';
import { ToolError } from '../../../../src/core/errors.js';
import { TaggedValue } from '../../../../src/agent/TaggedValue.js';
import { ApplyLabelTool } from '../../../../src/agent/tools/ApplyLabelTool.js';
import { ArchiveTool } from '../../../../src/agent/tools/ArchiveTool.js';
import { BlockSenderTool } from '../../../../src/agent/tools/BlockSenderTool.js';
import { CreateCalendarEventTool } from '../../../../src/agent/tools/CreateCalendarEventTool.js';
import { CreateDraftTool } from '../../../../src/agent/tools/CreateDraftTool.js';
import { ExtractTool } from '../../../../src/agent/tools/ExtractTool.js';
import { GetEmailFieldsTool } from '../../../../src/agent/tools/GetEmailFieldsTool.js';
import { GetFreeBusyTool } from '../../../../src/agent/tools/GetFreeBusyTool.js';
import { MarkReadTool } from '../../../../src/agent/tools/MarkReadTool.js';
import { ReplyTool } from '../../../../src/agent/tools/ReplyTool.js';
import { SaveMemoryTool } from '../../../../src/agent/tools/SaveMemoryTool.js';
import { SearchEmailsTool } from '../../../../src/agent/tools/SearchEmailsTool.js';
import { SendEmailTool } from '../../../../src/agent/tools/SendEmailTool.js';
import { SummariseTool } from '../../../../src/agent/tools/SummariseTool.js';
import { UnsubscribeTool } from '../../../../src/agent/tools/UnsubscribeTool.js';
import {
  FORM,
  RECORD,
  VERDICT,
  fakeRepos,
  recordingGmail,
} from '../../../helpers/agentFixtures.js';

const context = { now: new Date('2026-10-05T10:00:00Z'), timeZone: 'Asia/Kolkata' };
/** Validates like the interpreter does, then tags everything as user input. */
const run = (tool, raw, ctx = context) => {
  const parsed = tool.parseArgs(raw);
  const args = Object.fromEntries(
    Object.entries(parsed).map(([k, v]) => [k, TaggedValue.fromUser(v)]),
  );
  return tool.execute(args, ctx);
};

describe('search_emails', () => {
  const other = {
    ...RECORD,
    gmailId: '2',
    fromAddr: 'news@list.example',
    fromDomain: 'list.example',
    date: '2026-10-06T09:00:00.000Z',
  };
  const repos = fakeRepos([
    { record: RECORD, form: FORM, verdict: VERDICT },
    { record: other, form: { ...FORM, needs_reply: false }, verdict: { level: 'SUSPICIOUS' } },
    {
      record: { ...RECORD, gmailId: '3', date: '2026-10-04T09:00:00.000Z' },
      form: null,
      verdict: null,
    },
  ]);
  const tool = new SearchEmailsTool(repos);

  it('returns typed facts plus summaries as user-only inbox data', async () => {
    const result = await run(tool, {});
    expect(result.value.count).toBe(3);
    expect(result.value.emails.map((e) => e.id)).toEqual(['2', '18f3a', '3']);
    expect(result.value.emails[1]).toMatchObject({
      id: '18f3a',
      summary: FORM.summary,
      risk: { level: 'SAFE' },
    });
    expect(result.value.emails[2].summary).toBeNull();
    expect(result.readers).toBe('user-only');
    expect(result.emailIds()).toEqual(['2', '18f3a', '3']);
    expect(result.hasSource('inbox')).toBe(true);
    expect(JSON.stringify(result.value)).not.toContain('Rahul Mehta');
  });

  it('filters on typed fields and limits', async () => {
    expect((await run(tool, { from: 'acme.example' })).value.emails.map((e) => e.id)).toEqual([
      '18f3a',
      '3',
    ]);
    expect((await run(tool, { risk: 'SUSPICIOUS' })).value.emails.map((e) => e.id)).toEqual(['2']);
    expect((await run(tool, { needs_reply: true })).value.emails.map((e) => e.id)).toEqual([
      '18f3a',
    ]);
    expect((await run(tool, { limit: 1 })).value.emails.map((e) => e.id)).toEqual(['2']);
    expect(
      (await run(tool, { since: '2026-10-05T00:00:00Z', direction: 'inbound' })).value.count,
    ).toBe(2);
  });

  it('rejects bad filters', () => {
    expect(() => tool.parseArgs({ from: 'rahul' })).toThrow(ToolError);
    expect(() => tool.parseArgs({ limit: 0 })).toThrow(ToolError);
    expect(() => tool.parseArgs({ since: 'yesterday' })).toThrow(ToolError);
  });
});

describe('get_email_fields and summarise', () => {
  const repos = fakeRepos();

  it('returns facts tagged to the email and its participants', async () => {
    const result = await run(new GetEmailFieldsTool(repos), { email_id: '18f3a' });
    expect(result.value).toMatchObject({ id: '18f3a', category: 'work', risk: { level: 'SAFE' } });
    expect(result.value).not.toHaveProperty('summary');
    expect(result.sources).toEqual([{ type: 'email', id: '18f3a' }]);
    expect([...result.readers]).toEqual(['rahul@acme.example', 'me@example.com']);
  });

  it('returns the Reader summary tagged to the email', async () => {
    const result = await run(new SummariseTool(repos), { email_id: '18f3a' });
    expect(result.value).toEqual({ summary: FORM.summary });
    expect(result.emailIds()).toEqual(['18f3a']);
  });

  it('fails on unknown emails or missing Reader output', async () => {
    await expect(run(new GetEmailFieldsTool(repos), { email_id: 'nope' })).rejects.toThrow(
      ToolError,
    );
    await expect(run(new SummariseTool(repos), { email_id: 'nope' })).rejects.toThrow(ToolError);
    const noForm = fakeRepos([{ record: RECORD, form: null, verdict: null }]);
    await expect(run(new SummariseTool(noForm), { email_id: '18f3a' })).rejects.toThrow(ToolError);
  });
});

describe('extract', () => {
  it('keeps the taint of the text it read', async () => {
    const calls = [];
    const extractor = { extract: async (...a) => (calls.push(a), ['2026-10-09T17:00']) };
    const tool = new ExtractTool({ extractor });
    const text = TaggedValue.fromEmail('Fri at 5', {
      id: '18f3a',
      participants: ['rahul@acme.example'],
    });
    const result = await tool.execute(
      { handle: text, kind: TaggedValue.fromUser('datetimes') },
      context,
    );
    expect(result.value).toEqual(['2026-10-09T17:00']);
    expect(result.sources).toEqual([{ type: 'email', id: '18f3a' }]);
    expect(calls).toEqual([['Fri at 5', 'datetimes', context]]);
    expect(() => tool.parseArgs({ handle: 'x', kind: 'names' })).toThrow(ToolError);
  });
});

describe('organise tools', () => {
  it('apply_label creates the label and adds it', async () => {
    const gmail = recordingGmail();
    const result = await run(new ApplyLabelTool({ gmail }), {
      email_id: '18f3a',
      label: ' Receipts ',
    });
    expect(gmail.calls).toEqual([
      ['ensureLabel', 'Receipts'],
      ['modifyLabels', '18f3a', { add: ['Label_Receipts'] }],
    ]);
    expect(result.value).toEqual({ labelled: true });
    expect(result.readers).toBe('user-only');
  });

  it('apply_label refuses reserved security labels', () => {
    expect(() =>
      new ApplyLabelTool({ gmail: recordingGmail() }).parseArgs({
        email_id: '1',
        label: 'mailmoat/⛔ Dangerous',
      }),
    ).toThrow(ToolError);
    expect(() =>
      new ApplyLabelTool({ gmail: recordingGmail() }).parseArgs({
        email_id: '1',
        label: 'MAILMOAT/x',
      }),
    ).toThrow(ToolError);
  });

  it('archive and mark_read modify labels only', async () => {
    const gmail = recordingGmail();
    await run(new ArchiveTool({ gmail }), { email_id: '18f3a' });
    await run(new MarkReadTool({ gmail }), { email_id: '18f3a' });
    expect(gmail.calls).toEqual([
      ['archive', '18f3a'],
      ['modifyLabels', '18f3a', { remove: ['UNREAD'] }],
    ]);
  });
});

describe('create_draft, send_email and reply', () => {
  const message = {
    to: ['bob@example.com'],
    cc: ['amy@example.com'],
    subject: 'Lunch',
    body: 'Friday?',
  };

  it('create_draft saves a MIME draft and sends nothing', async () => {
    const gmail = recordingGmail();
    const result = await run(new CreateDraftTool({ gmail }), message);
    expect(gmail.calls).toHaveLength(1);
    const [name, raw, threadId] = gmail.calls[0];
    expect(name).toBe('createDraft');
    expect(raw).toContain('To: bob@example.com\r\nCc: amy@example.com\r\nSubject: Lunch\r\n');
    expect(threadId).toBeUndefined();
    expect(result.value).toEqual({ draftId: 'draft-1' });
  });

  it('send_email sends the same shape', async () => {
    const gmail = recordingGmail();
    const result = await run(new SendEmailTool({ gmail }), {
      to: ['bob@example.com'],
      subject: 'Lunch',
      body: 'Friday?',
    });
    expect(gmail.calls[0][0]).toBe('sendMessage');
    expect(gmail.calls[0][1]).not.toContain('Cc:');
    expect(result.value).toEqual({ messageId: 'sent-1' });
  });

  it('send_email threads a composer reply and removes the draft it started from (PLAN §14)', async () => {
    const gmail = recordingGmail();
    const discarded = [];
    const tool = new SendEmailTool({
      gmail,
      drafts: { discard: async (id) => discarded.push(id) },
    });
    await run(tool, {
      to: ['bob@example.com'],
      subject: 'Re: Lunch',
      body: 'Friday works.',
      in_reply_to: '<m1@example.com>',
      thread_id: 't-9',
      draft_id: 'draft-old',
    });
    const [name, raw, threadId] = gmail.calls[0];
    expect(name).toBe('sendMessage');
    expect(raw).toContain('In-Reply-To: <m1@example.com>\r\n');
    expect(threadId).toBe('t-9');
    expect(discarded).toEqual(['draft-old']);
  });

  it('both reject bad recipients, empty bodies and header injection', () => {
    const tool = new CreateDraftTool({ gmail: recordingGmail() });
    expect(() => tool.parseArgs({ ...message, to: [] })).toThrow(ToolError);
    expect(() => tool.parseArgs({ ...message, to: ['Bob <bob@example.com>'] })).toThrow(ToolError);
    expect(() => tool.parseArgs({ ...message, body: '  ' })).toThrow(ToolError);
    expect(() => tool.parseArgs({ ...message, bcc: ['eve@evil.example'] })).toThrow(ToolError);
    expect(() => tool.parseArgs({ ...message, body: 'x'.repeat(4_001) })).toThrow(ToolError);
    await_expectInjection();
  });

  async function await_expectInjection() {
    const gmail = recordingGmail();
    await expect(
      run(new SendEmailTool({ gmail }), { ...message, subject: 'Hi\r\nBcc: eve@evil.example' }),
    ).rejects.toThrow(RangeError);
    expect(gmail.calls).toHaveLength(0);
  }

  it("reply hands the email and the user's instructions to the draft service", async () => {
    const calls = [];
    const drafts = { createReply: async (input) => (calls.push(input), { draftId: 'draft-9' }) };
    const tool = new ReplyTool({ emails: fakeRepos().emails, drafts });
    const result = await run(tool, { email_id: '18f3a', instructions: 'say yes' });
    expect(calls).toEqual([{ gmailId: '18f3a', instructions: 'say yes' }]);
    expect(result.value).toEqual({ draftId: 'draft-9' });
    expect(result.emailIds()).toEqual(['18f3a']);
    expect((await run(tool, { email_id: '18f3a' })).value).toEqual({ draftId: 'draft-9' });
    expect(calls[1].instructions).toBeNull();
    await expect(run(tool, { email_id: 'nope' })).rejects.toThrow(ToolError);
  });
});

describe('calendar tools', () => {
  it('get_free_busy returns calendar-only busy slots within 31 days', async () => {
    const calls = [];
    const calendar = {
      freeBusy: async (range) => (
        calls.push(range),
        [{ start: new Date('2026-10-06T09:00:00Z'), end: new Date('2026-10-06T10:00:00Z') }]
      ),
    };
    const tool = new GetFreeBusyTool({ calendar });
    const result = await run(tool, { start: '2026-10-06T00:00:00Z', end: '2026-10-07T00:00:00Z' });
    expect(result.value).toEqual({
      busy: [{ start: '2026-10-06T09:00:00.000Z', end: '2026-10-06T10:00:00.000Z' }],
    });
    expect(result.sources).toEqual([{ type: 'calendar' }]);
    expect(result.readers).toBe('user-only');
    expect(calls[0].timeMin.toISOString()).toBe('2026-10-06T00:00:00.000Z');
    await expect(
      run(tool, { start: '2026-10-07T00:00:00Z', end: '2026-10-06T00:00:00Z' }),
    ).rejects.toThrow(ToolError);
    await expect(
      run(tool, { start: '2026-10-06T00:00:00Z', end: '2026-12-06T00:00:00Z' }),
    ).rejects.toThrow(ToolError);
    expect(() =>
      tool.parseArgs({ start: '2026-10-06T00:00', end: '2026-10-07T00:00:00Z' }),
    ).toThrow(ToolError);
  });

  it("create_calendar_event creates the event in the user's time zone", async () => {
    const calls = [];
    const calendar = {
      createEvent: async (event) => (calls.push(event), { id: 'ev1', htmlLink: 'https://cal/ev1' }),
    };
    const tool = new CreateCalendarEventTool({ calendar });
    const result = await run(tool, {
      title: 'Launch',
      start: '2026-10-09T17:00:00+05:30',
      end: '2026-10-09T17:30:00+05:30',
      attendees: ['rahul@acme.example'],
    });
    expect(calls[0]).toMatchObject({
      summary: 'Launch',
      attendees: ['rahul@acme.example'],
      timeZone: 'Asia/Kolkata',
    });
    expect(calls[0].start.toISOString()).toBe('2026-10-09T11:30:00.000Z');
    expect(result.value).toEqual({ eventId: 'ev1', link: 'https://cal/ev1' });
    await expect(
      run(tool, { title: 'x', start: '2026-10-09T17:00:00Z', end: '2026-10-09T17:00:00Z' }),
    ).rejects.toThrow(ToolError);
    expect(() =>
      tool.parseArgs({
        title: 'x',
        start: '2026-10-09T17:00:00Z',
        end: '2026-10-09T18:00:00Z',
        attendees: ['not-an-address'],
      }),
    ).toThrow(ToolError);
  });
});

describe('sender and memory tools', () => {
  it('unsubscribe delegates to the service', async () => {
    const calls = [];
    const unsubscribes = { unsubscribe: async (a) => (calls.push(a), { status: 'UNSUBSCRIBED' }) };
    const result = await run(new UnsubscribeTool({ unsubscribes }), {
      sender: 'news@list.example',
    });
    expect(calls).toEqual(['news@list.example']);
    expect(result.value).toEqual({ status: 'UNSUBSCRIBED', method: null });
  });

  it('block_sender sets BLOCKED', async () => {
    const calls = [];
    const senders = { setStatus: (a, s) => calls.push([a, s]) };
    const result = await run(new BlockSenderTool({ senders }), { sender: 'news@list.example' });
    expect(calls).toEqual([['news@list.example', 'BLOCKED']]);
    expect(result.value).toEqual({ blocked: true });
    expect(() => new BlockSenderTool({ senders }).parseArgs({ sender: 'list.example' })).toThrow(
      ToolError,
    );
  });

  it('save_memory stores user-sourced content only', async () => {
    const calls = [];
    const memory = { add: (entry) => (calls.push(entry), { id: 7 }) };
    const result = await run(new SaveMemoryTool({ memory }), { content: ' I prefer mornings ' });
    expect(calls).toEqual([{ content: 'I prefer mornings', source: 'user' }]);
    expect(result.value).toEqual({ memoryId: 7 });
    expect(result.sources).toEqual([{ type: 'memory' }]);
    expect(() => new SaveMemoryTool({ memory }).parseArgs({ content: 'x'.repeat(501) })).toThrow(
      ToolError,
    );
  });
});
