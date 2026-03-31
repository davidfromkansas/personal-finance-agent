/**
 * Terminal output formatter.
 * - Renders markdown pipe tables as box-drawing tables with aligned columns
 * - Strips inline markdown (bold, italic, inline code)
 * - Renders markdown headers as bold plain text
 */

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const RESET  = '\x1b[0m'
const BOLD   = '\x1b[1m'
const DIM    = '\x1b[2m'
const CYAN   = '\x1b[36m'

const bold = s => `${BOLD}${s}${RESET}`
const dim  = s => `${DIM}${s}${RESET}`
const cyan = s => `${CYAN}${s}${RESET}`

// Strip ANSI codes to get true visual length
function visualLen(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '').length
}

function pad(s, width) {
  return s + ' '.repeat(Math.max(0, width - visualLen(s)))
}

// ── Inline markdown stripping ─────────────────────────────────────────────────
function stripInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, (_, s) => bold(s))   // **bold**
    .replace(/\*(.+?)\*/g, (_, s) => s)              // *italic* → plain
    .replace(/__(.+?)__/g, (_, s) => bold(s))        // __bold__
    .replace(/_(.+?)_/g, (_, s) => s)                // _italic_ → plain
    .replace(/`(.+?)`/g, (_, s) => cyan(s))          // `code` → cyan
}

// ── Table parser + renderer ───────────────────────────────────────────────────
function isTableRow(line) {
  return line.trim().startsWith('|') && line.trim().endsWith('|')
}

function isSeparatorRow(line) {
  return isTableRow(line) && /^\|[\s\-:|]+\|$/.test(line.trim())
}

function parseRow(line) {
  return line.trim()
    .slice(1, -1)           // strip leading and trailing |
    .split('|')
    .map(cell => stripInline(cell.trim()))
}

function renderTable(rows) {
  // rows[0] = header, rows[1] = separator (skip), rest = data
  const header = rows[0]
  const data   = rows.slice(2)
  const allRows = [header, ...data]
  const colCount = Math.max(...allRows.map(r => r.length))

  // Calculate max visual width per column
  const widths = Array.from({ length: colCount }, (_, i) =>
    Math.max(...allRows.map(r => visualLen(r[i] ?? '')))
  )

  const bar    = (l, m, r) => l + widths.map(w => '─'.repeat(w + 2)).join(m) + r
  const topBar = dim(bar('┌', '┬', '┐'))
  const midBar = dim(bar('├', '┼', '┤'))
  const botBar = dim(bar('└', '┴', '┘'))
  const row    = (cells, isBold) =>
    dim('│') + cells.map((cell, i) => {
      const padded = pad(cell ?? '', widths[i])
      return ' ' + (isBold ? bold(padded) : padded) + ' ' + dim('│')
    }).join('')

  return [
    topBar,
    row(header, true),
    midBar,
    ...data.map(r => row(r, false)),
    botBar,
  ].join('\n')
}

// ── Agent activity parser ─────────────────────────────────────────────────────
const AGENT_LABELS = {
  spending:  'Spending',
  portfolio: 'Portfolio',
  accounts:  'Accounts',
}

/**
 * Strips [ABACUS_AGENT:name|toolCount|durationMs|question] markers from the
 * top of the response and returns them separately so the CLI can display them
 * as activity lines.
 * Returns { activities: Array<{agent, toolCount, duration, question}>, answer: string }
 */
export function extractAgentActivity(text) {
  const firstLine = text.split('\n')[0]
  const activities = []
  const matches = firstLine.matchAll(/\[ABACUS_AGENT:([^|]+)\|(\d+)\|(\d+)\|([^\]]*)\]/g)
  for (const m of matches) {
    activities.push({
      agent:     m[1],
      toolCount: parseInt(m[2], 10),
      duration:  parseInt(m[3], 10),
      question:  m[4].trim(),
    })
  }
  const answer = activities.length ? text.slice(firstLine.length + 1) : text
  return { activities, answer }
}

export function agentLabel(name) {
  return AGENT_LABELS[name] ?? (name.charAt(0).toUpperCase() + name.slice(1))
}

// ── Main formatter ────────────────────────────────────────────────────────────
export function format(text) {
  const lines = text.split('\n')
  const out = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Collect a table block
    if (isTableRow(line)) {
      const tableLines = []
      while (i < lines.length && isTableRow(lines[i])) {
        tableLines.push(lines[i])
        i++
      }
      // Need at least header + separator + one data row to bother rendering
      const parsed = tableLines.map(parseRow)
      const hasSep = tableLines.some(isSeparatorRow)
      if (hasSep && parsed.length >= 2) {
        // Remove separator row from parsed (keep header + data)
        const withoutSep = tableLines
          .filter(l => !isSeparatorRow(l))
          .map(parseRow)
        // Re-insert separator at index 1 as a signal for renderTable
        const rows = [withoutSep[0], null, ...withoutSep.slice(1)]
        out.push(renderTable(rows))
      } else {
        // Fallback: just strip inline markdown
        tableLines.forEach(l => out.push(stripInline(l)))
      }
      continue
    }

    // Markdown headers → bold
    const headerMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headerMatch) {
      out.push(bold(headerMatch[2]))
      i++
      continue
    }

    // Everything else — strip inline markdown
    out.push(stripInline(line))
    i++
  }

  return out.join('\n')
}
