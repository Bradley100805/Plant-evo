import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Show console output from passing tests too: the stats suite logs observed vs. expected.
    silent: false,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['{apps,packages,tools}/*/src/**/*.test.{ts,tsx}'],
          exclude: ['**/*.stats.test.ts'],
        },
      },
      {
        // Statistical validation against analytical population-genetics results.
        // Seeded and deterministic; set STATS_SEED / STATS_SCALE to vary (see docs/science).
        test: {
          name: 'stats',
          include: ['{apps,packages,tools}/*/src/**/*.stats.test.ts'],
          testTimeout: 300_000,
        },
      },
    ],
  },
});
