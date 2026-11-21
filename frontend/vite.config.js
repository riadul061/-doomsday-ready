import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs on :3001; in Docker nginx does the same proxying.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': process.env.API_URL || 'http://localhost:3001' },
  },
});
