import { describe, expect, it } from 'vitest';
import { FakeGmail } from './FakeGmail.js';
import { RecordingToolbox } from './RecordingToolbox.js';

const setup = () => {
  const toolbox = new RecordingToolbox();
  toolbox.begin({ ownGmailId: 'm1' });
  const gmail = new FakeGmail(toolbox);
  gmail.addMessage({
    id: 'm1',
    raw: Buffer.from('From: a@b.c\r\n\r\nhi'),
    internalDate: new Date(0),
  });
  return { toolbox, gmail };
};

describe('FakeGmail', () => {
  it('serves the raw message with Gmail metadata and 404s for unknown IDs', async () => {
    const { gmail } = setup();
    const message = await gmail.getRawMessage('m1');
    expect(message).toMatchObject({
      id: 'm1',
      threadId: 'thread-m1',
      labelIds: ['INBOX', 'UNREAD'],
    });
    expect(message.raw.toString()).toContain('hi');
    await expect(gmail.getRawMessage('nope')).rejects.toMatchObject({ code: 404 });
  });

  it('records every label change and archive in the toolbox', async () => {
    const { gmail, toolbox } = setup();
    const id = await gmail.ensureLabel('mailmoat/Dangerous');
    expect(await gmail.ensureLabel('mailmoat/Dangerous')).toBe(id);
    await gmail.modifyLabels('m1', { add: [id] });
    await gmail.archive('m1');
    expect(gmail.labelsOf('m1')).toEqual(['UNREAD', 'mailmoat/Dangerous']);
    expect(toolbox.effects().map((e) => e.kind)).toEqual(['label', 'archive', 'label']);
    expect(toolbox.violations()).toEqual([]);
  });
});
