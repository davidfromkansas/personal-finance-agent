/**
 * One-time backfill: re-syncs all Plaid items for all users from scratch
 * so that existing transactions get populated with all enrichment fields
 * (original_description, merchant_name, location added in 013;
 *  website, counterparties, payment_meta, check_number, category detail added in 014).
 *
 * Run once: node server/backfill-transaction-fields.js
 */
import 'dotenv/config'
import { query } from './db.js'
import { getPlaidClient } from './lib/plaidClient.js'
import {
  getSyncCursor, updateSyncCursor, clearSyncCursor,
  upsertTransactions, deleteTransactionsByPlaidIds,
  updateTransactionAccountNames,
} from './db.js'

async function syncTransactionsForItem(plaidClient, userId, itemId, accessToken) {
  await clearSyncCursor(userId, itemId)
  let cursor = null
  let hasMore = true
  let totalUpserted = 0

  while (hasMore) {
    const res = await plaidClient.transactionsSync({
      access_token: accessToken,
      ...(cursor ? { cursor } : {}),
      options: { personal_finance_category_version: 'v2', include_original_description: true },
    })
    const { added, modified, removed, next_cursor, has_more } = res.data

    // Resolve account names from accounts array on first page
    const accountNames = {}
    if (res.data.accounts) {
      for (const a of res.data.accounts) {
        accountNames[a.account_id] = a.name ?? a.official_name ?? null
      }
    }

    const toUpsert = [...added, ...modified].map((t) => {
      const logoUrl = t.logo_url ?? t.logoUrl ?? t.counterparties?.[0]?.logo_url ?? null
      const loc = t.location ?? null
      const location = (loc && Object.values(loc).some(Boolean)) ? loc : null
      const paymentMeta = t.payment_meta ?? null
      const hasPaymentMeta = paymentMeta && Object.values(paymentMeta).some(Boolean)
      return {
        account_id: t.account_id,
        transaction_id: t.transaction_id,
        name: t.name || t.merchant_name || 'Transaction',
        amount: t.amount,
        date: t.date,
        authorized_date: t.authorized_date ?? null,
        account_name: accountNames[t.account_id] ?? null,
        payment_channel: t.payment_channel ?? null,
        personal_finance_category: t.personal_finance_category?.primary ?? null,
        pending: t.pending === true,
        logo_url: logoUrl,
        original_description: t.original_description ?? null,
        merchant_name: t.merchant_name ?? null,
        location,
        website: t.website ?? null,
        personal_finance_category_detailed: t.personal_finance_category?.detailed ?? null,
        personal_finance_category_confidence: t.personal_finance_category?.confidence_level ?? null,
        counterparties: t.counterparties?.length ? t.counterparties : null,
        payment_meta: hasPaymentMeta ? paymentMeta : null,
        check_number: t.check_number ?? null,
      }
    })

    if (toUpsert.length) {
      await upsertTransactions(userId, itemId, toUpsert)
      totalUpserted += toUpsert.length
    }

    const toRemove = (removed ?? []).map((r) => r.transaction_id)
    if (toRemove.length) await deleteTransactionsByPlaidIds(toRemove)

    cursor = next_cursor
    hasMore = has_more
  }

  await updateSyncCursor(userId, itemId, cursor)
  return totalUpserted
}

async function main() {
  const { rows: items } = await query(
    `SELECT user_id, item_id, access_token, institution_name FROM plaid_items ORDER BY created_at ASC`
  )

  if (items.length === 0) {
    console.log('No Plaid items found.')
    process.exit(0)
  }

  console.log(`Backfilling ${items.length} Plaid item(s)…`)
  const plaidClient = getPlaidClient()

  for (const item of items) {
    process.stdout.write(`  ${item.institution_name ?? item.item_id} (user ${item.user_id})… `)
    try {
      const count = await syncTransactionsForItem(plaidClient, item.user_id, item.item_id, item.access_token)
      console.log(`${count} transactions upserted`)
    } catch (err) {
      console.error(`FAILED: ${err.response?.data?.error_message ?? err.message}`)
    }
  }

  console.log('Done.')
  process.exit(0)
}

main()
