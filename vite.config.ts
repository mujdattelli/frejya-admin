import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages project site: site `mujdattelli.github.io/frejya-admin/` altinda
// yayinlanir; bu yuzden base path repo adiyla ('/frejya-admin/') ayarlanir.
export default defineConfig({
  base: '/frejya-admin/',
  plugins: [react()],
});
