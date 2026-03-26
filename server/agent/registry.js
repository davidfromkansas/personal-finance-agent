/**
 * Agent registry — self-registration pattern.
 * Agents call registerAgent() on import; the orchestrator reads the registry dynamically.
 * Adding a new agent requires only a new file + one import in agents/index.js.
 */

const agents = new Map()

export function registerAgent({ name, description, handler }) {
  agents.set(name, { description, handler })
}

/** Returns tool definitions for the orchestrator's tool list, built dynamically from registered agents. */
export function getOrchestratorTools() {
  return Array.from(agents.entries()).map(([name, { description }]) => ({
    name: `ask_${name}_agent`,
    description,
    input_schema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description:
            'The specific question to ask this agent. Be precise — include date ranges, amounts, or tickers if relevant.',
        },
      },
      required: ['question'],
    },
  }))
}

/**
 * Executes a registered agent by tool name.
 * emit is threaded through so sub-agent tool activity fires into the SSE stream.
 * history is sliced to the last 4 turns before being passed to the agent.
 */
export async function executeAgentTool(toolName, { question }, userId, history, emit) {
  const agentName = toolName.replace(/^ask_/, '').replace(/_agent$/, '')
  const agent = agents.get(agentName)
  if (!agent) throw new Error(`Unknown agent: ${agentName}`)
  const recentHistory = history.slice(-4)
  return agent.handler({ message: question, history: recentHistory, userId, emit })
}
