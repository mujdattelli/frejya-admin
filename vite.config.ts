import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// admin.frejya.app ozel alan adi (kok dizinde yayinlanir).
export default defineConfig({
  base: '/',
  plugins: [react()],
});
