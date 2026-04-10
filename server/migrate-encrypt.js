#!/usr/bin/env node
/**
 * One-time migration: encrypt all sensitive data in-place and replace Firebase UIDs
 * with opaque UUIDs.
 *
 * Usage:
 *   node server/migrate-encrypt.js                  # full run
 *   node server/migrate-encrypt.js --dry-run        # preview changes without writing
 *
 * Prerequisites:
 *   - ENCRYPTION_KEY must be set in env (or server/.env)
 *   - DATABASE_URL must be set in env (or server/.env)
 *   - The users table migration (023) must have been run
 *
 * Idempotent: detects already-encrypted values (contain ':' separator) and skips them.
 */
import 'dotenv/config'
import pg from 'pg'
import {
  encrypt, encryptNum, encryptJSON, encryptBool,
  decrypt, hashFirebaseUid,
} from './lib/crypto.js'

const { Pool } = pg
const DRY_RUN = process.argv.includes('--dry-run')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function q(text, params) {
  return pool.query(text, params)
}

function isEncrypted(val) {
  if (val == null) return true // null doesn't need encryption
  const s = String(val)
  const parts = s.split(':')
  return parts.length === 3 && parts.every(p => p.length > 0)
}

// ── Step 1: Create user mappings ─────────────────────────────────────────────

async function migrateUsers() {
  console.log('\n── Step 1: Migrate Firebase UIDs to opaque UUIDs ──')

  // Find all distinct user_id values across tables (these are currently Firebase UIDs)
  const tables = ['plaid_items', 'transactions', 'portfolio_snapshots', 'portfolio_account_snapshots',
    'holdings_snapshots', 'investment_transactions', 'account_balance_snapshots', 'cli_tokens']

  const firebaseUids = new Set()
  for (const table of tables) {
    const { rows } = await q(`SELECT DISTINCT user_id FROM ${table}`)
    for (const r of rows) firebaseUids.add(r.user_id)
  }

  console.log(`  Found ${firebaseUids.size} distinct Firebase UID(s)`)

  // Check if UIDs are already opaque UUIDs (UUID v4 format)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const alreadyMigrated = [...firebaseUids].every(uid => uuidRegex.test(uid))
  if (alreadyMigrated && firebaseUids.size > 0) {
    console.log('  User IDs are already opaque UUIDs — skipping user migration')
    return new Map() // no remapping needed
  }

  // Create mappings
  const uidMap = new Map() // firebaseUid → opaqueUUID
  for (const uid of firebaseUids) {
    const hash = hashFirebaseUid(uid)
    const encrypted = encrypt(uid)

    if (DRY_RUN) {
      console.log(`  [dry-run] Would create mapping for Firebase UID ${uid.slice(0, 8)}...`)
      uidMap.set(uid, `dry-run-uuid-${uid.slice(0, 8)}`)
      continue
    }

    const { rows } = await q(
      `INSERT INTO users (firebase_uid_hash, firebase_uid_encrypted)
       VALUES ($1, $2)
       ON CONFLICT (firebase_uid_hash) DO UPDATE SET firebase_uid_hash = EXCLUDED.firebase_uid_hash
       RETURNING id`,
      [hash, encrypted]
    )
    uidMap.set(uid, rows[0].id)
    console.log(`  Mapped ${uid.slice(0, 8)}... → ${rows[0].id}`)
  }

  // Update user_id in all tables
  if (!DRY_RUN) {
    for (const [oldUid, newUid] of uidMap) {
      for (const table of tables) {
        const { rowCount } = await q(`UPDATE ${table} SET user_id = $1 WHERE user_id = $2`, [newUid, oldUid])
        if (rowCount > 0) console.log(`  Updated ${rowCount} row(s) in ${table}`)
      }
    }
  }

  return uidMap
}

// ── Step 2: Encrypt table data ──────────────────────────────────────────────

