import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    // The MCP server is a second entry: out/main/mcp.js, run by the app's own exe in Node mode.
    build: { externalizeDeps: true, rollupOptions: { input: { index: resolve('src/main/index.ts'), mcp: resolve('src/mcp/index.ts') } } }
  },
  preload: {
    build: { externalizeDeps: true }
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias: { '@shared': resolve('src/shared') } },
    plugins: [react(), tailwindcss()],
    build: { rollupOptions: { input: resolve('src/renderer/index.html') } }
  }
})
