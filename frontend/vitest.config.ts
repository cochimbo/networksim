import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'src/setupTests.ts',
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/index.ts',
        'src/vite-env.d.ts',
      ],
      // Threshold configuration
      thresholds: {
        lines: 30,
        functions: 30,
        branches: 30,
        statements: 30,
      },
    },
    // Test patterns
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Watch mode exclusions
    watchExclude: ['**/node_modules/**', '**/dist/**'],
    // Reporter configuration
    reporters: ['verbose'],
  },
})
