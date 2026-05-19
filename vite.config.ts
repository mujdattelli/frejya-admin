import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages proje sitesi: mujdattelli.github.io/frejya-admin/ altinda yayinlanir.
export default defineConfig({
  base: '/frejya-admin/',
  plugins: [react()],
});
