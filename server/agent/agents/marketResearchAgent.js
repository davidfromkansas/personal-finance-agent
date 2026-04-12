/**
 * Market Research agent — stock fundamentals, analyst ratings, news, sector performance, and more.
 * Uses yahoo-finance2 (already installed) and Finnhub REST API for market data.
 * Registers itself on import via registerAgent().
 */
import Anthropic from '@anthropic-ai/sdk'
import YahooFinance from 'yahoo-finance2'
import { registerAgent } from '../registry.js'
import { extractAndEmitVisualizations, hasChartIntent } from '../renderChart.js'
import { todayET } from '../../lib/dateUtils.js'
import { getLatestHoldingsSnapshot } from '../../db.js'
import { finnhubGet, toDateStr } from '../../lib/finnhub.js'

const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] })

let _client = null
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

const MAX_ITERATIONS = 8

// ── Yahoo-finance2 in-memory cache ──────────────────────────────────────────
const yCache = new Map()
function yCached(key, ttl, fn) {
  const entry = yCache.get(key)
  if (entry && Date.now() - entry.ts < ttl) return Promise.resolve(entry.data)
  return fn().then(data => { yCache.set(key, { data, ts: Date.now() }); return data })
}
const YAHOO_TTL = {
  quote: 60_000,
  quoteSummary: 300_000,
  recommendations: 600_000,
  trending: 120_000,
  movers: 120_000,
  search: 0,
}

// ── Finnhub cache TTLs ─────────────────────────────────────────────────────
const FH_TTL = {
  news: 180_000,
  profile: 300_000,
  recommendation: 600_000,
  priceTarget: 600_000,
  insider: 600_000,
  sentiment: 600_000,
  earnings: 300_000,
  peers: 300_000,
  sectors: 120_000,
  quote: 60_000,
  metric: 300_000,
}

// ── System Prompt ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the market research analyst for Abacus. You answer questions about stocks, market conditions, financial news, analyst ratings, sector performance, insider activity, earnings, and company fundamentals using your tools.

## Visualizations — read this first
When the user asks for a chart, graph, comparison, or visual breakdown: fetch the data with your tools, then output a visualization block. This is how charts work in this app — you output structured JSON and the UI renders it. You can always do this.

Format:
\`\`\`visualization
{"display_type":"bar","title":"...","data":[...],"x_key":"...","y_keys":["..."],"y_label":"..."}
\`\`\`

- **Sector performance**: get_sector_performance → display_type "bar", x_key "sector", y_keys ["changePercent"], y_label "% Change"
- **Analyst consensus**: get_analyst_ratings → display_type "bar" showing strongBuy/buy/hold/sell/strongSell counts

Output the visualization block first, then 2-3 sentences of insight. Do not mention charts or rendering in your prose.

## Your tools
- **get_market_overview** — major index quotes (SPY, QQQ, DIA, IWM) plus trending symbols. Use for "how is the market doing?" questions.
- **get_market_movers** — today's top gainers or losers. Use for "what's moving today?" questions.
- **get_sector_performance** — performance metrics across market sectors. Use for sector comparison questions.
- **get_stock_quote** — current/recent quote for a symbol. Use for "what's the price of X?" questions.
- **get_stock_fundamentals** — key financial metrics, ratios, and estimates for a company. Use for deep-dive analysis questions.
- **get_analyst_ratings** — analyst recommendation trends and price targets. Use for "what do analysts think?" questions.
- **get_insider_activity** — recent insider transactions and sentiment. Use for "any insider buying/selling?" questions.
- **get_earnings_data** — upcoming earnings calendar or company earnings history. Use for "when does X report?" or "earnings surprises?" questions.
- **get_company_news** — recent news articles about a specific company. Use for "any news about X?" questions.
- **get_market_news** — general financial market news. Use for "what's happening in the market?" questions.
- **get_company_profile** — company info: industry, sector, market cap, IPO date, website. Use for "tell me about X" questions.
- **get_company_peers** — peer/competitor companies. Use for "who are X's competitors?" questions.
- **get_social_sentiment** — social media sentiment for a stock. Use for "what are people saying about X?" questions.
- **search_symbol** — fuzzy symbol lookup. Use when the user gives a company name and you need to resolve it to a ticker.
- **get_user_holdings** — the user's current investment holdings. Use when the user asks about "my stocks" to get context, then cross-reference with other tools.

Always call a tool before answering. Never guess or fabricate figures.

## Data conventions
- Stock quotes from Yahoo Finance are delayed ~15-20 minutes during market hours. Finnhub data may also have delays on the free tier.
- When a tool returns an error with "premium" flag, tell the user that data point is not available on the current plan and move on.
- If search_symbol finds no match, tell the user you couldn't find that ticker and ask them to clarify.
- Format prices as $XX.XX, large numbers as $X.XB or $X.XM, percentages with +/- prefix.

## Format
- Lead with the direct answer. Add brief context if it adds value.
- Use markdown bullet points for lists — never markdown tables.
- Keep responses concise. Every sentence should add value.
- Tone: neutral, direct, no jargon.

## Scope
You handle market research, stock analysis, and financial news. You do NOT handle:
- Personal portfolio value, returns, or gain/loss → "Switch to the Investments tab for portfolio performance."
- Spending or transactions → "Switch to the Transactions tab for spending questions."
- Account balances or net worth → "Switch to the Accounts tab for balance questions."

You CAN use get_user_holdings to know what the user owns, then provide market research about those holdings (e.g., news about their stocks, analyst ratings for their holdings). But do not calculate personal returns or portfolio performance.

## Important
- Never give investment advice, recommendations, or predictions.
- Present data objectively and let the user draw their own conclusions.
- If data is unavailable (tool error, premium endpoint), say so clearly and continue with what you have.`

