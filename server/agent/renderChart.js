/**
 * Visualization parsing — extracts ```visualization blocks from agent response text,
 * emits each as an artifact SSE event, and returns the cleaned text.
 *
 * Agents output structured JSON in a fenced block instead of calling a tool,
 * which avoids the model's trained refusal to "render charts".
 *
 * hasChartIntent() detects explicit visualization requests so the caller can set
 * tool_choice: "any" to prevent the model from short-circuiting with a refusal.
 */

const CHART_INTENT_PATTERN = /\b(chart|charts|graph|graphs|plot|plots|visuali[sz]e|visuali[sz]ation|diagram|diagrams|visual|visuals|infographic|infographics|trend\s+line|sparkline)\b/i

export function hasChartIntent(message) {
  return CHART_INTENT_PATTERN.test(message)
}

export function extractAndEmitVisualizations(text, emit) {
  const regex = /```visualization\n([\s\S]*?)\n```/g
  let match
  let hasVisualization = false
  while ((match = regex.exec(text)) !== null) {
    try {
      const d = JSON.parse(match[1])
      emit?.({ type: 'artifact', chart_type: d.display_type, title: d.title, data: d.data, x_key: d.x_key, y_keys: d.y_keys, y_label: d.y_label ?? null })
      hasVisualization = true
    } catch {
      // malformed JSON — skip silently
    }
  }
  const cleanText = text.replace(/```visualization\n[\s\S]*?\n```\n?/g, '').trim()
  return { text: cleanText, hasVisualization }
}
