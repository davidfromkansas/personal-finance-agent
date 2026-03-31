#!/usr/bin/env node
/**
 * abacus CLI — query your Abacus financial data from the terminal.
 *
 * Usage:
 *   abacus                     Interactive REPL
 *   abacus "question"          Single question, print answer, exit
 *   abacus login               Authenticate (browser redirect)
 *   abacus logout              Delete local token
 *   abacus logout --all        Delete local token + revoke all tokens server-side
 */
import readline from 'readline'
import { readConfig, deleteConfig, getServerUrl } from './config.js'
import { login } from './auth.js'
import { createMcpClient, askQuestion, callTool } from './mcp-client.js'
import { format, agentLabel } from './format.js'

// ── Colors (ANSI, no deps) ────────────────────────────────────────────────────
const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  red:     '\x1b[31m',
  white:   '\x1b[37m',
  yellow:  '\x1b[33m',
}
const dim    = s => `${c.dim}${s}${c.reset}`
const bold   = s => `${c.bold}${s}${c.reset}`
const cyan   = s => `${c.cyan}${s}${c.reset}`
const green  = s => `${c.green}${s}${c.reset}`
const red    = s => `${c.red}${s}${c.reset}`
const yellow = s => `${c.yellow}${s}${c.reset}`

// ── Spinner / activity display ────────────────────────────────────────────────
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

function startSpinner(label = 'Thinking') {
  let i = 0
  process.stdout.write('\n')
  const id = setInterval(() => {
    process.stdout.write(`\r${cyan(SPINNER_FRAMES[i++ % SPINNER_FRAMES.length])} ${dim(label + '...')}`)
  }, 80)
  return () => {
    clearInterval(id)
    process.stdout.write('\r\x1b[2K') // clear spinner line
  }
}

/**
 * Real-time activity display — redraws on each agent event (via MCP notifications)
 * and on each spinner tick. Returns { start, stop, agentStart, agentDone }.
 * stop() clears the dynamic output and returns the final activities array.
 */
function createActivityDisplay() {
  const activities = [] // { agent, question, done, toolCount, duration }
  let spinnerLabel = 'Thinking'
  let frame = 0
  let timer = null
  let renderedLines = 0

  function redraw() {
    if (renderedLines > 0) {
      const ups = renderedLines - 1
      process.stdout.write((ups > 0 ? `\x1b[${ups}A` : '') + `\r\x1b[J`)
    }
    const lines = []
    for (const a of activities) {
      const label = agentLabel(a.agent)
      const q = a.question
        ? ' ' + dim(`("${a.question.slice(0, 55)}${a.question.length > 55 ? '...' : ''}")`)
        : ''
      lines.push(`${cyan('●')} ${bold(label)}${q}`)
      if (a.done) {
        const s = (a.duration / 1000).toFixed(1)
        const n = a.toolCount
        lines.push(dim(`└ Called ${n} data source${n !== 1 ? 's' : ''} in ${s}s`))
      } else {
        for (const t of (a.tools ?? [])) {
          lines.push(dim(`  ↳ ${t}`))
        }
        lines.push(dim('└ Working...'))
      }
    }
    if (activities.length) lines.push('')
    const f = SPINNER_FRAMES[frame % SPINNER_FRAMES.length]
    lines.push(`${cyan(f)} ${dim(spinnerLabel + '...')}`)
    frame++
    process.stdout.write(lines.join('\n'))
    renderedLines = lines.length
  }

  const TOOL_LABELS = {
    get_spending_summary:        'spending summary',
    get_transactions:            'transactions',
    get_cash_flow:               'cash flow',
    get_accounts:                'account balances',
    get_net_worth:               'net worth',
    get_net_worth_history:       'net worth history',
    get_recurring_transactions:  'recurring transactions',
    get_portfolio:               'portfolio holdings',
    get_investment_transactions: 'investment transactions',
    get_holdings:                'holdings',
    get_holdings_history:        'holdings history',
    get_monthly_spending_by_account: 'monthly spending',
    get_balance_history:         'balance history',
    get_connected_accounts:      'connected accounts',
    get_current_balances:        'current balances',
  }

  return {
    start() {
      process.stdout.write('\n')
      redraw()
      timer = setInterval(redraw, 80)
    },
    stop() {
      clearInterval(timer)
      timer = null
      if (renderedLines > 0) {
        const ups = renderedLines - 1
        process.stdout.write((ups > 0 ? `\x1b[${ups}A` : '') + `\r\x1b[J`)
        renderedLines = 0
      }
      return [...activities]
    },
    agentStart(agent, question) {
      activities.push({ agent, question, done: false, toolCount: 0, duration: 0, tools: [] })
    },
    agentDone(agent, toolCount, duration) {
      for (let i = activities.length - 1; i >= 0; i--) {
        if (activities[i].agent === agent && !activities[i].done) {
          activities[i] = { ...activities[i], done: true, toolCount, duration }
          spinnerLabel = 'Constructing'
          break
        }
      }
    },
    toolCall(agent, tool) {
      for (let i = activities.length - 1; i >= 0; i--) {
        if (activities[i].agent === agent && !activities[i].done) {
          const label = TOOL_LABELS[tool] ?? tool.replace(/_/g, ' ')
          activities[i].tools.push(label)
          break
        }
      }
    },
  }
}

