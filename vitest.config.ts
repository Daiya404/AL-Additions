import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __MONKEY_WINDOW_KEY__: JSON.stringify('unsafeWindow')
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./__tests__/setup.ts'],
    include: ['__tests__/**/*.test.ts'],
    pool: 'vmThreads'
  }
});