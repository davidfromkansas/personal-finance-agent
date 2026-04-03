import { useMemo, useRef, useState, useEffect } from 'react'
import { sankey as d3Sankey, sankeyLinkHorizontal, sankeyJustify } from 'd3-sankey'

const COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#2563eb', '#65a30d', '#ea580c']
const OTHER_COLOR = '#9ca3af'
const MAX_CATEGORIES = 10
const NODE_WIDTH = 18
const NODE_PADDING = 28 // enough room for a label row between nodes
const LABEL_MARGIN = 150 // horizontal space reserved for right-side labels
const MIN_NODE_HEIGHT = 4 // minimum visible height for tiny categories

/** Convert Plaid category keys like FOOD_AND_DRINK to "Food & Drink". */
const CATEGORY_DISPLAY = {
  INCOME: 'Earned Income',
  FOOD_AND_DRINK: 'Food & Drink',
  RENT_AND_UTILITIES: 'Bills & Utilities',
  TRANSPORTATION: 'Transportation',
  LOAN_PAYMENTS: 'Loan Payments',
  ENTERTAINMENT: 'Entertainment',
  GENERAL_MERCHANDISE: 'Shopping',
  PERSONAL_CARE: 'Personal Care',
  MEDICAL: 'Healthcare',
  TRAVEL: 'Travel',
  HOME_IMPROVEMENT: 'Home Improvement',
  GOVERNMENT_AND_NON_PROFIT: 'Taxes & Fees',
  BANK_FEES: 'Bank Fees',
  GENERAL_SERVICES: 'Services',
  OTHER: 'Other',
}

function formatCategory(key) {
  if (CATEGORY_DISPLAY[key]) return CATEGORY_DISPLAY[key]
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatCurrency(value) {
  if (value == null) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value)
}

function formatCompact(value) {
  if (value == null) return '$0'
  const abs = Math.abs(value)
  if (abs >= 1000) return `$${(value / 1000).toFixed(1)}k`
  return `$${value.toFixed(0)}`
}

function formatPercent(value, total) {
  if (!total) return '0%'
  return `${((value / total) * 100).toFixed(1)}%`
}

/** Bucket small categories into "Everything else". Returns top N + bucketed rest. */
function bucketCategories(categories) {
  if (categories.length <= MAX_CATEGORIES) return categories
  const top = categories.slice(0, MAX_CATEGORIES)
  const rest = categories.slice(MAX_CATEGORIES)
  const otherAmount = rest.reduce((s, c) => s + c.amount, 0)
  const otherKeys = rest.map((c) => c.name)
  return [...top, { name: 'Everything else', amount: otherAmount, bucketedKeys: otherKeys }]
}

