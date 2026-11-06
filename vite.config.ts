import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
// BASE_URL comes from VITE_BASE at build time: '/' for a root domain, or
// '/GST-SUITE/' for a GitHub Pages project site, where assets would otherwise
// 404 because they would be requested from the domain root.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
});
