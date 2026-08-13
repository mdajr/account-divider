import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://mdajr.github.io/account-divider/ — a Pages *project* page.
// The base must match the repo name or every built asset 404s in production.
export default defineConfig({
  base: '/account-divider/',
  plugins: [react()],
});