// ── Banner ────────────────────────────────────────────────────────────────────
// Solid block letters (5 lines × 29 chars) side-by-side with abacus frame (7 lines).
// Text lines 1-5 align with abacus rows 2-6 (bordered top/bottom are blank on text side).
// ● = bead in counted position, ○ = uncounted.
const B  = `${c.cyan}●${c.reset}`
const O  = `${c.dim}○${c.reset}`
const sp = '     ' // 5-space gap between text and abacus
const __ = ' '.repeat(35) // blank text column for border-only lines

const BANNER = `
  ${__}${sp}${c.dim}┌─────────────────────────────────────────┐${c.reset}
  ${__}${sp}${c.dim}│${c.reset}  ${B}  ${O}  ${B}  ${B}  ${O}  ${B}  ${B}  ${O}  ${B}  ${O}  ${B}  ${O}  ${B}  ${c.dim}│${c.reset}
  ${c.bold}${c.cyan} ███  ████   ███   ████ █   █  ████${c.reset}${sp}${c.dim}│${c.reset}  ${O}  ${B}  ${O}  ${B}  ${O}  ${B}  ${O}  ${B}  ${O}  ${B}  ${B}  ${O}  ${B}  ${c.dim}│${c.reset}
  ${c.bold}${c.cyan}█   █ █   █ █   █ █     █   █ █    ${c.reset}${sp}${c.dim}├─────────────────────────────────────────┤${c.reset}
  ${c.bold}${c.cyan}█████ ████  █████ █     █   █  ███ ${c.reset}${sp}${c.dim}│${c.reset}  ${B}  ${B}  ${O}  ${O}  ${B}  ${B}  ${B}  ${O}  ${B}  ${B}  ${O}  ${B}  ${O}  ${c.dim}│${c.reset}
  ${c.bold}${c.cyan}█   █ █   █ █   █ █     █   █     █${c.reset}${sp}${c.dim}│${c.reset}  ${B}  ${O}  ${B}  ${O}  ${B}  ${O}  ${B}  ${B}  ${O}  ${O}  ${B}  ${O}  ${B}  ${c.dim}│${c.reset}
  ${c.bold}${c.cyan}█   █ ████  █   █  ████  ███  ████ ${c.reset}${sp}${c.dim}│${c.reset}  ${B}  ${B}  ${O}  ${B}  ${O}  ${B}  ${O}  ${B}  ${O}  ${B}  ${O}  ${B}  ${B}  ${c.dim}│${c.reset}
  ${__}${sp}${c.dim}│${c.reset}  ${O}  ${B}  ${O}  ${O}  ${B}  ${B}  ${O}  ${O}  ${B}  ${O}  ${B}  ${B}  ${O}  ${c.dim}│${c.reset}
  ${__}${sp}${c.dim}│${c.reset}  ${B}  ${O}  ${B}  ${B}  ${O}  ${O}  ${B}  ${O}  ${B}  ${B}  ${O}  ${B}  ${O}  ${c.dim}│${c.reset}
  ${__}${sp}${c.dim}└─────────────────────────────────────────┘${c.reset}
  ${c.dim}Understand and Analyze your Personal Wealth in the CLI.${c.reset}
`

