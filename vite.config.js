import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const isDev = process.env.NODE_ENV !== 'production'

export default defineConfig(async () => {
  const plugins = [react(), tailwindcss()]
  if (isDev) {
    const { default: basicSsl } = await import('@vitejs/plugin-basic-ssl')
    plugins.push(basicSsl())
  }
  return {
    plugins,
    server: isDev ? { https: true } : {},
    build: {
      rollupOptions: {
        input: {
          'logged-out-landing-page': 'logged-out-landing-page.html',
          index: 'index.html',
        },
      },
    },
  }
})
