/**
 * Reads and writes CLI config at ~/.abacus/config.json
 * Config shape: { token: string, serverUrl: string }
 */
import fs from 'fs'
import path from 'path'
import os from 'os'

const CONFIG_DIR = path.join(os.homedir(), '.abacus')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

// Default server URL — override with ABACUS_SERVER_URL env var
const DEFAULT_SERVER_URL = process.env.ABACUS_SERVER_URL || 'https://getabacus.xyz'

export function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function writeConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8')
}

export function deleteConfig() {
  try { fs.unlinkSync(CONFIG_FILE) } catch {}
}

export function getServerUrl() {
  const config = readConfig()
  return config?.serverUrl || DEFAULT_SERVER_URL
}
