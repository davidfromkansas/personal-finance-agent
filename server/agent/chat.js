/**
 * Financial agent — core chat routing.
 * Known modes route directly to the appropriate sub-agent (no orchestrator LLM call).
 * Auto mode uses the orchestrator which decides which agent(s) to call.
 */
import './agents/index.js'  // triggers all agent self-registrations
import { streamSpendingAgent } from './agents/spendingAgent.js'
import { streamPortfolioAgent } from './agents/portfolioAgent.js'
import { streamAccountsAgent } from './agents/accountsAgent.js'
import { streamMarketResearchAgent } from './agents/marketResearchAgent.js'
import { runOrchestrator } from './agents/orchestrator.js'
import Anthropic from '@anthropic-ai/sdk'
import { todayET } from '../lib/dateUtils.js'

let _client = null
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

const MODE_TO_AGENT = {
  Transactions: streamSpendingAgent,
  Investments: streamPortfolioAgent,
  Accounts: streamAccountsAgent,
  Research: streamMarketResearchAgent,
}

async function* fallbackStream(text) { yield text }

/**
 * Main entry point. Returns an async generator that yields text chunks.
 * The route handler iterates this and emits each chunk as a SSE text event.
 * emit() is called by sub-agents for tool_call/tool_done activity events.
 */
export async function* runChat({ message, history, mode, userId, emit }) {
  const recentHistory = history.slice(-4)

  if (MODE_TO_AGENT[mode]) {
    yield* MODE_TO_AGENT[mode]({ message, history: recentHistory, userId, emit })
    return
  }

  if (mode !== 'Auto') {
    yield* fallbackStream("That feature isn't available yet. You can ask me about your spending or investments.")
    return
  }

  yield* runOrchestrator({ message, history: recentHistory, userId, emit })
}

/**
 * Demo chat — single API call, no tools, no auth.
 * Returns an async generator for SSE streaming consistency with the real endpoint.
 */
export async function* runDemoChat({ message, history, mode, demoContext }) {
  const today = todayET()
  const systemPrompt = `You are a helpful personal finance assistant embedded in a personal finance demo app. Today is ${today}.

The user is exploring a demo with realistic fake data for a fictional user named Alex Rivera. Answer all questions based solely on the financial data provided below. Be specific, use real numbers from the data, and format dollars with $ and commas. Keep answers concise and friendly.

${demoContext}`

  const stream = getClient().messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [...history, { role: 'user', content: message }],
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text
    }
  }
}
