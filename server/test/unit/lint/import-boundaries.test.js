import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const eslint = new ESLint({ cwd: repoRoot });

async function lintAs(filePath, code) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId === 'no-restricted-imports');
}

describe('import boundaries for the quarantined Reader/Drafter', () => {
  const readerFile = 'server/src/security/reader/Reader.js';

  it.each([
    "import { Planner } from '../../agent/Planner.js';",
    "import { ActionExecutor } from '../../actions/ActionExecutor.js';",
    "import { GmailClient } from '../../google/GmailClient.js';",
    "import { MemoryRepository } from '../../db/repositories/MemoryRepository.js';",
  ])('blocks: %s', async (code) => {
    expect(await lintAs(readerFile, `${code}\nexport { };\n`)).toHaveLength(1);
  });

  it('allows the LLM client and shared schemas', async () => {
    const code =
      "import { LlmClient } from '../../llm/LlmClient.js';\n" +
      "import { RISK_LEVELS } from '@mailmoat/shared/constants/risk-levels';\n" +
      'export { LlmClient, RISK_LEVELS };\n';
    expect(await lintAs(readerFile, code)).toHaveLength(0);
  });

  it('does not restrict other server code', async () => {
    const code = "import { Planner } from '../agent/Planner.js';\nexport { Planner };\n";
    expect(await lintAs('server/src/features/ChatService.js', code)).toHaveLength(0);
  });
});
