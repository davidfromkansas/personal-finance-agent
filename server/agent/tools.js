/**
 * Agent tool definitions and handlers.
 * Each handler receives (input, userId) and returns a plain object — never trusts user-supplied IDs.
 */
import { getAgentSpendingSummary, getAgentTransactions } from './queries.js'

export const TOOL_DEFINITIONS = [
  {
    name: 'get_spending_summary',
    description: 'Get total spending broken down by category for a date range. Use this to answer questions like "how much did I spend on food in February?" or "what were my biggest expenses last quarter?" Always pass explicit after_date and before_date based on what the user asked for.',
    input_schema: {
      type: 'object',
      properties: {
        after_date: {
          type: 'string',
          description: 'Start of date range, inclusive (YYYY-MM-DD)',
        },
        before_date: {
          type: 'string',
          description: 'End of date range, inclusive (YYYY-MM-DD)',
        },
        category: {
          type: 'string',
          description: 'Optional: filter to a specific Plaid category (e.g. FOOD_AND_DRINK, TRAVEL, SHOPPING). Omit to get all categories.',
        },
      },
      required: ['after_date', 'before_date'],
    },
  },
  {
    name: 'get_transactions',
    description: 'Fetch a list of transactions for a date range. Use this when the user asks about specific purchases, merchants, or wants to see individual transactions. Returns all matching transactions with no row limit. Set spending_only=true when the user asks about purchases, expenses, or spending (excludes refunds, income, and transfers).',
    input_schema: {
      type: 'object',
      properties: {
        after_date: {
          type: 'string',
          description: 'Only return transactions on or after this date (YYYY-MM-DD)',
        },
        before_date: {
          type: 'string',
          description: 'Only return transactions on or before this date (YYYY-MM-DD)',
        },
        category: {
          type: 'string',
          description: 'Optional: filter to a Plaid category (e.g. FOOD_AND_DRINK, TRAVEL)',
        },
        spending_only: {
          type: 'boolean',
          description: 'If true, exclude income and transfers but keep merchant refunds (negative amounts) so they can be netted against charges. Use this whenever the user asks about spending or purchases.',
        },
      },
    },
  },
]

export async function executeTool(name, input, userId) {
  switch (name) {
    case 'get_spending_summary':
      return getAgentSpendingSummary(userId, input.after_date, input.before_date, input.category ?? null)

    case 'get_transactions':
      return getAgentTransactions(userId, {
        afterDate: input.after_date,
        beforeDate: input.before_date,
        category: input.category,
        spendingOnly: input.spending_only,
      })

    default:
      return { error: `Unknown tool: ${name}` }
  }
}