// ── Tool Definitions ────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'get_market_overview',
    description: `Returns quotes for major US indices (SPY, QQQ, DIA, IWM) plus currently trending symbols.
Use for general "how is the market doing?" questions.
Returns: { indices: [{ symbol, name, price, change, changePct, marketState }], trending: [{ symbol }] }`,
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_market_movers',
    description: `Returns today's top stock gainers or losers.
Use for "what's moving today?", "biggest winners/losers" questions.
Returns: [{ symbol, name, price, changePct }]`,
    input_schema: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['gainers', 'losers'],
          description: 'Whether to return top gainers or losers.',
        },
      },
      required: ['direction'],
    },
  },
  {
    name: 'get_sector_performance',
    description: `Returns performance metrics across market sectors.
Use for "how are sectors performing?", "tech vs energy" questions.
Returns: { sectors: [{ sector, changePercent, ... }] }`,
    input_schema: {
      type: 'object',
      properties: {
        region: {
          type: 'string',
          description: 'Region code (default "US").',
        },
      },
    },
  },
  {
    name: 'get_stock_quote',
    description: `Returns the current or most recent quote for a stock symbol.
Use for "what's the price of X?", "how is X trading?" questions.
Returns: { symbol, price, change, changePct, high, low, open, prevClose, marketState }`,
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol (e.g. "AAPL").' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_stock_fundamentals',
    description: `Returns key financial metrics, ratios, and estimates for a company.
Includes: P/E, PEG, price-to-book, beta, 52W range, revenue growth, margins, debt ratios, analyst price targets, EPS estimates.
Use for deep-dive analysis questions.
Returns: { symbol, currentPrice, marketCap, ... (trimmed key metrics) }`,
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol (e.g. "AAPL").' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_analyst_ratings',
    description: `Returns analyst recommendation trends and price targets for a stock.
Use for "what do analysts think about X?", "price targets for X" questions.
Returns: { recommendations: [{ period, strongBuy, buy, hold, sell, strongSell }], priceTarget: { targetHigh, targetLow, targetMean, targetMedian } }`,
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol (e.g. "AAPL").' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_insider_activity',
    description: `Returns recent insider transactions and insider sentiment for a stock.
Use for "any insider buying?", "insider activity on X" questions.
Returns: { transactions: [{ name, share, change, transactionDate, transactionCode }], sentiment: { ... } }`,
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol (e.g. "AAPL").' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_earnings_data',
    description: `Returns earnings calendar (upcoming earnings) or company-specific earnings history.
If symbol is provided: returns earnings surprises for that company.
If symbol is omitted: returns upcoming earnings calendar for the next 7 days.
Returns: { earnings: [{ date, epsEstimate, epsActual, revenueEstimate, revenueActual, symbol }] }`,
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol. Omit for earnings calendar.' },
      },
    },
  },
  {
    name: 'get_company_news',
    description: `Returns recent news articles about a specific company from Finnhub.
Default lookback is 45 days.
Returns: { articles: [{ headline, summary, source, url, datetime, related }] }`,
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol (e.g. "AAPL").' },
        days_back: { type: 'number', description: 'Number of days to look back (default 45).' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_market_news',
    description: `Returns general financial market news headlines from Finnhub.
Use for "what's happening in the market?", "any big news today?" questions.
Returns: { articles: [{ headline, summary, source, url, datetime }] }`,
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_company_profile',
    description: `Returns company profile: name, industry, sector, market cap, IPO date, website, logo, share outstanding.
Use for "tell me about X", "what does X do?" questions.
Returns: { name, ticker, exchange, industry, sector, marketCap, shareOutstanding, ipo, weburl, logo }`,
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol (e.g. "AAPL").' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_company_peers',
    description: `Returns a list of peer/competitor company tickers for a given stock.
Use for "who are X's competitors?", "companies similar to X" questions.
Returns: [ticker1, ticker2, ...]`,
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol (e.g. "AAPL").' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_social_sentiment',
    description: `Returns social media sentiment data for a stock from Reddit and Twitter.
Use for "what are people saying about X?", "social sentiment on X" questions.
Returns: { reddit: [...], twitter: [...] } with mention counts and sentiment scores.`,
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Ticker symbol (e.g. "AAPL").' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'search_symbol',
    description: `Fuzzy search for a stock symbol by company name or partial ticker.
Use when the user gives a company name and you need the exact ticker.
Returns: [{ symbol, name, type, exchange }]`,
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Company name or partial ticker (e.g. "apple", "TSL").' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_user_holdings',
    description: `Returns the user's current investment holdings from their linked accounts.
Use when the user asks about "my stocks", "news about my holdings" — gives you context on what they own so you can cross-reference with other tools.
Returns: [{ ticker, security_name, quantity, price, value }] or empty array if no accounts linked.`,
    input_schema: { type: 'object', properties: {} },
  },
]

