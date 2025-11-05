import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['spec/**/*.spec.ts'],
    environment: 'node',
  },
});

