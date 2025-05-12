import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import {quasar} from '@quasar/vite-plugin'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    quasar()
  ],
  optimizeDeps: {
    include: ['quasar'],
    exclude: ['three']
  },
  server: {
    proxy: {
      '/ws': {
        target: 'localhost:4444',
        ws: true, // <--- Important!
        changeOrigin: true,
      },
    },
  },
});