// ── Tool Execution ──────────────────────────────────────────────────────────
const INDEX_SYMBOLS = ['SPY', 'QQQ', 'DIA', 'IWM']

async function executeTool(name, input, userId) {
  switch (name) {
    // ── Market overview ───────────────────────────────────────────────
    case 'get_market_overview': {
      const [indicesRaw, trendingRaw] = await Promise.all([
        yCached('indices', YAHOO_TTL.quote, () =>
          Promise.allSettled(INDEX_SYMBOLS.map(s =>
            yahooFinance.quote(s, {}, { validateResult: false })
          ))
        ),
        yCached('trending', YAHOO_TTL.trending, () =>
          yahooFinance.trendingSymbols('US', {}, { validateResult: false }).catch(() => null)
        ),
      ])
      const indices = indicesRaw
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => {
          const q = r.value
          return {
            symbol: q.symbol,
            name: q.shortName || q.longName || q.symbol,
            price: q.regularMarketPrice,
            change: q.regularMarketChange,
            changePct: q.regularMarketChangePercent,
            marketState: q.marketState,
          }
        })
      const trending = (trendingRaw?.quotes ?? []).slice(0, 10).map(q => ({ symbol: q.symbol }))
      return { indices, trending }
    }

    // ── Market movers ─────────────────────────────────────────────────
    case 'get_market_movers': {
      const dir = input.direction || 'gainers'
      const data = await yCached(`movers_${dir}`, YAHOO_TTL.movers, () =>
        (dir === 'gainers' ? yahooFinance.dailyGainers({}, { validateResult: false }) : yahooFinance.dailyLosers({}, { validateResult: false })).catch(() => null)
      )
      if (!data?.quotes) return { error: 'Could not fetch market movers.' }
      return data.quotes.slice(0, 15).map(q => ({
        symbol: q.symbol,
        name: q.shortName || q.longName || q.symbol,
        price: q.regularMarketPrice,
        change: q.regularMarketChange,
        changePct: q.regularMarketChangePercent,
      }))
    }

    // ── Sector performance (Finnhub) ──────────────────────────────────
    case 'get_sector_performance': {
      const region = input.region || 'US'
      const data = await finnhubGet('/sector/metrics', { region }, FH_TTL.sectors)
      if (data?.error) return data
      return { sectors: data }
    }

    // ── Stock quote ───────────────────────────────────────────────────
    case 'get_stock_quote': {
      const sym = input.symbol.toUpperCase()
      try {
        const q = await yCached(`quote_${sym}`, YAHOO_TTL.quote, () =>
          yahooFinance.quote(sym, {}, { validateResult: false })
        )
        return {
          symbol: q.symbol,
          name: q.shortName || q.longName || q.symbol,
          price: q.regularMarketPrice,
          change: q.regularMarketChange,
          changePct: q.regularMarketChangePercent,
          high: q.regularMarketDayHigh,
          low: q.regularMarketDayLow,
          open: q.regularMarketOpen,
          prevClose: q.regularMarketPreviousClose,
          volume: q.regularMarketVolume,
          marketCap: q.marketCap,
          marketState: q.marketState,
          week52Low: q.fiftyTwoWeekLow,
          week52High: q.fiftyTwoWeekHigh,
        }
      } catch (err) {
        return { error: `Could not fetch quote for ${sym}: ${err.message}` }
      }
    }

    // ── Stock fundamentals (yahoo quoteSummary + Finnhub metrics) ─────
    case 'get_stock_fundamentals': {
      const sym = input.symbol.toUpperCase()
      const [ySummary, fhMetric] = await Promise.all([
        yCached(`fundamentals_${sym}`, YAHOO_TTL.quoteSummary, () =>
          yahooFinance.quoteSummary(sym, {
            modules: ['financialData', 'defaultKeyStatistics', 'earningsTrend', 'price'],
          }, { validateResult: false }).catch(() => null)
        ),
        finnhubGet('/stock/metric', { symbol: sym, metric: 'all' }, FH_TTL.metric),
      ])

      const fd = ySummary?.financialData ?? {}
      const ks = ySummary?.defaultKeyStatistics ?? {}
      const p = ySummary?.price ?? {}
      const et = ySummary?.earningsTrend?.trend ?? []
      const fhM = fhMetric?.metric ?? {}

      return {
        symbol: sym,
        currentPrice: p.regularMarketPrice,
        marketCap: p.marketCap,
        currency: p.currency,
        // Valuation
        trailingPE: ks.trailingPE ?? fhM.peBasicExclExtraTTM,
        forwardPE: ks.forwardPE ?? fhM.peExclExtraAnnual,
        pegRatio: ks.pegRatio,
        priceToBook: ks.priceToBook ?? fhM.pbAnnual,
        enterpriseToEbitda: ks.enterpriseToEbitda,
        beta: ks.beta ?? fhM.beta,
        // Price
        fiftyTwoWeekHigh: ks.fiftyTwoWeekHigh ?? fhM['52WeekHigh'],
        fiftyTwoWeekLow: ks.fiftyTwoWeekLow ?? fhM['52WeekLow'],
        fiftyDayAverage: ks.fiftyDayAverage ?? fhM['10DayAverageTradingVolume'],
        twoHundredDayAverage: ks.twoHundredDayAverage,
        // Growth & profitability
        revenueGrowth: fd.revenueGrowth,
        earningsGrowth: fd.earningsGrowth,
        profitMargins: fd.profitMargins,
        grossMargins: fd.grossMargins,
        operatingMargins: fd.operatingMargins,
        returnOnEquity: fd.returnOnEquity,
        returnOnAssets: fd.returnOnAssets,
        // Balance sheet
        debtToEquity: fd.debtToEquity,
        currentRatio: fd.currentRatio,
        // Cash flow
        freeCashflow: fd.freeCashflow,
        operatingCashflow: fd.operatingCashflow,
        // Analyst targets
        targetMeanPrice: fd.targetMeanPrice,
        targetHighPrice: fd.targetHighPrice,
        targetLowPrice: fd.targetLowPrice,
        numberOfAnalystOpinions: fd.numberOfAnalystOpinions,
        // Earnings estimates
        earningsTrend: et.slice(0, 2).map(t => ({
          period: t.period,
          endDate: t.endDate,
          epsEstimate: t.earningsEstimate?.avg,
          revenueEstimate: t.revenueEstimate?.avg,
        })),
        // Finnhub extras
        dividendYieldTTM: fhM.dividendYieldIndicatedAnnual,
        revenuePerShareTTM: fhM.revenuePerShareTTM,
        epsGrowthTTM: fhM.epsGrowthTTMYoy,
      }
    }

    // ── Analyst ratings (Finnhub) ─────────────────────────────────────
    case 'get_analyst_ratings': {
      const sym = input.symbol.toUpperCase()
      const [recs, targets] = await Promise.all([
        finnhubGet('/stock/recommendation', { symbol: sym }, FH_TTL.recommendation),
        finnhubGet('/stock/price-target', { symbol: sym }, FH_TTL.priceTarget),
      ])
      return {
        recommendations: Array.isArray(recs) ? recs.slice(0, 6) : recs,
        priceTarget: targets?.error ? targets : {
          targetHigh: targets.targetHigh,
          targetLow: targets.targetLow,
          targetMean: targets.targetMean,
          targetMedian: targets.targetMedian,
          lastUpdated: targets.lastUpdated,
        },
      }
    }

    // ── Insider activity (Finnhub) ────────────────────────────────────
    case 'get_insider_activity': {
      const sym = input.symbol.toUpperCase()
      const [txns, sentiment] = await Promise.all([
        finnhubGet('/stock/insider-transactions', { symbol: sym }, FH_TTL.insider),
        finnhubGet('/stock/insider-sentiment', { symbol: sym, from: '2020-01-01', to: toDateStr(new Date()) }, FH_TTL.sentiment),
      ])
      return {
        transactions: (txns?.data ?? txns ?? []).slice?.(0, 20) ?? txns,
        sentiment: sentiment?.error ? sentiment : (sentiment?.data ?? sentiment),
      }
    }

    // ── Earnings data (Finnhub) ───────────────────────────────────────
    case 'get_earnings_data': {
      if (input.symbol) {
        const sym = input.symbol.toUpperCase()
        const data = await finnhubGet('/stock/earnings', { symbol: sym }, FH_TTL.earnings)
        if (data?.error) return data
        return { earnings: Array.isArray(data) ? data.slice(0, 12) : data }
      }
      // Upcoming earnings calendar
      const from = toDateStr(new Date())
      const to = toDateStr(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
      const data = await finnhubGet('/calendar/earnings', { from, to }, FH_TTL.earnings)
      if (data?.error) return data
      return { earnings: (data?.earningsCalendar ?? []).slice(0, 30) }
    }

    // ── Company news (Finnhub) ────────────────────────────────────────
    case 'get_company_news': {
      const sym = input.symbol.toUpperCase()
      const daysBack = input.days_back || 45
      const to = toDateStr(new Date())
      const from = toDateStr(new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000))
      const data = await finnhubGet('/company-news', { symbol: sym, from, to }, FH_TTL.news)
      if (data?.error) return data
      const articles = (Array.isArray(data) ? data : []).slice(0, 15).map(a => ({
        headline: a.headline,
        summary: a.summary,
        source: a.source,
        url: a.url,
        datetime: a.datetime ? new Date(a.datetime * 1000).toISOString() : null,
        related: a.related,
      }))
      return { articles }
    }

    // ── Market news (Finnhub) ─────────────────────────────────────────
    case 'get_market_news': {
      const data = await finnhubGet('/news', { category: 'general' }, FH_TTL.news)
      if (data?.error) return data
      const articles = (Array.isArray(data) ? data : []).slice(0, 15).map(a => ({
        headline: a.headline,
        summary: a.summary,
        source: a.source,
        url: a.url,
        datetime: a.datetime ? new Date(a.datetime * 1000).toISOString() : null,
      }))
      return { articles }
    }

    // ── Company profile (Finnhub) ─────────────────────────────────────
    case 'get_company_profile': {
      const sym = input.symbol.toUpperCase()
      const data = await finnhubGet('/stock/profile2', { symbol: sym }, FH_TTL.profile)
      if (data?.error) return data
      return {
        name: data.name,
        ticker: data.ticker,
        exchange: data.exchange,
        industry: data.finnhubIndustry,
        country: data.country,
        marketCap: data.marketCapitalization,
        shareOutstanding: data.shareOutstanding,
        ipo: data.ipo,
        weburl: data.weburl,
        logo: data.logo,
        phone: data.phone,
      }
    }

    // ── Company peers (Finnhub) ───────────────────────────────────────
    case 'get_company_peers': {
      const sym = input.symbol.toUpperCase()
      const data = await finnhubGet('/stock/peers', { symbol: sym }, FH_TTL.peers)
      if (data?.error) return data
      return Array.isArray(data) ? data : []
    }

    // ── Social sentiment (Finnhub) ────────────────────────────────────
    case 'get_social_sentiment': {
      const sym = input.symbol.toUpperCase()
      const from = toDateStr(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      const to = toDateStr(new Date())
      const data = await finnhubGet('/stock/social-sentiment', { symbol: sym, from, to }, FH_TTL.sentiment)
      if (data?.error) return data
      return { reddit: (data.reddit ?? []).slice(0, 10), twitter: (data.twitter ?? []).slice(0, 10) }
    }

    // ── Symbol search (yahoo-finance2) ────────────────────────────────
    case 'search_symbol': {
      try {
        const data = await yahooFinance.search(input.query, {}, { validateResult: false })
        return (data?.quotes ?? []).slice(0, 8).map(q => ({
          symbol: q.symbol,
          name: q.shortname || q.longname || q.symbol,
          type: q.quoteType,
          exchange: q.exchange,
        }))
      } catch (err) {
        return { error: `Search failed: ${err.message}` }
      }
    }

    // ── User holdings bridge ──────────────────────────────────────────
    case 'get_user_holdings': {
      try {
        const rows = await getLatestHoldingsSnapshot(userId)
        if (!rows?.length) return { holdings: [], note: 'No linked investment accounts or no holdings data yet.' }
        return {
          holdings: rows
            .filter(r => r.ticker && !r.ticker.startsWith('CUR:'))
            .map(r => ({
              ticker: r.ticker,
              security_name: r.security_name,
              quantity: r.quantity,
              price: r.price,
              value: r.value,
            })),
        }
      } catch {
        return { holdings: [], note: 'Could not load holdings.' }
      }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

// ── Agent Loop (same pattern as portfolioAgent.js) ──────────────────────────
async function runAgentLoop(systemPrompt, messages, userId, emit, toolChoice = 'auto') {
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: systemPrompt,
      tools: TOOLS,
      tool_choice: { type: i === 0 ? toolChoice : 'auto' },
      messages,
    })

    if (response.stop_reason === 'end_turn') {
      const raw = response.content.find(b => b.type === 'text')?.text ?? ''
      return extractAndEmitVisualizations(raw, emit)
    }

    if (response.stop_reason !== 'tool_use') {
      const raw = response.content.find(b => b.type === 'text')?.text ?? ''
      return extractAndEmitVisualizations(raw, emit)
    }

    messages.push({ role: 'assistant', content: response.content })

    const toolResults = []
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue
      const callId = `${block.name}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      emit?.({ type: 'tool_call', tool: block.name, callId })
      let result
      try {
        result = await executeTool(block.name, block.input, userId)
      } catch (err) {
        result = { error: err.message }
      }
      emit?.({ type: 'tool_done', callId, count: Array.isArray(result) ? result.length : null })
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
    }
    messages.push({ role: 'user', content: toolResults })
  }

  return 'I ran into an issue processing your request. Please try again.'
}

// ── Streaming entry point (direct mode) ─────────────────────────────────────
export async function* streamMarketResearchAgent({ message, history, userId, emit }) {
  const today = todayET()
  const systemPrompt = `Today is ${today}.\n\n${SYSTEM_PROMPT}`
  const messages = [...history, { role: 'user', content: message }]
  const toolChoice = hasChartIntent(message) ? 'any' : 'auto'
  const { text } = await runAgentLoop(systemPrompt, messages, userId, emit, toolChoice)
  yield text
}

// ── Orchestrator entry point ────────────────────────────────────────────────
export async function askMarketResearchAgent({ message, history, userId, emit }) {
  const today = todayET()
  const systemPrompt = `Today is ${today}.\n\n${SYSTEM_PROMPT}`
  const messages = [...history, { role: 'user', content: message }]
  const toolChoice = hasChartIntent(message) ? 'any' : 'auto'
  try {
    const { text, hasVisualization } = await runAgentLoop(systemPrompt, messages, userId, emit, toolChoice)
    return { answer: text, dataAvailable: true, hasVisualization }
  } catch (err) {
    return { answer: '', dataAvailable: true, hasVisualization: false, error: err.message }
  }
}

// ── Self-registration ───────────────────────────────────────────────────────
registerAgent({
  name: 'market_research',
  description: `Researches stocks, market conditions, news, analyst ratings, insider activity, earnings, and sector performance.
Use for questions about: stock fundamentals, analyst opinions, market news, sector trends, market movers, company analysis, insider trading, earnings calendar, social sentiment.
Do NOT use for personal portfolio value, holdings performance, or investment returns — use portfolio agent for those.`,
  handler: askMarketResearchAgent,
})