export function SankeyDiagram({ income, expenses, onNodeClick }) {
  const containerRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(800)
  const [tooltip, setTooltip] = useState(null)

  // Responsive sizing
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect
      if (width > 0) setContainerWidth(width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const incomeCategories = useMemo(() => bucketCategories(income?.categories ?? []), [income])
  const expenseCategories = useMemo(() => bucketCategories(expenses?.categories ?? []), [expenses])

  // Build sankey graph data
  const { nodes, links, sankeyData, svgHeight } = useMemo(() => {
    const hasIncome = incomeCategories.length > 0
    const hasExpenses = expenseCategories.length > 0
    if (!hasIncome && !hasExpenses) return { nodes: [], links: [], sankeyData: null, svgHeight: 300 }

    const nodeList = []
    const linkList = []

    // Income nodes (left)
    const incomeNodeIndices = []
    for (const cat of incomeCategories) {
      incomeNodeIndices.push(nodeList.length)
      nodeList.push({ name: formatCategory(cat.name), rawKey: cat.name, value: cat.amount, side: 'income', bucketedKeys: cat.bucketedKeys })
    }

    // Hub node
    const hubIndex = nodeList.length
    nodeList.push({ name: 'Total Income', rawKey: '__hub__', value: income?.total ?? 0, side: 'hub' })

    // Expense nodes (right)
    const expenseNodeIndices = []
    for (const cat of expenseCategories) {
      expenseNodeIndices.push(nodeList.length)
      nodeList.push({ name: formatCategory(cat.name), rawKey: cat.name, value: cat.amount, side: 'expense', bucketedKeys: cat.bucketedKeys })
    }

    // Savings node if net positive
    const net = (income?.total ?? 0) - (expenses?.total ?? 0)
    let savingsIndex = -1
    if (net > 0) {
      savingsIndex = nodeList.length
      nodeList.push({ name: 'Savings', rawKey: '__savings__', value: net, side: 'expense' })
    }

    // Links: income sources → hub
    for (let i = 0; i < incomeCategories.length; i++) {
      if (incomeCategories[i].amount > 0) {
        linkList.push({ source: incomeNodeIndices[i], target: hubIndex, value: incomeCategories[i].amount })
      }
    }

    // Links: hub → expense categories
    for (let i = 0; i < expenseCategories.length; i++) {
      if (expenseCategories[i].amount > 0) {
        linkList.push({ source: hubIndex, target: expenseNodeIndices[i], value: expenseCategories[i].amount })
      }
    }

    // Hub → savings
    if (savingsIndex >= 0 && net > 0) {
      linkList.push({ source: hubIndex, target: savingsIndex, value: net })
    }

    if (linkList.length === 0) return { nodes: nodeList, links: linkList, sankeyData: null, svgHeight: 300 }

    // Dynamic height: ensure enough room for the side with more nodes
    // Each node needs at least NODE_PADDING + some height for the bar itself
    const maxNodesOnOneSide = Math.max(
      incomeCategories.length,
      expenseCategories.length + (savingsIndex >= 0 ? 1 : 0)
    )
    const dynamicHeight = Math.max(400, maxNodesOnOneSide * (NODE_PADDING + 24) + 40)

    // Reserve space for labels on right side
    const sankeyWidth = containerWidth - LABEL_MARGIN

    const sankeyGen = d3Sankey()
      .nodeId((d) => d.index)
      .nodeWidth(NODE_WIDTH)
      .nodePadding(NODE_PADDING)
      .nodeAlign(sankeyJustify)
      .extent([[1, 20], [sankeyWidth, dynamicHeight - 20]])

    const graph = sankeyGen({
      nodes: nodeList.map((n, i) => ({ ...n, index: i })),
      links: linkList.map((l) => ({ ...l })),
    })

    const finalHeight = Math.max(400, Math.max(...graph.nodes.map((n) => n.y1)) + 40)

    return { nodes: graph.nodes, links: graph.links, sankeyData: graph, svgHeight: finalHeight }
  }, [incomeCategories, expenseCategories, income, expenses, containerWidth])

  // Color assignment
  const colorMap = useMemo(() => {
    const map = {}
    let colorIdx = 0
    for (const n of nodes) {
      if (n.name === 'Total Income' && n.side === 'hub') {
        map[n.index] = '#1e40af'
      } else if (n.name === 'Savings') {
        map[n.index] = '#059669'
      } else if (n.name === 'Everything else') {
        map[n.index] = OTHER_COLOR
      } else {
        map[n.index] = COLORS[colorIdx % COLORS.length]
        colorIdx++
      }
    }
    return map
  }, [nodes])

  const linkPathGen = sankeyLinkHorizontal()

  function handleNodeHover(e, node) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const total = node.side === 'income' ? (income?.total ?? 0) : (expenses?.total ?? 0)
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 10,
      name: node.name,
      amount: node.value,
      percent: formatPercent(node.value, total),
    })
  }

  function handleLinkHover(e, link) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 10,
      name: `${link.source.name} → ${link.target.name}`,
      amount: link.value,
      percent: null,
    })
  }

  if (!sankeyData) return null

  return (
    <div ref={containerRef} className="relative w-full" style={{ minHeight: svgHeight }}>
      <svg width={containerWidth} height={svgHeight}>
        {/* Links */}
        <g>
          {links.map((link, i) => (
            <path
              key={i}
              d={linkPathGen(link)}
              fill="none"
              stroke={colorMap[link.source.index] ?? '#9ca3af'}
              strokeWidth={Math.max(1, link.width)}
              strokeOpacity={0.25}
              onMouseMove={(e) => handleLinkHover(e, link)}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: 'pointer' }}
            />
          ))}
        </g>

        {/* Nodes + labels */}
        <g>
          {nodes.map((node) => {
            const rawHeight = node.y1 - node.y0
            const nodeHeight = Math.max(MIN_NODE_HEIGHT, rawHeight)
            const color = colorMap[node.index] ?? '#9ca3af'
            const isHub = node.name === 'Total Income' && node.side === 'hub'
            const isRight = node.side === 'expense'
            const midY = node.y0 + rawHeight / 2

            return (
              <g key={node.index}>
                <rect
                  x={node.x0}
                  y={node.y0}
                  width={node.x1 - node.x0}
                  height={nodeHeight}
                  fill={color}
                  rx={3}
                  onMouseMove={(e) => handleNodeHover(e, node)}
                  onMouseLeave={() => setTooltip(null)}
                  onClick={() => {
                    if (node.rawKey !== '__hub__' && node.rawKey !== '__savings__' && onNodeClick) {
                      onNodeClick({ name: node.name, rawKey: node.rawKey, side: node.side, value: node.value, bucketedKeys: node.bucketedKeys })
                    }
                  }}
                  style={{ cursor: node.rawKey !== '__hub__' && node.rawKey !== '__savings__' ? 'pointer' : 'default' }}
                />

                {isRight ? (
                  // Right-side: labels to the RIGHT of the node (outside the flow area)
                  <>
                    {/* Color dot + name */}
                    <circle cx={node.x1 + 10} cy={midY - 1} r={4} fill={color} />
                    <text
                      x={node.x1 + 20}
                      y={midY}
                      dy="0.35em"
                      textAnchor="start"
                      fill="#374151"
                      fontSize={12}
                      fontFamily="JetBrains Mono,monospace"
                      fontWeight={500}
                    >
                      {node.name}
                    </text>
                    {/* Amount below name */}
                    <text
                      x={node.x1 + 20}
                      y={midY + 16}
                      dy="0.35em"
                      textAnchor="start"
                      fill="#6a7282"
                      fontSize={11}
                      fontFamily="JetBrains Mono,monospace"
                    >
                      {formatCompact(node.value)} ({formatPercent(node.value, expenses?.total ?? 0)})
                    </text>
                  </>
                ) : (
                  // Left-side / hub: labels to the right of the node
                  <>
                    <text
                      x={node.x1 + 8}
                      y={midY}
                      dy="0.35em"
                      textAnchor="start"
                      fill="#374151"
                      fontSize={12}
                      fontFamily="JetBrains Mono,monospace"
                      fontWeight={isHub ? 600 : 500}
                    >
                      {node.name}
                    </text>
                    <text
                      x={node.x1 + 8}
                      y={midY + 16}
                      dy="0.35em"
                      textAnchor="start"
                      fill="#6a7282"
                      fontSize={11}
                      fontFamily="JetBrains Mono,monospace"
                    >
                      {formatCurrency(isHub ? (income?.total ?? 0) : node.value)}
                    </text>
                  </>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-[#9ca3af] bg-white px-3 py-2.5 shadow-sm"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
            fontFamily: 'JetBrains Mono,monospace',
          }}
        >
          <p className="text-[12px] font-medium text-[#101828] mb-0.5">{tooltip.name}</p>
          <p className="text-[12px] font-semibold text-[#101828]">{formatCurrency(tooltip.amount)}</p>
          {tooltip.percent && (
            <p className="text-[11px] text-[#6a7282]">{tooltip.percent}</p>
          )}
        </div>
      )}
    </div>
  )
}
