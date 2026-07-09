import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Pinned to 127.0.0.1 so the printed dev URL always matches the
  // server's CORS allow-list (WAES_WEB_ORIGIN defaults to
  // http://127.0.0.1:5173) — "localhost" and "127.0.0.1" are different
  // origins to the browser even though they resolve to the same host.
  server: {
    host: '127.0.0.1',
  },
})
