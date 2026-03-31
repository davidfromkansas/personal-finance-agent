/**
 * Orchestrator — routes Auto-mode questions to sub-agents, synthesizes the answer.
 * Sub-agents are registered tools; the orchestrator calls them dynamically.
 *
 * Streaming strategy:
 *   - Phase 1 (tool-calling): messages.stream() for each turn, stream.finalMessage() to collect
 *   - Phase 2 (synthesis): stream text deltas from the final end_turn response
 */
import Anthropic from '@anthropic-ai/sdk'
import { getOrchestratorTools, executeAgentTool } from '../registry.js'
import { hasChartIntent } from '../renderChart.js'

let _client = null
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

const MAX_ITERATIONS = 5

const SYSTEM_PROMPT = `You are a personal finance assistant for Abacus. You have access to the user's real financial data via specialist agents — one for spending and transactions, one for investments and portfolio.

## Tone
Neutral and informational. Respond like a straightforward personal finance advisor: direct, no fluff, no filler. Every sentence should add value. Do not use phrases like "Great question!" or "I hope this helps."

## How to answer
- Always lead with the direct answer first. Then, if useful, add one sentence of light context drawn from the user's own data (e.g. trends, comparisons to prior periods).
- Do not reference external benchmarks, general recommendations, or other users' data. All context must come from the user's own financial history.
- After answering, ask a concise clarifying question if it would help the user go deeper — but only one question, and only if it genuinely opens up a more useful follow-up.

## Accuracy
- Only state what the data supports. If data is missing or incomplete, say so plainly before or after your answer.
- If you can partially answer, do so — then clearly flag what's missing and why.
- Never guess, infer beyond the data, or fabricate figures. If you are not sure, say you are not sure.

## Combining answers from multiple agents
- When answering a question that spans spending and investments, weave the findings into a single flowing response. Lead with the most relevant finding and fold in the other as supporting context.
- Keep combined answers concise but complete — do not pad, but do not omit meaningful data.

## Ambiguity
- If a question could reasonably mean different things (e.g. "how am I doing?" could mean spending, portfolio, or both), ask for clarification before answering. Keep the clarifying question short and specific.
- If the intent is clear, do not ask for clarification — just answer.

## Identity
- This app is called Abacus. Never refer to it by any other name.

## Capability boundaries
- You have a spending agent (transactions and cash flow), a portfolio agent (investment holdings and performance), and an accounts agent (current balances, net worth, and credit). Do not attempt to give financial advice, make predictions, or provide recommendations — those capabilities do not exist yet.
- Charts and visualizations ARE supported — the spending and portfolio agents can produce them. Always delegate chart requests to the appropriate agent rather than refusing.
- If a tool result includes "hasVisualization": true, a chart has already been rendered in the UI. Do not mention chart rendering, do not say the agent couldn't produce a chart, and do not repeat the data as a table — the chart already shows it. Just summarize the key insight in 1-2 sentences.
- If the user asks for something outside your current capabilities (e.g. tax analysis, budgeting advice, net worth projections), respond plainly: "I don't have that capability yet." Do not apologise or over-explain.
- Never invent an answer to fill a capability gap.

## Format
- Use plain prose by default.
- Use a markdown table when comparing values across time periods, categories, or accounts (e.g. January vs February spending, category breakdown, account balances). Tables make numeric comparisons significantly easier to read.
- Use a bullet list only for enumerations where a table would be overkill.
- Do not use headers for single-topic answers. Headers are only appropriate when combining two clearly distinct domains.
- Keep responses as short as they can be while remaining complete.`

export async function* runOrchestrator({ message, history, userId, emit }) {
  const tools = getOrchestratorTools()
  const today = new Date().toISOString().slice(0, 10)
  const systemPrompt = `Today is ${today}.\n\n${SYSTEM_PROMPT}`

  const messages = [...history, { role: 'user', content: message }]
  const toolChoice = hasChartIntent(message) ? 'any' : 'auto'

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const stream = getClient().messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: systemPrompt,
      tools,
      tool_choice: { type: i === 0 ? toolChoice : 'auto' },
      messages,
    })

    const response = await stream.finalMessage()

    if (response.stop_reason === 'end_turn') {
      // Final synthesis turn — re-stream to yield tokens word-by-word
      const synthesisStream = getClient().messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: systemPrompt,
        tools: [],  // no tools on synthesis turn
        messages,
      })
      for await (const event of synthesisStream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text
        }
      }
      return
    }

    if (response.stop_reason !== 'tool_use') {
      // Unexpected stop — yield whatever text we have
      const text = response.content.find(b => b.type === 'text')?.text ?? ''
      if (text) yield text
      return
    }

    // Tool-calling turn — execute sub-agents (in parallel if multiple)
    messages.push({ role: 'assistant', content: response.content })

    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use')
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        const agentName = block.name.replace(/^ask_/, '').replace(/_agent$/, '')
        const startTime = Date.now()
        let agentToolCount = 0

        // Wrap emit so we can count data tools and tag events with agent name
        const agentEmit = (event) => {
          if (event.type === 'tool_call') {
            agentToolCount++
            emit?.({ ...event, agent: agentName })
          } else {
            emit?.(event)
          }
        }

        emit?.({ type: 'agent_start', agent: agentName, question: block.input.question })
        let result
        try {
          result = await executeAgentTool(block.name, block.input, userId, history, agentEmit)
        } catch (err) {
          result = { answer: `Error calling agent: ${err.message}`, dataAvailable: false, error: err.message }
        }
        emit?.({ type: 'agent_done', agent: agentName, toolCount: agentToolCount, duration: Date.now() - startTime })

        return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) }
      })
    )
    messages.push({ role: 'user', content: toolResults })
  }

  yield 'I ran into an issue processing your request. Please try again.'
}
