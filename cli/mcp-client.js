/**
 * Thin MCP client wrapper.
 * Connects to the Abacus MCP server at {serverUrl}/mcp using StreamableHTTP transport.
 * Sends Authorization: Bearer {token} on every request.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

export async function createMcpClient(serverUrl, token) {
  const mcpUrl = new URL('/mcp', serverUrl)

  const transport = new StreamableHTTPClientTransport(mcpUrl, {
    requestInit: {
      headers: { Authorization: `Bearer ${token}` },
    },
  })

  const client = new Client({ name: 'abacus-cli', version: '1.0.0' })
  await client.connect(transport)

  // Open a persistent GET SSE channel so the server can push notifications
  // (e.g. agent progress) in real-time while a tool call POST is in flight.
  import('fs').then(({ appendFileSync }) => {
    transport.resumeStream(undefined).catch((err) => {
      appendFileSync('/tmp/abacus-debug.log', '[resumeStream error] ' + err.message + '\n')
    })
    appendFileSync('/tmp/abacus-debug.log', '[resumeStream started]\n')
  })

  return client
}

/**
 * Ask a question via the SSE streaming endpoint (/api/agent/chat).
 * Calls onAgentStart/onAgentDone in real-time as orchestrator sub-agents fire.
 * Returns the full answer text when complete.
 */
export async function askQuestion(serverUrl, token, question, history = [], { onAgentStart, onAgentDone, onToolCall, signal } = {}) {
  const url = new URL('/api/agent/chat', serverUrl)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ message: question, history: history.slice(-6), mode: 'Auto' }),
    signal,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Server error: ${res.status} ${body}`)
  }

  // Track pending agent starts so we can pair with done events
  const pendingAgents = new Map()
  const answerChunks = []

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() // keep incomplete line
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      let event
      try { event = JSON.parse(line.slice(6)) } catch { continue }
      if (event.type === 'error') {
        throw new Error(event.message ?? 'Something went wrong')
      } else if (event.type === 'text') {
        answerChunks.push(event.text)
      } else if (event.type === 'tool_call' && event.agent) {
        onToolCall?.(event.agent, event.tool)
      } else if (event.type === 'agent_start') {
        pendingAgents.set(event.agent, { question: event.question ?? '', startTime: Date.now() })
        onAgentStart?.(event.agent, event.question ?? '')
      } else if (event.type === 'agent_done') {
        const p = pendingAgents.get(event.agent)
        const duration = p ? Date.now() - p.startTime : event.duration ?? 0
        onAgentDone?.(event.agent, event.toolCount ?? 0, duration)
        pendingAgents.delete(event.agent)
      }
    }
  }

  return answerChunks.join('')
}

export async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args })
  return result.content?.[0]?.text ?? ''
}
