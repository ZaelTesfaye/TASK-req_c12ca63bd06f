import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    // Only active under vitest (see plugin source) — inserts the `browser`
    // resolve condition so Svelte 5's browser build (with mount()) is used
    // instead of the SSR build when @testing-library/svelte renders a page.
    svelteTesting(),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib')
    }
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.js'],
    globals: true,
    // Auto-cleanup between tests. svelteTesting() skips wiring this in
    // when `globals: true`, so register the official vitest setup file
    // explicitly — otherwise rendered components leak between tests and
    // selectors find duplicates in the DOM.
    setupFiles: ['@testing-library/svelte/vitest'],
  }
});
