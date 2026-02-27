import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

import { authMiddleware } from './middleware/auth.js'
import { plaidRouter } from './routes/plaid.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })

if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
  console.error('Missing Plaid keys. In server/.env set PLAID_CLIENT_ID and PLAID_SECRET (from dashboard.plaid.com → your app → Keys).')
  process.exit(1)
}

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }))
app.use(express.json())

app.get('/health', (req, res) => res.json({ ok: true }))

app.use('/api/plaid', authMiddleware, plaidRouter)

app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status ?? 500).json({ error: err.message ?? 'Internal server error' })
})

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`))
