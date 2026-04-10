#!/usr/bin/env node
/**
 * CLI tool for decrypting data in the database (developer debugging).
 *
 * Usage:
 *   node server/decrypt-tool.js --table transactions --user <uuid> --limit 10
 *   node server/decrypt-tool.js --raw "iv:ciphertext:tag"
 *   node server/decrypt-tool.js --lookup-firebase <firebase-uid>
 *
 * Requires ENCRYPTION_KEY and DATABASE_URL in env (or server/.env).
 */
import 'dotenv/config'
import pg from 'pg'
import { decrypt, decryptNum, decryptJSON, decryptBool, decryptRow, hashFirebaseUid } from './lib/crypto.js'

const { Pool } = pg

const TABLE_FIELDS = {
  plaid_items: {
    access_token: 'string', institution_name: 'string', accounts_cache: 'json',
    error_code: 'string', products_granted: 'string', sync_cursor: 'string',
  },
  transactions: {
    name: 'string', amount: 'number', account_name: 'string', payment_channel: 'string',
    personal_finance_category: 'string', pending: 'bool', logo_url: 'string',
    original_description: 'string', merchant_name: 'string', location: 'json',
    website: 'string', personal_finance_category_detailed: 'string',
    personal_finance_category_confidence: 'string', counterparties: 'json',
    payment_meta: 'json', check_number: 'string', recurring: 'string',
  },
  portfolio_snapshots: {
    total_value: 'number', source: 'string', unavailable_items: 'json',
  },
  portfolio_account_snapshots: {
    account_name: 'string', institution: 'string', value: 'number', source: 'string',
  },
  holdings_snapshots: {
    account_name: 'string', institution: 'string', ticker: 'string',
    security_name: 'string', security_type: 'string', quantity: 'number',
    price: 'number', value: 'number', cost_basis: 'number', currency: 'string', source: 'string',
  },
  investment_transactions: {
    institution: 'string', account_name: 'string', ticker: 'string',
    security_name: 'string', security_type: 'string', quantity: 'number',
    price: 'number', amount: 'number', fees: 'number', type: 'string',
    subtype: 'string', currency: 'string',
  },
  account_balance_snapshots: {
    account_name: 'string', institution_name: 'string', current: 'number',
    available: 'number', credit_limit: 'number', type: 'string',
    subtype: 'string', currency: 'string',
  },
  securities: {
    ticker: 'string', name: 'string', type: 'string', currency: 'string',
  },
  cli_tokens: {
    name: 'string',
  },
}

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--table') opts.table = args[++i]
    else if (args[i] === '--user') opts.user = args[++i]
    else if (args[i] === '--limit') opts.limit = parseInt(args[++i], 10)
    else if (args[i] === '--raw') opts.raw = args[++i]
    else if (args[i] === '--lookup-firebase') opts.lookupFirebase = args[++i]
    else if (args[i] === '--help' || args[i] === '-h') opts.help = true
  }
  return opts
}

function printUsage() {
  console.log(`
Usage:
  node server/decrypt-tool.js --table <name> --user <uuid> [--limit N]
  node server/decrypt-tool.js --raw "iv:ciphertext:authTag"
  node server/decrypt-tool.js --lookup-firebase <firebase-uid>

Options:
  --table <name>              Table to query (${Object.keys(TABLE_FIELDS).join(', ')})
  --user <uuid>               User ID (opaque UUID) to filter by
  --limit <N>                 Max rows to display (default: 10)
  --raw <value>               Decrypt a single encrypted value
  --lookup-firebase <uid>     Find the opaque UUID for a Firebase UID
  --help                      Show this help
`)
}

async function main() {
  const opts = parseArgs()

  if (opts.help) {
    printUsage()
    return
  }

  // Mode 1: Decrypt a raw value
  if (opts.raw) {
    console.log('Decrypted:', decrypt(opts.raw))
    return
  }

  // Mode 2: Look up Firebase UID
  if (opts.lookupFirebase) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    const hash = hashFirebaseUid(opts.lookupFirebase)
    const { rows } = await pool.query(`SELECT id, created_at FROM users WHERE firebase_uid_hash = $1`, [hash])
    if (rows.length === 0) {
      console.log('No user found for that Firebase UID')
    } else {
      console.log('Opaque UUID:', rows[0].id)
      console.log('Created:', rows[0].created_at)
    }
    await pool.end()
    return
  }

  // Mode 3: Query and decrypt table rows
  if (!opts.table) {
    console.error('Error: --table is required (or use --raw / --lookup-firebase)')
    printUsage()
    process.exit(1)
  }

  const fields = TABLE_FIELDS[opts.table]
  if (!fields) {
    console.error(`Unknown table: ${opts.table}`)
    console.error(`Available: ${Object.keys(TABLE_FIELDS).join(', ')}`)
    process.exit(1)
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const limit = opts.limit || 10

  let sql = `SELECT * FROM ${opts.table}`
  const params = []
  if (opts.user) {
    params.push(opts.user)
    sql += ` WHERE user_id = $1`
  }
  sql += ` ORDER BY created_at DESC NULLS LAST LIMIT ${limit}`

  const { rows } = await pool.query(sql, params)
  console.log(`\n${rows.length} row(s) from ${opts.table}:\n`)

  for (const row of rows) {
    const decrypted = decryptRow(row, fields)
    console.log(JSON.stringify(decrypted, null, 2))
    console.log('---')
  }

  await pool.end()
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
