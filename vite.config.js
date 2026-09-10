import { defineConfig } from 'vite'

// OneDrive can deny the file-system watcher used by esbuild. Polling keeps the
// local preview reliable without affecting the deployed static site.
export default defineConfig({
  server: {
    hmr: { overlay: false },
    watch: { usePolling: true }
  }
})