// ── Abacus bead animation ────────────────────────────────────────────────────
// 13 columns × 7 rows (2 top + 5 bottom). Initial state matches the hardcoded beads in BANNER above.
// Even columns rotate upward each tick; odd columns rotate downward.
let beadState = [
  [1,0,1,1,1,0,1], // col 0  (even → up)
  [0,1,1,0,1,1,0], // col 1  (odd  → down)
  [1,0,0,1,0,0,1], // col 2  (even → up)
  [1,1,0,0,1,0,1], // col 3  (odd  → down)
  [0,0,1,1,0,1,0], // col 4  (even → up)
  [1,1,1,0,1,1,0], // col 5  (odd  → down)
  [1,0,1,1,0,0,1], // col 6  (even → up)
  [0,1,0,1,1,0,0], // col 7  (odd  → down)
  [1,0,1,0,0,1,1], // col 8  (even → up)
  [0,1,1,0,1,0,1], // col 9  (odd  → down)
  [1,1,0,1,0,1,0], // col 10 (even → up)
  [0,0,1,0,1,1,1], // col 11 (odd  → down)
  [1,1,0,1,1,0,0], // col 12 (even → up)
]
function stepBeads() {
  for (let i = 0; i < 13; i++) {
    const a = beadState[i]
    beadState[i] = i % 2 === 0 ? [a[1], a[2], a[3], a[4], a[5], a[6], a[0]] : [a[6], a[0], a[1], a[2], a[3], a[4], a[5]]
  }
}
function renderBeadLine(row) {
  let s = `${c.dim}│${c.reset}`
  for (let col = 0; col < 13; col++) s += `  ${beadState[col][row] ? B : O}`
  return s + `  ${c.dim}│${c.reset}`
}
// Total newlines printed from banner start — drives cursor positioning for animation.
let linesFromBannerStart = 0
function addLines(n) { linesFromBannerStart += n }
// Bead rows at line offsets [2,3,5,6,7,8,9] from banner start.
// Abacus frame starts at terminal column 37: 2-space indent + 29-char text + 5-space gap + │.
const BEAD_ROW_POS = [2, 3, 5, 6, 7, 8, 9]
const ABACUS_COL = 43
let _rl = null // set after readline.createInterface — used to resync after cursor moves
function drawAbacus() {
  const th = process.stdout.rows || 40
  process.stdout.write('\x1b7') // DEC save cursor (wider terminal support than \x1b[s)
  for (let i = 0; i < 7; i++) {
    const up = linesFromBannerStart - BEAD_ROW_POS[i]
    if (up <= 0 || up > th) continue
    process.stdout.write(`\x1b[${up}A\x1b[${ABACUS_COL}G`)
    process.stdout.write(renderBeadLine(i))
    process.stdout.write(`\x1b[${up}B\x1b[1G`)
  }
  process.stdout.write('\x1b8') // DEC restore cursor
  _rl?._refreshLine?.()         // resync readline's internal cursor tracking
}
let abacusTimerId = null
function startAbacusAnim() {
  if (abacusTimerId) return
  abacusTimerId = setInterval(() => { stepBeads(); drawAbacus() }, 200)
}
function stopAbacusAnim() {
  if (abacusTimerId) { clearInterval(abacusTimerId); abacusTimerId = null }
}

