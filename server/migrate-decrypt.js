#!/usr/bin/env node
/**
 * Reverse migration: decrypt all encrypted data back to plaintext and restore
 * Firebase UIDs as user_id. Use this to roll back the encryption migration.
 *
 * Usage:
 *   node server/migrate-decrypt.js                  # full run
 *   node server/migrate-decrypt.js --dry-run        # preview changes without writing
 *
 * Prerequisites:
 *   - ENCRYPTION_KEY must be set in env (same key used for encryption)
 *   - DATABASE_URL must be set in env
 */
import 'dotenv/config'
import pg from 'pg'
import {
  decrypt, decryptNum, decryptJSON, decryptBool,
} from './lib/crypto.js'

const { Pool } = pg
const DRY_RUN = process.argv.includes('--dry-run')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function q(text, params) {
  return pool.query(text, params)
}

function isEncrypted(val) {
  if (val == null) return false
  const s = String(val)
  const parts = s.split(':')
  return parts.length === 3 && parts.every(p => p.length > 0)
}

// ── Step 1: Restore Firebase UIDs ───────────────────────────────────────────

async function restoreUserIds() {
  console.log('\n── Step 1: Restore Firebase UIDs from users table ──')

  const { rows: users } = await q(`SELECT id, firebase_uid_encrypted FROM users`)
  if (users.length === 0) {
    console.log('  No user mappings found — skipping')
    return
  }

  const tables = ['plaid_items', 'transactions', 'portfolio_snapshots', 'portfolio_account_snapshots',
    'holdings_snapshots', 'investment_transactions', 'account_balance_snapshots', 'cli_tokens']

  for (const user of users) {
    const firebaseUid = decrypt(user.firebase_uid_encrypted)
    if (!firebaseUid) {
      console.log(`  WARNING: Could not decrypt Firebase UID for ${user.id}`)
      continue
    }

    console.log(`  Restoring ${user.id} → ${firebaseUid.slice(0, 8)}...`)
    if (DRY_RUN) continue

    for (const table of tables) {
      const { rowCount } = await q(`UPDATE ${table} SET user_id = $1 WHERE user_id = $2`, [firebaseUid, user.id])
      if (rowCount > 0) console.log(`    Updated ${rowCount} row(s) in ${table}`)
    }
  }
}

// ── Step 2: Decrypt table data ──────────────────────────────────────────────

async function decryptTable(tableName, primaryKey, fields) {
  console.log(`\n── Decrypting ${tableName} ──`)
  const { rows } = await q(`SELECT * FROM ${tableName}`)
  console.log(`  ${rows.length} row(s) to process`)

  let decrypted = 0, skipped = 0

  for (const row of rows) {
    const updates = {}
    for (const [col, type] of Object.entries(fields)) {
      const val = row[col]
      if (val == null) continue
      if (!isEncrypted(val)) { skipped++; continue }

      switch (type) {
        case 'number': {
          const n = decryptNum(val)
          updates[col] = n
          break
        }
        case 'json': {
          const obj = decryptJSON(val)
          updates[col] = obj != null ? JSON.stringify(obj) : null
          break
        }
        case 'bool': {
          updates[col] = decryptBool(val)
          break
        }
        default: updates[col] = decrypt(val)
      }
    }

    if (Object.keys(updates).length === 0) continue

    if (DRY_RUN) {
      decrypted++
      continue
    }

    const setClauses = []
    const params = []
    let p = 1
    for (const [col, val] of Object.entries(updates)) {
      setClauses.push(`${col} = $${p++}`)
      params.push(val)
    }

    const pkCols = Array.isArray(primaryKey) ? primaryKey : [primaryKey]
    const whereClauses = pkCols.map(pk => {
      params.push(row[pk])
      return `${pk} = $${p++}`
    })

    await q(`UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`, params)
    decrypted++
  }

  console.log(`  Decrypted: ${decrypted}, Already plaintext (skipped): ${skipped}`)
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  DATA DECRYPTION (ROLLBACK) MIGRATION ${DRY_RUN ? '(DRY RUN)' : ''}`)
  console.log(`${'='.repeat(60)}`)

  if (!process.env.ENCRYPTION_KEY) {
    console.error('ERROR: ENCRYPTION_KEY is not set. Cannot decrypt without it.')
    process.exit(1)
  }

  // Step 1: Restore Firebase UIDs
  await restoreUserIds()

  // Step 2: Decrypt each table (same tables/fields as encrypt migration)
  await decryptTable('plaid_items', 'id', {
    access_token: 'string', institution_name: 'string', accounts_cache: 'json',
    error_code: 'string', products_granted: 'string', sync_cursor: 'string',
  })

  await decryptTable('transactions', 'id', {
    name: 'string', amount: 'number', account_name: 'string', payment_channel: 'string',
    personal_finance_category: 'string', pending: 'bool', logo_url: 'string',
    original_description: 'string', merchant_name: 'string', location: 'json',
    website: 'string', personal_finance_category_detailed: 'string',
    personal_finance_category_confidence: 'string', counterparties: 'json',
    payment_meta: 'json', check_number: 'string', recurring: 'string',
  })

  await decryptTable('portfolio_snapshots', ['user_id', 'date'], {
    total_value: 'number', source: 'string', unavailable_items: 'json',
  })

  await decryptTable('portfolio_account_snapshots', ['user_id', 'date', 'account_id'], {
    account_name: 'string', institution: 'string', value: 'number', source: 'string',
  })

  await decryptTable('holdings_snapshots', ['user_id', 'date', 'account_id', 'security_id', 'lot_index'], {
    account_name: 'string', institution: 'string', ticker: 'string',
    security_name: 'string', security_type: 'string', quantity: 'number',
    price: 'number', value: 'number', cost_basis: 'number', currency: 'string', source: 'string',
  })

  await decryptTable('investment_transactions', 'id', {
    institution: 'string', account_name: 'string', ticker: 'string',
    security_name: 'string', security_type: 'string', quantity: 'number',
    price: 'number', amount: 'number', fees: 'number', type: 'string',
    subtype: 'string', currency: 'string',
  })

  await decryptTable('account_balance_snapshots', ['user_id', 'date', 'account_id'], {
    account_name: 'string', institution_name: 'string', current: 'number',
    available: 'number', credit_limit: 'number', type: 'string',
    subtype: 'string', currency: 'string',
  })

  await decryptTable('securities', 'security_id', {
    ticker: 'string', name: 'string', type: 'string', currency: 'string',
  })

  await decryptTable('cli_tokens', 'id', {
    name: 'string',
  })

  console.log(`\n${'='.repeat(60)}`)
  console.log(`  ROLLBACK MIGRATION ${DRY_RUN ? 'DRY RUN ' : ''}COMPLETE`)
  console.log(`${'='.repeat(60)}\n`)

  await pool.end()
}

main().catch(err => {
  console.error('Rollback migration failed:', err)
  process.exit(1)
})
