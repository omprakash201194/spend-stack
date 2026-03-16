import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        // Shortcut of `build.lib.entry`.
        entry: 'electron/main.ts',
      },
      preload: {
        // Shortcut of `build.rollupOptions.input`.
        input: fileURLToPath(new URL('./electron/preload.ts', import.meta.url)),
      },
      // Optional: Use Node.js API in the Renderer process.
      // Will expose a `ipcRenderer` object in the main world.
      renderer: {},
    }),
  ],
});
