import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Kode sumber memakai specifier ESM bergaya Node (".js") yang menunjuk ke berkas .ts.
  // Alias ini membuat Vite menemukan berkas yang benar saat menjalankan test.
  resolve: {
    alias: [{ find: /^(\.\.?\/.+?)\.js$/, replacement: '$1' }],
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
