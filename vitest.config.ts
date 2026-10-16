import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mirrors scripts/build.mjs's esbuild `define` for the real
  // build; a fixed test value, not package.json's version, so a version
  // bump never has to touch a test.
  define: { __SDK_VERSION__: JSON.stringify('0.0.0-test') },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
    passWithNoTests: true,
  },
});
