/**
 * Financial agent — core chat logic.
 * Calls Anthropic API with full conversation history and tool loop.
 */
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { TOOL_DEFINITIONS, executeTool } from './tools.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_SYSTEM_PROMPT = readFileSync(join(__dirname, 'system-prompt.md'), 'utf8').trim()

// Initialized lazily so dotenv has already loaded by the time it's first called
let _client = null
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

const MODE_ADDENDA = {
  Transactions: '\n\nFocus on spending, income, budgeting, and transaction history.',
  Investments: '\n\nFocus on portfolio performance, holdings, asset allocation, and investment strategy.',
  Accounts: '\n\nFocus on account balances, net worth, and account overview.',
  Auto: '',
}

const MAX_TOOL_ITERATIONS = 5

export async function runChat({ message, history, mode, userId }) {
  const today = new Date().toISOString().slice(0, 10)
  const systemPrompt = `Today's date is ${today}.\n\n` + BASE_SYSTEM_PROMPT + (MODE_ADDENDA[mode] ?? '')

  const messages = [
    ...history,
    { role: 'user', content: message },
  ]

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: systemPrompt,
      tools: TOOL_DEFINITIONS,
      messages,
    })

    if (response.stop_reason === 'end_turn') {
      return response.content.find(b => b.type === 'text')?.text ?? ''
    }

    if (response.stop_reason !== 'tool_use') {
      return response.content.find(b => b.type === 'text')?.text ?? ''
    }

    // Execute all tool calls and collect results
    messages.push({ role: 'assistant', content: response.content })

    const toolResults = []
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue
      let result
      try {
        result = await executeTool(block.name, block.input, userId)
      } catch (err) {
        result = { error: err.message }
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      })
    }

    messages.push({ role: 'user', content: toolResults })
  }

  return 'I ran into an issue processing your request. Please try again.'
}
