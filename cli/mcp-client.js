/**
 * Thin MCP client wrapper.
 * Connects to the Crumbs MCP server at {serverUrl}/mcp using StreamableHTTP transport.
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

  const client = new Client({ name: 'copilot-cli', version: '1.0.0' })
  await client.connect(transport)
  return client
}

export async function askQuestion(client, question) {
  const result = await client.callTool({ name: 'ask_question', arguments: { question } })
  return result.content?.[0]?.text ?? ''
}
