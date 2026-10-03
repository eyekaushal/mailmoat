import { defineConfig } from 'vitest/config';

// One `npm test` runs every workspace; only the web project needs a DOM and the React plugin.
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'shared', root: './shared' } },
      { test: { name: 'server', root: './server' } },
      './web',
    ],
  },
});