// ── Help text ─────────────────────────────────────────────────────────────────
const HELP_TEXT = `
${bold('Commands')}
  ${cyan('help')}           Show this message
  ${cyan('accounts')}       Show all connected accounts and balances
  ${cyan('exit')} / ${cyan('quit')}   Exit the CLI
  ${cyan('logout')}         Log out and delete saved credentials

${bold('Spending & Transactions')}
  ${dim('"How much did I spend last month?"')}
  ${dim('"What are my biggest spending categories this year?"')}
  ${dim('"Show me my transactions at Whole Foods"')}
  ${dim('"Compare my spending this month vs last month"')}
  ${dim('"What did I spend on travel in Q1?"')}

${bold('Accounts & Net Worth')}
  ${dim('"What are my account balances?"')}
  ${dim('"What is my net worth?"')}
  ${dim('"How much available credit do I have?"')}

${bold('Investments')}
  ${dim('"How is my portfolio performing?"')}
  ${dim('"What are my biggest positions?"')}
  ${dim('"Show me my recent trades"')}

${bold('Bills & Subscriptions')}
  ${dim('"What subscriptions am I paying for?"')}
  ${dim('"What recurring bills are coming up?"')}
  ${dim('"Am I being charged for anything I forgot about?"')}

${bold('Tips')}
  ${dim('• Ask follow-up questions — Abacus remembers the conversation')}
  ${dim('• Date ranges work naturally: "last 3 months", "in January", "this year"')}
  ${dim('• Ask for comparisons: "vs last month", "vs this time last year"')}
`

// ── Account status ────────────────────────────────────────────────────────────
function formatBalance(amount, type) {
  if (amount == null) return dim('—')
  const n = parseFloat(amount)
  const formatted = '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  // Credit/loan balances are what you owe — show in red
  return (type === 'credit' || type === 'loan') ? red(formatted) : formatted
}