async function encryptTable(tableName, primaryKey, fields) {
  console.log(`\n── Encrypting ${tableName} ──`)
  const { rows } = await q(`SELECT * FROM ${tableName}`)
  console.log(`  ${rows.length} row(s) to process`)

  let encrypted = 0, skipped = 0

  for (const row of rows) {
    const updates = {}
    for (const [col, type] of Object.entries(fields)) {
      const val = row[col]
      if (val == null) continue
      if (isEncrypted(val)) { skipped++; continue }

      switch (type) {
        case 'number': updates[col] = encryptNum(val); break
        case 'json': updates[col] = encryptJSON(typeof val === 'string' ? JSON.parse(val) : val); break
        case 'bool': updates[col] = encryptBool(val); break
        default: updates[col] = encrypt(val)
      }
    }

    if (Object.keys(updates).length === 0) continue

    if (DRY_RUN) {
      encrypted++
      continue
    }

    // Build UPDATE SET clause
    const setClauses = []
    const params = []
    let p = 1
    for (const [col, val] of Object.entries(updates)) {
      setClauses.push(`${col} = $${p++}`)
      params.push(val)
    }

    // Build WHERE clause from primary key
    const pkCols = Array.isArray(primaryKey) ? primaryKey : [primaryKey]
    const whereClauses = pkCols.map(pk => {
      params.push(row[pk])
      return `${pk} = $${p++}`
    })

    await q(`UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`, params)
    encrypted++
  }

  console.log(`  Encrypted: ${encrypted}, Already encrypted (skipped): ${skipped}`)
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  DATA ENCRYPTION MIGRATION ${DRY_RUN ? '(DRY RUN)' : ''}`)
  console.log(`${'='.repeat(60)}`)

  // Verify encryption key is available
  if (!process.env.ENCRYPTION_KEY) {
    console.error('ERROR: ENCRYPTION_KEY is not set. Cannot proceed.')
    process.exit(1)
  }

  // Step 1: User ID migration
  await migrateUsers()

  // Step 2: Encrypt each table
  await encryptTable('plaid_items', 'id', {
    access_token: 'string', institution_name: 'string', accounts_cache: 'json',
    error_code: 'string', products_granted: 'string', sync_cursor: 'string',
  })

  await encryptTable('transactions', 'id', {
    name: 'string', amount: 'number', account_name: 'string', payment_channel: 'string',
    personal_finance_category: 'string', pending: 'bool', logo_url: 'string',
    original_description: 'string', merchant_name: 'string', location: 'json',
    website: 'string', personal_finance_category_detailed: 'string',
    personal_finance_category_confidence: 'string', counterparties: 'json',
    payment_meta: 'json', check_number: 'string', recurring: 'string',
  })

  await encryptTable('portfolio_snapshots', ['user_id', 'date'], {
    total_value: 'number', source: 'string', unavailable_items: 'json',
  })

  await encryptTable('portfolio_account_snapshots', ['user_id', 'date', 'account_id'], {
    account_name: 'string', institution: 'string', value: 'number', source: 'string',
  })

  await encryptTable('holdings_snapshots', ['user_id', 'date', 'account_id', 'security_id', 'lot_index'], {
    account_name: 'string', institution: 'string', ticker: 'string',
    security_name: 'string', security_type: 'string', quantity: 'number',
    price: 'number', value: 'number', cost_basis: 'number', currency: 'string', source: 'string',
  })

  await encryptTable('investment_transactions', 'id', {
    institution: 'string', account_name: 'string', ticker: 'string',
    security_name: 'string', security_type: 'string', quantity: 'number',
    price: 'number', amount: 'number', fees: 'number', type: 'string',
    subtype: 'string', currency: 'string',
  })

  await encryptTable('account_balance_snapshots', ['user_id', 'date', 'account_id'], {
    account_name: 'string', institution_name: 'string', current: 'number',
    available: 'number', credit_limit: 'number', type: 'string',
    subtype: 'string', currency: 'string',
  })

  await encryptTable('securities', 'security_id', {
    ticker: 'string', name: 'string', type: 'string', currency: 'string',
  })

  await encryptTable('cli_tokens', 'id', {
    name: 'string',
  })

  console.log(`\n${'='.repeat(60)}`)
  console.log(`  MIGRATION ${DRY_RUN ? 'DRY RUN ' : ''}COMPLETE`)
  console.log(`${'='.repeat(60)}\n`)

  await pool.end()
}

main().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
