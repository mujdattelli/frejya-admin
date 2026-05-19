import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Ozel domain admin.frejya.app kokunde yayinlanir — base path '/'.
export default defineConfig({
  base: '/',
  plugins: [react()],
});
