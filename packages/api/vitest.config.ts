import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Cada test crea su propia DB `:memory:`; no hay estado compartido que serializar.
    include: ['tests/**/*.test.ts'],
  },
});