async function printAccountStatus(client) {
  try {
    const raw = await callTool(client, 'get_accounts', {})
    const data = JSON.parse(raw)
    const regular = data.accounts ?? []
    const investment = data.investment_accounts ?? []
    // Investment accounts appear in both arrays — deduplicate by account_id,
    // preferring the investment array (portfolio snapshot values are more accurate).
    const investmentIds = new Set(investment.map(a => a.account_id))
    const all = [
      ...regular.filter(a => !investmentIds.has(a.account_id)).map(a => ({ name: a.account_name ?? a.name, institution: a.institution_name ?? '—', type: a.type ?? '—', balance: formatBalance(a.current, a.type) })),
      ...investment.map(a => ({ name: a.account_name ?? a.name, institution: a.institution_name ?? '—', type: 'investment', balance: formatBalance(a.current, 'investment') })),
    ]
    if (all.length === 0) {
      console.log(yellow('⚠  No accounts connected. Visit https://abacus-money.com to get started.\n'))
      return
    }
    console.log(`You have connected ${bold(String(all.length))} account${all.length !== 1 ? 's' : ''}:\n`)
    // Build a simple aligned table
    const cols = ['Account', 'Institution', 'Type', 'Balance']
    const rows = all.map(a => [a.name, a.institution, a.type, a.balance])
    const visualLen = s => s.replace(/\x1b\[[0-9;]*m/g, '').length
    const widths = cols.map((c, i) => Math.max(visualLen(c), ...rows.map(r => visualLen(r[i] ?? ''))))
    const pad = (s, w) => s + ' '.repeat(Math.max(0, w - visualLen(s)))
    const bar = (l, m, r) => dim(l + widths.map(w => '─'.repeat(w + 2)).join(m) + r)
    const rowLine = (cells, isBold) => dim('│') + cells.map((cell, i) => ' ' + (isBold ? bold(pad(cell, widths[i])) : pad(cell, widths[i])) + ' ' + dim('│')).join('')
    console.log(bar('┌', '┬', '┐'))
    console.log(rowLine(cols, true))
    console.log(bar('├', '┼', '┤'))
    rows.forEach(r => console.log(rowLine(r, false)))
    console.log(bar('└', '┴', '┘'))
    console.log()
  } catch {
    // Non-blocking — skip silently if it fails
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const command = args[0]

async function ensureAuth() {
  const config = readConfig()
  if (!config?.token) {
    console.log(dim('Not authenticated. Running login...\n'))
    const firstRun = await login()
    if (firstRun) {
      console.log(green('\n✓ Authenticated successfully.\n'))
      console.log(`${bold('Welcome to Abacus!')} Here are some things to try:\n`)
      console.log(`  ${dim('"What are my account balances?"')}`)
      console.log(`  ${dim('"How much did I spend last month?"')}`)
      console.log(`  ${dim('"What is my net worth?"')}\n`)
      console.log(dim('Type \'help\' anytime to see more examples.\n'))
    } else {
      console.log(green('\n✓ Authenticated successfully.\n'))
    }
    return readConfig()
  }
  return config
}

async function revokeAll(token, serverUrl) {
  const res = await fetch(`${serverUrl}/api/cli-auth/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Revoke failed: ${res.status}`)
}

// ── Commands ──────────────────────────────────────────────────────────────────

if (command === 'login') {
  try {
    const firstRun = await login()
    if (firstRun) {
      console.log(green('\n✓ Authenticated successfully.\n'))
      console.log(`${bold('Welcome to Abacus!')} Here are some things to try:\n`)
      console.log(`  ${dim('"What are my account balances?"')}`)
      console.log(`  ${dim('"How much did I spend last month?"')}`)
      console.log(`  ${dim('"What is my net worth?"')}\n`)
      console.log(dim('Type \'help\' anytime to see more examples.\n'))
    } else {
      console.log(green('\n✓ Authenticated successfully.'))
    }
  } catch (err) {
    console.error(red('✗ ' + err.message))
    process.exit(1)
  }
  process.exit(0)
}

if (command === 'logout') {
  const config = readConfig()
  const allFlag = args.includes('--all')

  if (allFlag && config?.token) {
    try {
      await revokeAll(config.token, config.serverUrl || getServerUrl())
      console.log(green('✓ All tokens revoked.'))
    } catch (err) {
      console.error(red('Could not revoke server-side tokens: ' + err.message))
    }
  }

  deleteConfig()
  console.log(dim('Logged out.'))
  process.exit(0)
}

// ── Single question mode ──────────────────────────────────────────────────────
if (command && command !== 'login' && command !== 'logout') {
  const config = await ensureAuth()
  const serverUrl = config.serverUrl || getServerUrl()
  let display = null
  try {
    display = createActivityDisplay()
    display.start()
    const answer = await askQuestion(serverUrl, config.token, command, [], {
      onAgentStart: (agent, question) => display.agentStart(agent, question),
      onAgentDone:  (agent, toolCount, duration) => display.agentDone(agent, toolCount, duration),
      onToolCall:   (agent, tool) => display.toolCall(agent, tool),
    })
    const activities = display.stop()
    display = null
    if (activities.length) {
      console.log()
      for (const a of activities) {
        console.log(`${cyan('●')} ${bold(agentLabel(a.agent))} ${dim(`("${a.question.slice(0, 55)}${a.question.length > 55 ? '...' : ''}")`)}`)
        if (a.tools?.length) {
          for (const t of a.tools) console.log(dim(`│  ↳ ${t}`))
        }
        console.log(dim(`└ Called ${a.toolCount} data source${a.toolCount !== 1 ? 's' : ''} in ${(a.duration / 1000).toFixed(1)}s`))
      }
    }
    console.log(format(answer))
  } catch (err) {
    display?.stop()
    console.error(red('Error: ' + err.message))
    process.exit(1)
  }
  process.exit(0)
}

// ── Interactive REPL ──────────────────────────────────────────────────────────
const config = await ensureAuth()
const serverUrl = config.serverUrl || getServerUrl()

// Intercept stdout.write to count newlines from banner start.
// Gives the exact cursor distance needed for in-place abacus animation.
const _origWrite = process.stdout.write.bind(process.stdout)
process.stdout.write = (d, e, cb) => {
  const s = typeof d === 'string' ? d : Buffer.isBuffer(d) ? d.toString('utf8') : ''
  linesFromBannerStart += (s.match(/\n/g) || []).length
  // Preserve correct call signature — e may be a callback when encoding is omitted
  if (typeof e === 'function') return _origWrite(d, e)
  return _origWrite(d, e, cb)
}

console.log(BANNER)

let client
let currentDisplay = null
try {
  const stopSpinner = startSpinner('Connecting')
  client = await createMcpClient(config.serverUrl || getServerUrl(), config.token)
  stopSpinner()
} catch (err) {
  console.error(red('Could not connect to server: ' + err.message))
  process.exit(1)
}


await printAccountStatus(client)
console.log(dim('Type \'help\' for commands, \'exit\' to quit.\n'))

// Restore normal stdout — all startup lines counted, animation ready.
process.stdout.write = _origWrite

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
_rl = rl
const history = []

rl.on('line', async (line) => {
  const input = line.trim()
  addLines(1) // readline moved to next line on Enter

  if (!input) { rl.prompt(); return }

  if (input === 'exit' || input === 'quit') {
    stopAbacusAnim()
    await client?.close?.()
    rl.close()
    process.exit(0)
  }

  if (input === 'logout' || input === 'logout --all') {
    stopAbacusAnim()
    const allFlag = input.includes('--all')
    if (allFlag && config?.token) {
      try {
        await revokeAll(config.token, config.serverUrl || getServerUrl())
        console.log(green('✓ All tokens revoked.'))
      } catch (err) {
        console.log(red('Could not revoke server-side tokens: ' + err.message))
      }
    }
    deleteConfig()
    console.log(dim('Logged out.'))
    await client?.close?.()
    rl.close()
    process.exit(0)
  }

  if (input === 'accounts') {
    stopAbacusAnim()
    await printAccountStatus(client)
    startAbacusAnim()
    rl.prompt()
    return
  }

  if (input === 'help') {
    stopAbacusAnim()
    console.log(HELP_TEXT)
    addLines(1 + (HELP_TEXT.match(/\n/g) || []).length)
    startAbacusAnim()
    rl.prompt()
    return
  }

  stopAbacusAnim()
  rl.pause()
  currentDisplay = createActivityDisplay()
  currentDisplay.start()
  addLines(1) // start() writes \n
  try {
    const answer = await askQuestion(serverUrl, config.token, input, history, {
      onAgentStart: (agent, question) => currentDisplay?.agentStart(agent, question),
      onAgentDone:  (agent, toolCount, duration) => currentDisplay?.agentDone(agent, toolCount, duration),
      onToolCall:   (agent, tool) => currentDisplay?.toolCall(agent, tool),
    })
    const activities = currentDisplay.stop()
    currentDisplay = null
    if (activities.length) {
      console.log()
      addLines(1)
      for (const a of activities) {
        console.log(`${cyan('●')} ${bold(agentLabel(a.agent))} ${dim(`("${a.question.slice(0, 55)}${a.question.length > 55 ? '...' : ''}")`)}`)
        if (a.tools?.length) {
          for (const t of a.tools) console.log(dim(`│  ↳ ${t}`))
        }
        console.log(dim(`└ Called ${a.toolCount} data source${a.toolCount !== 1 ? 's' : ''} in ${(a.duration / 1000).toFixed(1)}s`))
        addLines(2 + (a.tools?.length ?? 0))
      }
    }
    const answerFormatted = format(answer)
    console.log('\n' + answerFormatted + '\n')
    addLines(3 + (answerFormatted.match(/\n/g) || []).length)
    history.push({ role: 'user', content: input })
    history.push({ role: 'assistant', content: answer })
  } catch (err) {
    currentDisplay?.stop()
    currentDisplay = null
    console.log(red('Error: ' + err.message))
    addLines(1)
  }
  startAbacusAnim()
  rl.resume()
  rl.prompt()
})

rl.on('close', async () => {
  stopAbacusAnim()
  await client?.close?.()
  process.exit(0)
})

rl.setPrompt(`${cyan('›')} `)
startAbacusAnim()
rl.prompt()
