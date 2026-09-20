import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4179',
      '/sample': 'http://127.0.0.1:4179',
      '/user-meshes': 'http://127.0.0.1:4179'
    }
  }
});
