import admin from 'firebase-admin'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let initialized = false

export async function ensureFirebaseAdmin() {
  if (initialized) return

  const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT
  const credPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS

  let serviceAccount
  if (jsonEnv) {
    serviceAccount = JSON.parse(jsonEnv)
  } else if (credPath) {
    const resolved = path.isAbsolute(credPath) ? credPath : path.resolve(__dirname, '..', credPath)
    const raw = fs.readFileSync(resolved, 'utf8')
    serviceAccount = JSON.parse(raw)
  } else {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT (JSON string) or FIREBASE_SERVICE_ACCOUNT_PATH')
  }

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  initialized = true
}

export async function verifyIdToken(idToken) {
  if (!initialized) await ensureFirebaseAdmin()
  const decoded = await admin.auth().verifyIdToken(idToken)
  return decoded.uid
}

/** Express middleware: require Authorization: Bearer <firebase_id_token>, set req.uid */
export function authMiddleware(req, res, next) {
  const auth = req.headers.authorization
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' })
  }
  verifyIdToken(token)
    .then((uid) => {
      req.uid = uid
      next()
    })
    .catch((err) => {
      console.error('Token verification failed:', err.message)
      return res.status(401).json({ error: 'Invalid or expired token' })
    })
}
