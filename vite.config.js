import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

const isDev = process.env.NODE_ENV !== 'production'

function spaFallback() {
  return {
    name: 'spa-fallback',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''
        if (
          !url.includes('.') &&
          !url.startsWith('/@') &&
          !url.startsWith('/src') &&
          !url.startsWith('/node_modules')
        ) {
          req.url = '/logged-out-landing-page.html'
        }
        next()
      })
    },
  }
}

export default defineConfig(async () => {
  const plugins = [react(), tailwindcss()]
  if (isDev) {
    const { default: basicSsl } = await import('@vitejs/plugin-basic-ssl')
    plugins.push(basicSsl())
    plugins.push(spaFallback())
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
