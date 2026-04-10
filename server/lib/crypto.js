/**
 * Application-layer encryption module — AES-256-GCM.
 *
 * Every encrypted value is stored as "iv:ciphertext:authTag" (all base64).
 * Random 12-byte IV per encrypt call → same plaintext produces different ciphertext each time.
 *
 * IMPORTANT: Most columns in the database are encrypted. Only dates, Plaid IDs,
 * user_id (opaque UUID), and lot_index remain plaintext. Do NOT add SQL WHERE/GROUP BY/SUM
 * on encrypted columns — filter and aggregate in JavaScript after decrypting.
 */
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const SEPARATOR = ':'

let _key = null

function getKey() {
  if (_key) return _key
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new Error('ENCRYPTION_KEY env var is not set. Cannot start without it.')
  // Derive a 32-byte key from the hex string
  _key = Buffer.from(raw, 'hex')
  if (_key.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must be 64 hex characters (32 bytes). Got ${raw.length} characters.`)
  }
  return _key
}

// ── Core encrypt / decrypt ──────────────────────────────────────────────────

export function encrypt(plaintext) {
  if (plaintext == null) return null
  const str = String(plaintext)
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('base64'), encrypted.toString('base64'), authTag.toString('base64')].join(SEPARATOR)
}

export function decrypt(encrypted) {
  if (encrypted == null) return null
  const str = String(encrypted)
  // Gracefully handle plaintext values (not yet encrypted — needed during migration transition)
  if (!str.includes(SEPARATOR)) return str
  const parts = str.split(SEPARATOR)
  if (parts.length !== 3) return str // not our format, return as-is
  try {
    const [ivB64, ciphertextB64, authTagB64] = parts
    const key = getKey()
    const iv = Buffer.from(ivB64, 'base64')
    const ciphertext = Buffer.from(ciphertextB64, 'base64')
    const authTag = Buffer.from(authTagB64, 'base64')
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    return decipher.update(ciphertext, null, 'utf8') + decipher.final('utf8')
  } catch {
    // If decryption fails, value is likely plaintext — return as-is
    return str
  }
}

// ── Typed helpers ───────────────────────────────────────────────────────────

export function encryptNum(n) {
  if (n == null) return null
  return encrypt(String(n))
}

export function decryptNum(s) {
  if (s == null) return null
  const val = decrypt(s)
  if (val == null) return null
  const num = Number(val)
  return Number.isNaN(num) ? null : num
}

export function encryptJSON(obj) {
  if (obj == null) return null
  return encrypt(JSON.stringify(obj))
}

export function decryptJSON(s) {
  if (s == null) return null
  const val = decrypt(s)
  if (val == null) return null
  try {
    return JSON.parse(val)
  } catch {
    // Already a parsed object (plaintext transition) or invalid — try returning as-is
    if (typeof val === 'object') return val
    return null
  }
}

export function encryptBool(b) {
  if (b == null) return null
  return encrypt(b ? 'true' : 'false')
}

export function decryptBool(s) {
  if (s == null) return null
  const val = decrypt(s)
  if (val == null) return null
  if (val === 'true' || val === true) return true
  if (val === 'false' || val === false) return false
  return Boolean(val)
}

// ── Firebase UID hashing ────────────────────────────────────────────────────

export function hashFirebaseUid(firebaseUid) {
  const key = getKey()
  return crypto.createHmac('sha256', key).update(firebaseUid).digest('hex')
}

// ── Row-level helpers (for use in db.js) ────────────────────────────────────

/**
 * Decrypt specified fields in a single row object. Returns a new object.
 * fieldSpec is an object mapping field names to their type: 'string' | 'number' | 'json' | 'bool'
 */
export function decryptRow(row, fieldSpec) {
  if (!row) return row
  const result = { ...row }
  for (const [field, type] of Object.entries(fieldSpec)) {
    if (result[field] == null) continue
    switch (type) {
      case 'number': result[field] = decryptNum(result[field]); break
      case 'json': result[field] = decryptJSON(result[field]); break
      case 'bool': result[field] = decryptBool(result[field]); break
      default: result[field] = decrypt(result[field])
    }
  }
  return result
}

/** Decrypt specified fields in an array of rows. */
export function decryptRows(rows, fieldSpec) {
  if (!rows) return rows
  return rows.map(row => decryptRow(row, fieldSpec))
}
