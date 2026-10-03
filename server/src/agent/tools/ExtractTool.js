import { z } from 'zod';
import { EXTRACT_KINDS } from '../../security/reader/Extractor.js';
import { Tool } from './Tool.js';

/** The quarantined-call step: typed values out of email text, tainted like that text. */
export class ExtractTool extends Tool {
  #extractor;

  /** @param {{ extractor: Pick<import('../../security/reader/Extractor.js').Extractor, 'extract'> }} deps */
  constructor({ extractor }) {
    super({
      name: 'extract',
      description:
        'Read email text in a quarantined call and return typed values of one kind (e.g. the flight time in a booking email).',
      args: z.strictObject({
        handle: z
          .string()
          .min(1)
          .describe(
            'The text to read, given as a handle object, e.g. { "handle": "$email_<id>.body" }.',
          ),
        kind: z
          .enum(EXTRACT_KINDS)
          .describe('"datetimes" → ISO 8601 times; "amounts" → { value, currency } pairs.'),
      }),
    });
    this.#extractor = extractor;
  }

  async execute(args, { now, timeZone }) {
    const items = await this.#extractor.extract(args.handle.value, args.kind.value, {
      now,
      timeZone,
    });
    return args.handle.derive(items);
  }
}
