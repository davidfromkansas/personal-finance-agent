/**
 * Browser-redirect auth flow.
 * 1. Picks a random local port
 * 2. Spins up a temporary HTTP server to receive the callback
 * 3. Opens the browser to /api/cli-auth/start?port=PORT
 * 4. Waits for GET /callback?token=... (30s timeout)
 * 5. Saves token + serverUrl to config
 */
import http from 'http'
import { writeConfig, getServerUrl } from './config.js'

const TIMEOUT_MS = 300_000 // 5 minutes — accommodates new Google account sign-up flow

function getRandomPort() {
  return Math.floor(Math.random() * (65535 - 3000) + 3000)
}

async function openBrowser(url) {
  const { default: open } = await import('open')
  await open(url)
}

export async function login() {
  const serverUrl = getServerUrl()
  const port = getRandomPort()

  console.log(`Connecting to ${serverUrl}`)
  console.log('Opening browser for sign-in...\n')

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close()
      reject(new Error('Login timed out. Please run `abacus login` and try again.'))
    }, TIMEOUT_MS)

    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`)
      if (url.pathname !== '/callback') {
        res.writeHead(404); res.end(); return
      }

      const token = url.searchParams.get('token')
      if (!token) {
        res.writeHead(400); res.end('Missing token'); return
      }

      res.writeHead(200, {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      })
      res.end('OK')

      clearTimeout(timer)
      server.close()

      writeConfig({ token, serverUrl })
      resolve(true) // true = first run
    })

    server.listen(port, '127.0.0.1', async () => {
      try {
        await openBrowser(`${serverUrl}/api/cli-auth/start?port=${port}`)
      } catch {
        console.error('Could not open browser automatically.')
        console.log(`Please open this URL manually:\n  ${serverUrl}/api/cli-auth/start?port=${port}\n`)
      }
    })

    server.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}
