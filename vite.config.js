import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5180, proxy: { '/api': 'http://127.0.0.1:5181', '/ws': { target: 'ws://127.0.0.1:5181', ws: true } } },
  build: { target: 'es2020' }
});
