import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })

import pg from 'pg'
import fs from 'fs'

const migrationsDir = path.join(__dirname, 'migrations')
const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL in server/.env')
  process.exit(1)
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
try {
  await client.connect()
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    await client.query(sql)
    console.log(`Migration completed: ${file}`)
  }
} catch (err) {
  console.error('Migration failed:', err.message)
  process.exit(1)
} finally {
  await client.end()
}
