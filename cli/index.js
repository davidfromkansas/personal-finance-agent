#!/usr/bin/env node
/**
 * copilot CLI — query your Crumbs financial data from the terminal.
 *
 * Usage:
 *   copilot                     Interactive REPL
 *   copilot "question"          Single question, print answer, exit
 *   copilot login               Authenticate (browser redirect)
 *   copilot logout              Delete local token
 *   copilot logout --all        Delete local token + revoke all tokens server-side
 */
import readline from 'readline'
import { readConfig, deleteConfig, getServerUrl } from './config.js'
import { login } from './auth.js'
import { createMcpClient, askQuestion } from './mcp-client.js'

const args = process.argv.slice(2)
const command = args[0]

async function ensureAuth() {
  const config = readConfig()
  if (!config?.token) {
    console.log('Not authenticated. Running login...\n')
    await login()
    console.log('\nAuthenticated successfully.\n')
    return readConfig()
  }
  return config
}

async function revokeAll(token, serverUrl) {
  const res = await fetch(`${serverUrl}/api/cli-auth/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Revoke failed: ${res.status}`)
}

// ── Commands ─────────────────────────────────────────────────────────────────

if (command === 'login') {
  try {
    await login()
    console.log('\nAuthenticated successfully.')
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
  process.exit(0)
}

if (command === 'logout') {
  const config = readConfig()
  const allFlag = args.includes('--all')

  if (allFlag && config?.token) {
    try {
      await revokeAll(config.token, config.serverUrl || getServerUrl())
      console.log('All tokens revoked.')
    } catch (err) {
      console.error('Could not revoke server-side tokens:', err.message)
    }
  }

  deleteConfig()
  console.log('Logged out.')
  process.exit(0)
}

// ── Single question mode ──────────────────────────────────────────────────────
if (command && command !== 'login' && command !== 'logout') {
  const config = await ensureAuth()
  let client
  try {
    client = await createMcpClient(config.serverUrl || getServerUrl(), config.token)
    const answer = await askQuestion(client, command)
    console.log(answer)
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  } finally {
    await client?.close?.()
  }
  process.exit(0)
}

// ── Interactive REPL ──────────────────────────────────────────────────────────
const config = await ensureAuth()
let client
try {
  client = await createMcpClient(config.serverUrl || getServerUrl(), config.token)
} catch (err) {
  console.error('Could not connect to server:', err.message)
  process.exit(1)
}

console.log('Crumbs — ask anything about your finances. Type "exit" to quit.\n')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const history = [] // conversation history for the current session

rl.on('line', async (line) => {
  const input = line.trim()
  if (!input) return
  if (input === 'exit' || input === 'quit') {
    await client?.close?.()
    rl.close()
    process.exit(0)
  }

  rl.pause()
  try {
    const answer = await askQuestion(client, input, history)
    console.log('\n' + answer + '\n')
    history.push({ role: 'user', content: input })
    history.push({ role: 'assistant', content: answer })
  } catch (err) {
    console.error('Error:', err.message)
  }
  rl.resume()
  rl.prompt()
})

rl.on('close', async () => {
  await client?.close?.()
  process.exit(0)
})

rl.setPrompt('> ')
rl.prompt()
