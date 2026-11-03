import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* Two targets from one codebase:
   - default: the Mac app (served from app://academic-weapon/ by Electron)
   - `--mode web`: the claude.ai beta, inlined into a single page by scripts/build-web.mjs */
export default defineConfig(({ mode }) => {
  const web = mode === 'web';
  return {
    plugins: [react()],
    base: web ? './' : '/',
    publicDir: web ? false : 'public',
    build: {
      outDir: web ? 'dist-web' : 'dist',
      emptyOutDir: true,
      assetsInlineLimit: web ? Number.MAX_SAFE_INTEGER : 4096, // the logo becomes a data: URI
      cssCodeSplit: false,
      modulePreload: !web,
    },
  };
});
