import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/renderer/**/*.test.{js,jsx}'],
    setupFiles: ['tests/renderer/setup.js'],
    restoreMocks: true,
  },
});
