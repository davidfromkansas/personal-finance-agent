/**
 * All static fake data for demo mode.
 * Alex Rivera, 29, software engineer in NYC. ~1,000 transactions over 18 months.
 */

// ─── Seeded RNG (mulberry32) ────────────────────────────────────────────────
function createRng(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function ri(rng, min, max) { return Math.floor(rng() * (max - min + 1)) + min }
function rf(rng, min, max) { return rng() * (max - min) + min }
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)] }
function round2(n) { return Math.round(n * 100) / 100 }

// ─── Date utilities ─────────────────────────────────────────────────────────
// 19 months: Sep 2024 → Mar 2026 (partial — capped at today)
const MONTHS = Array.from({ length: 19 }, (_, i) => {
  const totalMonth = (2024 * 12 + 8) + i // 8 = Sep (0-indexed)
  const y = Math.floor(totalMonth / 12)
  const m = (totalMonth % 12) + 1
  return { y, m, str: `${y}-${String(m).padStart(2, '0')}` }
})

function dateStr(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function daysInMonth(y, m) { return new Date(y, m, 0).getDate() }

// Today for age-relative fields
const TODAY = '2026-03-19'
const TODAY_DATE = new Date(TODAY)

// ─── Account constants ───────────────────────────────────────────────────────
export const ACCT = {
  CHECKING: { id: 'demo-chase-checking', name: 'Total Checking' },
  SAVINGS:  { id: 'demo-chase-savings',  name: 'Premier Savings' },
  CC:       { id: 'demo-chase-cc',       name: 'Sapphire Preferred' },
  BROKERAGE:{ id: 'demo-vanguard-brokerage', name: 'Individual Brokerage' },
  K401:     { id: 'demo-vanguard-401k',  name: '401(k)' },
}

// ─── Connections ─────────────────────────────────────────────────────────────
export const DEMO_CONNECTIONS = [
  {
    id: 1,
    item_id: 'demo-item-chase',
    institution_name: 'Chase',
    institution_logo: null,
    products_granted: ['transactions'],
    status: 'connected',
    error_code: null,
    last_synced_at: '2026-03-19T10:00:00Z',
    syncing: false,
    accounts: [
      { account_id: ACCT.CHECKING.id, name: ACCT.CHECKING.name, type: 'depository', subtype: 'checking', current: 4847.32, available: 4547.32, currency: 'USD' },
      { account_id: ACCT.SAVINGS.id,  name: ACCT.SAVINGS.name,  type: 'depository', subtype: 'savings',  current: 24150.00, available: 24150.00, currency: 'USD' },
      { account_id: ACCT.CC.id,       name: ACCT.CC.name,       type: 'credit',     subtype: 'credit card', current: 2341.87, available: 7658.13, currency: 'USD' },
    ],
  },
  {
    id: 2,
    item_id: 'demo-item-vanguard',
    institution_name: 'Vanguard',
    institution_logo: null,
    products_granted: ['transactions', 'investments'],
    status: 'connected',
    error_code: null,
    last_synced_at: '2026-03-19T10:00:00Z',
    syncing: false,
    accounts: [
      { account_id: ACCT.BROKERAGE.id, name: ACCT.BROKERAGE.name, type: 'investment', subtype: 'brokerage', current: 72250.00, available: null, currency: 'USD' },
      { account_id: ACCT.K401.id,      name: ACCT.K401.name,      type: 'investment', subtype: '401k',      current: 87230.00, available: null, currency: 'USD' },
    ],
  },
]

export const DEMO_ACCOUNTS = DEMO_CONNECTIONS.flatMap(c => c.accounts.map(a => ({ ...a, institution_name: c.institution_name })))

// ─── Investment Holdings ──────────────────────────────────────────────────────
// 14 stocks (Mag 7 + trending tech) in brokerage; index funds in 401k
const BROKERAGE_STOCKS = [
  { ticker: 'AAPL', name: 'Apple Inc',              qty: 35,  price: 185.00, cost_basis_per: 148.50, type: 'equity' },
  { ticker: 'MSFT', name: 'Microsoft Corp',          qty: 18,  price: 420.00, cost_basis_per: 310.00, type: 'equity' },
  { ticker: 'GOOGL', name: 'Alphabet Inc',           qty: 22,  price: 175.00, cost_basis_per: 145.00, type: 'equity' },
  { ticker: 'AMZN', name: 'Amazon.com Inc',          qty: 28,  price: 195.00, cost_basis_per: 172.00, type: 'equity' },
  { ticker: 'NVDA', name: 'NVIDIA Corp',             qty: 10,  price: 880.00, cost_basis_per: 420.00, type: 'equity' },
  { ticker: 'META', name: 'Meta Platforms Inc',      qty: 14,  price: 515.00, cost_basis_per: 380.00, type: 'equity' },
  { ticker: 'TSLA', name: 'Tesla Inc',               qty: 22,  price: 250.00, cost_basis_per: 280.00, type: 'equity' }, // underwater
  { ticker: 'PLTR', name: 'Palantir Technologies',   qty: 120, price: 43.00,  cost_basis_per: 26.50,  type: 'equity' },
  { ticker: 'CRWD', name: 'CrowdStrike Holdings',    qty: 8,   price: 370.00, cost_basis_per: 310.00, type: 'equity' },
  { ticker: 'NFLX', name: 'Netflix Inc',             qty: 7,   price: 650.00, cost_basis_per: 690.00, type: 'equity' }, // slightly down
  { ticker: 'AMD',  name: 'Advanced Micro Devices',  qty: 25,  price: 170.00, cost_basis_per: 155.00, type: 'equity' },
  { ticker: 'AVGO', name: 'Broadcom Inc',            qty: 12,  price: 190.00, cost_basis_per: 148.00, type: 'equity' },
  { ticker: 'SNOW', name: 'Snowflake Inc',            qty: 30,  price: 150.00, cost_basis_per: 180.00, type: 'equity' }, // underwater
  { ticker: 'ARM',  name: 'ARM Holdings plc',        qty: 22,  price: 128.00, cost_basis_per: 105.00, type: 'equity' },
]
// brokerage cash remainder
const BROKERAGE_STOCK_VALUE = BROKERAGE_STOCKS.reduce((s, h) => s + h.qty * h.price, 0)
const BROKERAGE_CASH = round2(72250.00 - BROKERAGE_STOCK_VALUE)

const K401_FUNDS = [
  { ticker: 'VIIIX', name: 'Vanguard Institutional Index Fund', qty: 180, price: 375.00, cost_basis_per: 280.00, type: 'mutual fund' },
  { ticker: 'VSMAX', name: 'Vanguard Small Cap Index Institutional', qty: 110, price: 95.00,  cost_basis_per: 72.00,  type: 'mutual fund' },
  { ticker: 'VTRIX', name: 'Vanguard Total Intl Stock Index Institutional', qty: 350, price: 14.50, cost_basis_per: 11.00, type: 'mutual fund' },
  { ticker: 'VBTIX', name: 'Vanguard Total Bond Market Institutional', qty: 250, price: 9.80,  cost_basis_per: 9.40,  type: 'mutual fund' },
]
// 401k cash: $87230 - funds value
const K401_FUND_VALUE = K401_FUNDS.reduce((s, h) => s + h.qty * h.price, 0)
const K401_CASH = round2(87230.00 - K401_FUND_VALUE)

function makeHolding(stock, accountId, accountName, institutionName) {
  return {
    item_id: accountId.startsWith('demo-chase') ? 'demo-item-chase' : 'demo-item-vanguard',
    account_id: accountId,
    institution_name: institutionName,
    account_name: accountName,
    security_name: stock.name,
    ticker: stock.ticker,
    security_type: stock.type,
    quantity: stock.qty,
    institution_price: stock.price,
    institution_price_as_of: TODAY,
    close_price: stock.price,
    value: round2(stock.qty * stock.price),
    cost_basis: round2(stock.qty * stock.cost_basis_per),
  }
}

export const DEMO_HOLDINGS = [
  ...BROKERAGE_STOCKS.map(s => makeHolding(s, ACCT.BROKERAGE.id, ACCT.BROKERAGE.name, 'Vanguard')),
  { ...makeHolding({ ticker: 'CASH', name: 'Cash & Cash Equivalents', qty: 1, price: BROKERAGE_CASH, cost_basis_per: BROKERAGE_CASH, type: 'cash' }, ACCT.BROKERAGE.id, ACCT.BROKERAGE.name, 'Vanguard'), quantity: 1 },
  ...K401_FUNDS.map(s => makeHolding(s, ACCT.K401.id, ACCT.K401.name, 'Vanguard')),
  { ...makeHolding({ ticker: 'VMFXX', name: 'Vanguard Federal Money Market Fund', qty: 1, price: K401_CASH, cost_basis_per: K401_CASH, type: 'cash' }, ACCT.K401.id, ACCT.K401.name, 'Vanguard'), quantity: 1 },
]

// ─── Quotes ──────────────────────────────────────────────────────────────────
// Current prices with realistic daily moves
export const DEMO_QUOTES = {
  AAPL: { price: 185.00, change:  1.23, changePercent:  0.67 },
  MSFT: { price: 420.00, change:  3.85, changePercent:  0.93 },
  GOOGL:{ price: 175.00, change: -0.92, changePercent: -0.52 },
  AMZN: { price: 195.00, change:  2.10, changePercent:  1.09 },
  NVDA: { price: 880.00, change: 14.50, changePercent:  1.68 },
  META: { price: 515.00, change:  6.20, changePercent:  1.22 },
  TSLA: { price: 250.00, change: -4.30, changePercent: -1.69 },
  PLTR: { price:  43.00, change:  0.85, changePercent:  2.02 },
  CRWD: { price: 370.00, change: -2.10, changePercent: -0.56 },
  NFLX: { price: 650.00, change:  5.40, changePercent:  0.84 },
  AMD:  { price: 170.00, change: -1.20, changePercent: -0.70 },
  AVGO: { price: 190.00, change:  2.80, changePercent:  1.50 },
  SNOW: { price: 150.00, change:  3.10, changePercent:  2.11 },
  ARM:  { price: 128.00, change:  1.60, changePercent:  1.27 },
  VIIIX:{ price: 375.00, change:  2.10, changePercent:  0.56 },
  VSMAX:{ price:  95.00, change:  0.80, changePercent:  0.85 },
  VTRIX:{ price:  14.50, change: -0.05, changePercent: -0.34 },
  VBTIX:{ price:   9.80, change:  0.02, changePercent:  0.20 },
}

// ─── Transaction templates ────────────────────────────────────────────────────
const GROCERY = [
  { name: "Trader Joe's", ch: 'in_store' }, { name: 'Whole Foods Market', ch: 'in_store' },
  { name: 'Key Food', ch: 'in_store' }, { name: 'Westside Market NYC', ch: 'in_store' },
  { name: 'Fairway Market', ch: 'in_store' }, { name: "Morton Williams", ch: 'in_store' },
  { name: 'C-Town Supermarkets', ch: 'in_store' }, { name: "Zabar's", ch: 'in_store' },
]
const DINING = [
  { name: "Joe's Pizza", ch: 'in_store' }, { name: "Xi'an Famous Foods", ch: 'in_store' },
  { name: 'The Halal Guys', ch: 'in_store' }, { name: 'Levain Bakery', ch: 'in_store' },
  { name: 'Shake Shack', ch: 'in_store' }, { name: 'Corner Bistro', ch: 'in_store' },
  { name: 'Veselka', ch: 'in_store' }, { name: 'Two Boots Pizza', ch: 'in_store' },
  { name: 'Num Pang Kitchen', ch: 'in_store' }, { name: 'Superiority Burger', ch: 'in_store' },
  { name: "Katz's Delicatessen", ch: 'in_store' }, { name: 'Balthazar', ch: 'in_store' },
  { name: 'The Smith', ch: 'in_store' }, { name: 'Momofuku Noodle Bar', ch: 'in_store' },
  { name: 'Taim Mediterranean Kitchen', ch: 'in_store' }, { name: "Vanessa's Dumpling House", ch: 'in_store' },
  { name: 'Bar Pitti', ch: 'in_store' }, { name: 'Sushi Yasuda', ch: 'in_store' },
  { name: 'Mission Chinese Food', ch: 'in_store' }, { name: 'Don Angie', ch: 'in_store' },
]
const COFFEE = [
  { name: "Gregory's Coffee", ch: 'in_store' }, { name: 'Joe Coffee Company', ch: 'in_store' },
  { name: 'Blue Bottle Coffee', ch: 'in_store' }, { name: 'Think Coffee', ch: 'in_store' },
  { name: 'Starbucks', ch: 'in_store' }, { name: "Dunkin'", ch: 'in_store' },
  { name: 'Birch Coffee', ch: 'in_store' }, { name: 'Partners Coffee', ch: 'in_store' },
]
const DELIVERY = [
  { name: 'DoorDash', ch: 'online' }, { name: 'Seamless', ch: 'online' },
  { name: 'Uber Eats', ch: 'online' }, { name: 'Grubhub', ch: 'online' },
]
const RIDESHARE = [
  { name: 'Uber', ch: 'online' }, { name: 'Lyft', ch: 'online' },
  { name: 'Citibike', ch: 'online' },
]
const BARS = [
  { name: 'Employees Only', ch: 'in_store' }, { name: 'Dead Rabbit', ch: 'in_store' },
  { name: 'Attaboy', ch: 'in_store' }, { name: "McSorley's Old Ale House", ch: 'in_store' },
  { name: 'The Scratcher', ch: 'in_store' }, { name: "Milano's Bar", ch: 'in_store' },
  { name: 'Blind Tiger Ale House', ch: 'in_store' }, { name: 'Peculier Pub', ch: 'in_store' },
  { name: 'Jimmy\'s No. 43', ch: 'in_store' }, { name: 'Niagara Bar', ch: 'in_store' },
]
const SHOPPING = [
  { name: 'Amazon', ch: 'online' }, { name: 'Target', ch: 'in_store' },
  { name: 'Uniqlo', ch: 'in_store' }, { name: 'H&M', ch: 'in_store' },
  { name: 'Zara', ch: 'in_store' }, { name: 'Nike', ch: 'in_store' },
  { name: 'Best Buy', ch: 'in_store' }, { name: 'Apple.com', ch: 'online' },
]
const PHARMACY = [
  { name: 'Duane Reade', ch: 'in_store' }, { name: 'CVS Pharmacy', ch: 'in_store' },
  { name: 'One Medical', ch: 'online' },
]
const ENTERTAINMENT = [
  { name: 'AMC Lincoln Square', ch: 'in_store' }, { name: 'Regal Union Square', ch: 'in_store' },
  { name: 'Brooklyn Bowl', ch: 'in_store' }, { name: 'The Metropolitan Museum of Art', ch: 'in_store' },
  { name: 'MoMA', ch: 'in_store' }, { name: 'Music Hall of Williamsburg', ch: 'in_store' },
]

// ─── Transaction generator ────────────────────────────────────────────────────
let _txnCache = null
let _txnId = 0

function makeTxn(acct, name, amount, date, cat, detailedCat, channel = 'other') {
  _txnId++
  return {
    plaid_transaction_id: `demo-txn-${String(_txnId).padStart(5, '0')}`,
    account_id: acct.id,
    account_name: acct.name,
    name,
    amount: round2(amount),
    date,
    authorized_date: date,
    pending: false,
    logo_url: null,
    original_description: name.toUpperCase(),
    merchant_name: name,
    personal_finance_category: cat,
    personal_finance_category_detailed: detailedCat,
    personal_finance_category_confidence: 'HIGH',
    payment_channel: channel,
    location: null,
    website: null,
    counterparties: null,
    check_number: null,
  }
}

function generateTransactions() {
  const rng = createRng(0xdeadbeef)
  const txns = []

  MONTHS.forEach(({ y, m, str }, mi) => {
    const days = daysInMonth(y, m)

    // ── Fixed income (negative = money in) ────────────────────────────────
    txns.push(makeTxn(ACCT.CHECKING, 'ACME TECH INC Direct Deposit', -4500.00, dateStr(y, m, 1), 'INCOME', 'INCOME_WAGES', 'other'))
    txns.push(makeTxn(ACCT.CHECKING, 'ACME TECH INC Direct Deposit', -4500.00, dateStr(y, m, 15), 'INCOME', 'INCOME_WAGES', 'other'))

    // ── Rent ──────────────────────────────────────────────────────────────
    txns.push(makeTxn(ACCT.CHECKING, 'Apt 4B — 245 E 14th St', 3200.00, dateStr(y, m, 2), 'HOME', 'HOME_RENT', 'other'))

    // ── Con Edison (electric) — varies seasonally ──────────────────────────
    const isWinter = m === 12 || m === 1 || m === 2
    const isSummer = m === 6 || m === 7 || m === 8
    const coned = isWinter ? rf(rng, 95, 130) : isSummer ? rf(rng, 85, 115) : rf(rng, 65, 90)
    txns.push(makeTxn(ACCT.CHECKING, 'Con Edison', round2(coned), dateStr(y, m, 10), 'HOME', 'HOME_UTILITIES', 'other'))

    // ── Spectrum internet ──────────────────────────────────────────────────
    txns.push(makeTxn(ACCT.CHECKING, 'Spectrum', 65.00, dateStr(y, m, 7), 'SUBSCRIPTION', 'SUBSCRIPTION_CABLE_AND_TELEPHONE', 'online'))

    // ── AT&T phone ────────────────────────────────────────────────────────
    txns.push(makeTxn(ACCT.CHECKING, 'AT&T', 95.00, dateStr(y, m, 8), 'SUBSCRIPTION', 'SUBSCRIPTION_CABLE_AND_TELEPHONE', 'online'))

    // ── Streaming / SaaS subscriptions (on CC) ────────────────────────────
    txns.push(makeTxn(ACCT.CC, 'Netflix', 15.49, dateStr(y, m, 3), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))
    txns.push(makeTxn(ACCT.CC, 'Spotify', 10.99, dateStr(y, m, 3), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))
    txns.push(makeTxn(ACCT.CC, 'Hulu', 19.99, dateStr(y, m, 4), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))
    txns.push(makeTxn(ACCT.CC, 'ChatGPT Plus', 20.00, dateStr(y, m, 4), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))
    txns.push(makeTxn(ACCT.CC, 'iCloud+', 2.99, dateStr(y, m, 5), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))
    txns.push(makeTxn(ACCT.CC, 'GitHub', 4.00, dateStr(y, m, 5), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))
    txns.push(makeTxn(ACCT.CC, 'The New York Times', 17.00, dateStr(y, m, 6), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))

    // ── Equinox gym ────────────────────────────────────────────────────────
    txns.push(makeTxn(ACCT.CC, 'Equinox', 200.00, dateStr(y, m, 6), 'PERSONAL_CARE', 'PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS', 'other'))

    // ── MTA unlimited ─────────────────────────────────────────────────────
    txns.push(makeTxn(ACCT.CC, 'MTA New York City Transit', 132.00, dateStr(y, m, 18), 'TRANSPORTATION', 'TRANSPORTATION_PUBLIC_TRANSIT', 'other'))

    // ── Credit card payment (excluded from spending) ───────────────────────
    // Previous month's statement, roughly mid-month
    txns.push(makeTxn(ACCT.CHECKING, 'Chase Credit Card Autopay', round2(rf(rng, 1800, 2800)), dateStr(y, m, 22), 'TRANSFER_OUT', 'TRANSFER_OUT_ACCOUNT_TRANSFER', 'other'))

    // ── Groceries (5–6 trips) ─────────────────────────────────────────────
    const grocTrips = ri(rng, 5, 7)
    for (let g = 0; g < grocTrips; g++) {
      const d = ri(rng, 1, days)
      const amt = rf(rng, 28, 115)
      const m_ = pick(rng, GROCERY)
      txns.push(makeTxn(ACCT.CC, m_.name, round2(amt), dateStr(y, m, d), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES', m_.ch))
    }

    // ── Dining out (8–12 meals) ────────────────────────────────────────────
    const mealCount = ri(rng, 8, 12)
    for (let d = 0; d < mealCount; d++) {
      const day = ri(rng, 1, days)
      // Nicer meals on weekends (higher amounts), weekday lunches cheaper
      const isWeekend = rng() > 0.6
      const amt = isWeekend ? rf(rng, 45, 110) : rf(rng, 14, 55)
      const m_ = pick(rng, DINING)
      txns.push(makeTxn(ACCT.CC, m_.name, round2(amt), dateStr(y, m, day), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANTS_AND_BARS', m_.ch))
    }

    // ── Coffee (4–6 visits) ────────────────────────────────────────────────
    const coffeeCount = ri(rng, 4, 6)
    for (let c = 0; c < coffeeCount; c++) {
      const day = ri(rng, 1, days)
      const amt = rf(rng, 4.50, 12.00)
      const m_ = pick(rng, COFFEE)
      txns.push(makeTxn(ACCT.CC, m_.name, round2(amt), dateStr(y, m, day), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_COFFEE', m_.ch))
    }

    // ── Food delivery (3–4 orders) ────────────────────────────────────────
    const delivCount = ri(rng, 3, 4)
    for (let d = 0; d < delivCount; d++) {
      const day = ri(rng, 1, days)
      const amt = rf(rng, 22, 58)
      const m_ = pick(rng, DELIVERY)
      txns.push(makeTxn(ACCT.CC, m_.name, round2(amt), dateStr(y, m, day), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANTS_AND_BARS', m_.ch))
    }

    // ── Uber/Lyft/Citibike (3–4 rides) ───────────────────────────────────
    const rideCount = ri(rng, 3, 4)
    for (let r = 0; r < rideCount; r++) {
      const day = ri(rng, 1, days)
      const isCiti = rng() < 0.2
      const amt = isCiti ? 4.50 : rf(rng, 14, 45)
      const m_ = isCiti ? { name: 'Citibike', ch: 'online' } : pick(rng, [{ name: 'Uber', ch: 'online' }, { name: 'Lyft', ch: 'online' }])
      const cat = isCiti ? 'TRANSPORTATION_BIKES_AND_SCOOTERS' : 'TRANSPORTATION_TAXIS_AND_RIDE_SHARES'
      txns.push(makeTxn(ACCT.CC, m_.name, round2(amt), dateStr(y, m, day), 'TRANSPORTATION', cat, m_.ch))
    }

    // ── Bars / nightlife (3–4 nights) ────────────────────────────────────
    const barCount = ri(rng, 3, 4)
    for (let b = 0; b < barCount; b++) {
      const day = ri(rng, 1, days)
      const amt = rf(rng, 28, 90)
      const m_ = pick(rng, BARS)
      txns.push(makeTxn(ACCT.CC, m_.name, round2(amt), dateStr(y, m, day), 'ENTERTAINMENT', 'ENTERTAINMENT_BARS_CLUBS_AND_NIGHTCLUBS', m_.ch))
    }

    // ── Shopping (3–4 purchases) ──────────────────────────────────────────
    const shopCount = ri(rng, 3, 4)
    for (let s = 0; s < shopCount; s++) {
      const day = ri(rng, 1, days)
      const isAmazon = rng() < 0.4
      const amt = isAmazon ? rf(rng, 18, 120) : rf(rng, 35, 200)
      const m_ = isAmazon ? { name: 'Amazon', ch: 'online' } : pick(rng, SHOPPING.filter(s => s.name !== 'Amazon'))
      const isClothes = ['Uniqlo', 'H&M', 'Zara', 'Nike'].includes(m_.name)
      const cat = isAmazon ? 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES' : isClothes ? 'SHOPS_CLOTHING_AND_ACCESSORIES' : 'GENERAL_MERCHANDISE_SUPERSTORES'
      const primaryCat = isAmazon ? 'GENERAL_MERCHANDISE' : isClothes ? 'SHOPS' : 'GENERAL_MERCHANDISE'
      txns.push(makeTxn(ACCT.CC, m_.name, round2(amt), dateStr(y, m, day), primaryCat, cat, m_.ch))
    }

    // ── Pharmacy / healthcare (1–2 visits) ────────────────────────────────
    const pharmaCount = ri(rng, 1, 2)
    for (let p = 0; p < pharmaCount; p++) {
      const day = ri(rng, 1, days)
      const amt = rf(rng, 12, 65)
      const m_ = pick(rng, PHARMACY)
      const isDoc = m_.name === 'One Medical'
      txns.push(makeTxn(ACCT.CC, m_.name, round2(amt), dateStr(y, m, day), 'MEDICAL', isDoc ? 'MEDICAL_PRIMARY_CARE' : 'MEDICAL_PHARMACIES_AND_SUPPLEMENTS', m_.ch))
    }

    // ── Entertainment (1–2 outings) ────────────────────────────────────────
    if (rng() > 0.35) {
      const day = ri(rng, 1, days)
      const amt = rf(rng, 18, 75)
      const m_ = pick(rng, ENTERTAINMENT)
      txns.push(makeTxn(ACCT.CC, m_.name, round2(amt), dateStr(y, m, day), 'ENTERTAINMENT', 'ENTERTAINMENT_ARTS_AND_MUSEUMS', m_.ch))
    }

    // ── Special monthly events ────────────────────────────────────────────
    if (mi === 3) { // Dec 2024: holiday shopping + home visit
      txns.push(makeTxn(ACCT.CC, 'Amazon', 284.50, dateStr(y, m, 5), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES', 'online'))
      txns.push(makeTxn(ACCT.CC, 'Apple.com', 399.00, dateStr(y, m, 9), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES', 'online'))
      txns.push(makeTxn(ACCT.CC, 'JetBlue Airways', 342.00, dateStr(y, m, 12), 'TRAVEL', 'TRAVEL_FLIGHTS', 'online'))
      txns.push(makeTxn(ACCT.CC, 'Airbnb', 420.00, dateStr(y, m, 23), 'TRAVEL', 'TRAVEL_LODGING', 'online'))
      txns.push(makeTxn(ACCT.CC, 'Target', 218.75, dateStr(y, m, 14), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_SUPERSTORES', 'in_store'))
    }
    if (mi === 5) { // Feb 2025: Valentine's
      txns.push(makeTxn(ACCT.CC, 'Carbone', 285.00, dateStr(y, m, 14), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANTS_AND_BARS', 'in_store'))
      txns.push(makeTxn(ACCT.CC, '1-800-Flowers', 89.00, dateStr(y, m, 12), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES', 'online'))
    }
    if (mi === 6) { // Mar 2025: long weekend DC trip
      txns.push(makeTxn(ACCT.CC, 'Amtrak', 124.00, dateStr(y, m, 14), 'TRAVEL', 'TRAVEL_TRANSIT', 'online'))
      txns.push(makeTxn(ACCT.CC, 'Marriott Hotels', 398.00, dateStr(y, m, 15), 'TRAVEL', 'TRAVEL_LODGING', 'online'))
    }
    if (mi === 10) { // Jul 2025: Miami vacation
      txns.push(makeTxn(ACCT.CC, 'Delta Air Lines', 418.00, dateStr(y, m, 4), 'TRAVEL', 'TRAVEL_FLIGHTS', 'online'))
      txns.push(makeTxn(ACCT.CC, 'Airbnb', 1240.00, dateStr(y, m, 5), 'TRAVEL', 'TRAVEL_LODGING', 'online'))
      txns.push(makeTxn(ACCT.CC, 'Stubhub', 145.00, dateStr(y, m, 7), 'ENTERTAINMENT', 'ENTERTAINMENT_SPORTING_EVENTS', 'online'))
      txns.push(makeTxn(ACCT.CC, 'Byblos Miami', 186.00, dateStr(y, m, 8), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANTS_AND_BARS', 'in_store'))
      txns.push(makeTxn(ACCT.CC, 'Wynwood Brewing Company', 68.00, dateStr(y, m, 9), 'ENTERTAINMENT', 'ENTERTAINMENT_BARS_CLUBS_AND_NIGHTCLUBS', 'in_store'))
      txns.push(makeTxn(ACCT.CC, 'Walgreens', 42.00, dateStr(y, m, 6), 'MEDICAL', 'MEDICAL_PHARMACIES_AND_SUPPLEMENTS', 'in_store'))
    }
    if (mi === 14) { // Nov 2025: Black Friday
      txns.push(makeTxn(ACCT.CC, 'Amazon', 512.00, dateStr(y, m, 28), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES', 'online'))
      txns.push(makeTxn(ACCT.CC, 'Best Buy', 349.00, dateStr(y, m, 29), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES', 'in_store'))
    }
    if (mi === 15) { // Dec 2025: holiday gifts + trip
      txns.push(makeTxn(ACCT.CC, 'Amazon', 328.00, dateStr(y, m, 7), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES', 'online'))
      txns.push(makeTxn(ACCT.CC, 'United Airlines', 380.00, dateStr(y, m, 10), 'TRAVEL', 'TRAVEL_FLIGHTS', 'online'))
    }
    if (mi === 16) { // Jan 2026: Dry January + annual expenses
      txns.push(makeTxn(ACCT.CHECKING, 'Geico Insurance', 1248.00, dateStr(y, m, 15), 'GENERAL_SERVICES', 'GENERAL_SERVICES_INSURANCE', 'online'))
    }
    if (mi === 17) { // Feb 2026: Valentine's again
      txns.push(makeTxn(ACCT.CC, 'Gramercy Tavern', 310.00, dateStr(y, m, 14), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANTS_AND_BARS', 'in_store'))
    }
  })

  // Cap at today (month 18 = Mar 2026 is partial) and sort descending
  txns.sort((a, b) => b.date.localeCompare(a.date) || b.plaid_transaction_id.localeCompare(a.plaid_transaction_id))
  return txns.filter(t => t.date <= TODAY)
}

export function getDemoTransactions() {
  if (!_txnCache) _txnCache = generateTransactions()
  return _txnCache
}

// ─── Recurring payments ───────────────────────────────────────────────────────
export const DEMO_RECURRING = [
  { stream_id: 'demo-rec-rent',      merchant_name: 'Apt 4B — 245 E 14th St', description: 'Monthly Rent',    logo_url: null, frequency: 'MONTHLY', average_amount: 3200.00, last_amount: 3200.00, predicted_next_date: '2026-04-02', first_date: '2024-09-02', last_date: '2026-03-02', personal_finance_category_primary: 'HOME',         status: 'MATURE', source: 'recurring' },
  { stream_id: 'demo-rec-equinox',   merchant_name: 'Equinox',              description: 'Gym Membership',    logo_url: null, frequency: 'MONTHLY', average_amount: 200.00, last_amount: 200.00, predicted_next_date: '2026-04-06', first_date: '2024-09-06', last_date: '2026-03-06', personal_finance_category_primary: 'PERSONAL_CARE', status: 'MATURE', source: 'recurring' },
  { stream_id: 'demo-rec-att',       merchant_name: 'AT&T',                 description: 'Phone Bill',        logo_url: null, frequency: 'MONTHLY', average_amount: 95.00,  last_amount: 95.00,  predicted_next_date: '2026-04-08', first_date: '2024-09-08', last_date: '2026-03-08', personal_finance_category_primary: 'SUBSCRIPTION', status: 'MATURE', source: 'recurring' },
  { stream_id: 'demo-rec-spectrum',  merchant_name: 'Spectrum',             description: 'Internet',          logo_url: null, frequency: 'MONTHLY', average_amount: 65.00,  last_amount: 65.00,  predicted_next_date: '2026-04-07', first_date: '2024-09-07', last_date: '2026-03-07', personal_finance_category_primary: 'SUBSCRIPTION', status: 'MATURE', source: 'recurring' },
  { stream_id: 'demo-rec-netflix',   merchant_name: 'Netflix',              description: 'Streaming',         logo_url: null, frequency: 'MONTHLY', average_amount: 15.49,  last_amount: 15.49,  predicted_next_date: '2026-04-03', first_date: '2024-09-03', last_date: '2026-03-03', personal_finance_category_primary: 'SUBSCRIPTION', status: 'MATURE', source: 'recurring' },
  { stream_id: 'demo-rec-spotify',   merchant_name: 'Spotify',              description: 'Music Streaming',   logo_url: null, frequency: 'MONTHLY', average_amount: 10.99,  last_amount: 10.99,  predicted_next_date: '2026-04-03', first_date: '2024-09-03', last_date: '2026-03-03', personal_finance_category_primary: 'SUBSCRIPTION', status: 'MATURE', source: 'recurring' },
  { stream_id: 'demo-rec-hulu',      merchant_name: 'Hulu',                 description: 'Streaming',         logo_url: null, frequency: 'MONTHLY', average_amount: 19.99,  last_amount: 19.99,  predicted_next_date: '2026-04-04', first_date: '2024-09-04', last_date: '2026-03-04', personal_finance_category_primary: 'SUBSCRIPTION', status: 'MATURE', source: 'recurring' },
  { stream_id: 'demo-rec-chatgpt',   merchant_name: 'ChatGPT Plus',         description: 'AI Subscription',  logo_url: null, frequency: 'MONTHLY', average_amount: 20.00,  last_amount: 20.00,  predicted_next_date: '2026-04-04', first_date: '2024-09-04', last_date: '2026-03-04', personal_finance_category_primary: 'SUBSCRIPTION', status: 'MATURE', source: 'recurring' },
  { stream_id: 'demo-rec-nytimes',   merchant_name: 'The New York Times',   description: 'Digital Subscription', logo_url: null, frequency: 'MONTHLY', average_amount: 17.00, last_amount: 17.00, predicted_next_date: '2026-04-06', first_date: '2024-09-06', last_date: '2026-03-06', personal_finance_category_primary: 'SUBSCRIPTION', status: 'MATURE', source: 'recurring' },
  { stream_id: 'demo-rec-cc',        merchant_name: 'Chase Credit Card',    description: 'Credit Card Min Payment', logo_url: null, frequency: 'MONTHLY', average_amount: 35.00, last_amount: 35.00, predicted_next_date: '2026-04-15', first_date: '2024-09-15', last_date: '2026-03-15', personal_finance_category_primary: 'LOAN_PAYMENTS', status: 'MATURE', source: 'liability' },
]

// ─── Spending summary ─────────────────────────────────────────────────────────
const NON_SPENDING_CATS = new Set(['INCOME', 'TRANSFER_IN', 'TRANSFER_OUT', 'BANK_FEES'])
const NON_SPENDING_DETAILED = new Set(['LOAN_PAYMENTS_CREDIT_CARD_PAYMENT', 'LOAN_PAYMENTS_LINE_OF_CREDIT_PAYMENT'])

function isSpending(t) {
  return !NON_SPENDING_CATS.has(t.personal_finance_category) &&
    !NON_SPENDING_DETAILED.has(t.personal_finance_category_detailed)
}

export function computeSpendingSummary(period) {
  const txns = getDemoTransactions().filter(isSpending)
  const today = new Date(TODAY)
  const spendingAccts = [ACCT.CC.name, ACCT.CHECKING.name]

  let buckets = []
  let startDate, endDate

  if (period === 'week' || period === '1w') {
    // Last 7 days, one bucket per day
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - (6 - i))
      return d
    })
    buckets = days.map(d => {
      const ds = d.toISOString().slice(0, 10)
      const label = d.toLocaleDateString('en-US', { weekday: 'short' })
      return { label, date: ds, [ACCT.CC.name]: 0, [ACCT.CHECKING.name]: 0 }
    })
    startDate = days[0].toISOString().slice(0, 10)
    endDate = TODAY
  } else if (period === 'month' || period === '1m') {
    // Last 30 days, one bucket per day
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - (29 - i))
      return d
    })
    buckets = days.map(d => {
      const ds = d.toISOString().slice(0, 10)
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      return { label, date: ds, [ACCT.CC.name]: 0, [ACCT.CHECKING.name]: 0 }
    })
    startDate = days[0].toISOString().slice(0, 10)
    endDate = TODAY
  } else if (period === '3m') {
    // Last 13 weeks
    buckets = Array.from({ length: 13 }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - (12 - i) * 7)
      const ds = d.toISOString().slice(0, 10)
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      return { label, date: ds, [ACCT.CC.name]: 0, [ACCT.CHECKING.name]: 0, _weekStart: ds }
    })
    startDate = buckets[0].date
    endDate = TODAY
  } else if (period === 'ytd') {
    // Jan 1 to today, weekly
    const jan1 = new Date(today.getFullYear(), 0, 1)
    const weekCount = Math.ceil((today - jan1) / (7 * 86400000))
    buckets = Array.from({ length: weekCount }, (_, i) => {
      const d = new Date(jan1)
      d.setDate(d.getDate() + i * 7)
      const ds = d.toISOString().slice(0, 10)
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      return { label, date: ds, [ACCT.CC.name]: 0, [ACCT.CHECKING.name]: 0, _weekStart: ds }
    })
    startDate = jan1.toISOString().slice(0, 10)
    endDate = TODAY
  } else {
    // '1y', 'all', 'year', or anything else → monthly buckets
    const monthCount = period === 'all' ? 18 : 12
    buckets = Array.from({ length: monthCount }, (_, i) => {
      const d = new Date(today)
      d.setMonth(d.getMonth() - (monthCount - 1 - i))
      d.setDate(1)
      const ds = d.toISOString().slice(0, 10)
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      return { label, date: ds, [ACCT.CC.name]: 0, [ACCT.CHECKING.name]: 0, _month: ds.slice(0, 7) }
    })
    startDate = buckets[0].date
    endDate = TODAY
  }

  // Fill buckets
  txns.forEach(t => {
    if (t.date < startDate || t.date > endDate) return
    if (!spendingAccts.includes(t.account_name)) return
    let b
    if (period === 'week' || period === '1w' || period === 'month' || period === '1m') {
      b = buckets.find(bkt => bkt.date === t.date)
    } else if (period === '3m' || period === 'ytd') {
      // assign to nearest week bucket
      for (let i = buckets.length - 1; i >= 0; i--) {
        if (t.date >= buckets[i].date) { b = buckets[i]; break }
      }
    } else {
      // monthly
      b = buckets.find(bkt => bkt._month === t.date.slice(0, 7))
    }
    if (b) b[t.account_name] = round2((b[t.account_name] || 0) + t.amount)
  })

  return { period, accounts: spendingAccts, buckets }
}

// ─── Cash flow ────────────────────────────────────────────────────────────────
let _cashFlowCache = null

export function computeCashFlow() {
  if (_cashFlowCache) return _cashFlowCache
  const txns = getDemoTransactions()
  const monthMap = {}

  txns.forEach(t => {
    const mo = t.date.slice(0, 7)
    if (!monthMap[mo]) monthMap[mo] = { month: mo, inflows: 0, outflows: 0 }
    if (t.personal_finance_category === 'INCOME') {
      monthMap[mo].inflows = round2(monthMap[mo].inflows + Math.abs(t.amount))
    } else if (isSpending(t)) {
      monthMap[mo].outflows = round2(monthMap[mo].outflows + t.amount)
    }
  })

  _cashFlowCache = Object.values(monthMap)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(m => ({ ...m, net: round2(m.inflows - m.outflows) }))
  return _cashFlowCache
}

export function computeCashFlowTransactions(month) {
  const txns = getDemoTransactions().filter(t => t.date.startsWith(month))
  return {
    inflows: txns.filter(t => t.personal_finance_category === 'INCOME'),
    outflows: txns.filter(isSpending),
  }
}

// ─── Net worth history ────────────────────────────────────────────────────────
// Starting values Sep 1 2024; ending at current balances Mar 19 2026 (540 days)
const NW_START = 115600
const NW_END = 186135

let _nwAllPoints = null

function buildNetWorthPoints() {
  if (_nwAllPoints) return _nwAllPoints
  const rng = createRng(0x1234abcd)
  const start = new Date('2024-09-01')
  const end = new Date(TODAY)
  const totalDays = Math.round((end - start) / 86400000)
  const points = []

  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const ds = d.toISOString().slice(0, 10)
    const progress = i / totalDays
    // Smooth base trend with sigmoid-like curve (slower start, accelerates)
    const trend = NW_START + (NW_END - NW_START) * (progress * progress * (3 - 2 * progress))
    // Market noise: ±$1,500 random walk, mean-reverting
    const noise = (rng() - 0.49) * 2000
    const net_worth = round2(Math.max(NW_START - 2000, trend + noise))
    points.push({ date: ds, net_worth })
  }
  _nwAllPoints = points
  return points
}

export function getDemoNetWorthHistory(range) {
  const all = buildNetWorthPoints()
  const today = new Date(TODAY)
  let cutoff

  if (range === '1W') cutoff = new Date(today.getTime() - 7 * 86400000)
  else if (range === '1M') cutoff = new Date(today.getTime() - 30 * 86400000)
  else if (range === '3M') cutoff = new Date(today.getTime() - 90 * 86400000)
  else if (range === 'YTD') cutoff = new Date(today.getFullYear(), 0, 1)
  else if (range === '1Y') cutoff = new Date(today.getTime() - 365 * 86400000)
  else cutoff = new Date('2024-09-01') // ALL

  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const pts = all.filter(p => p.date >= cutoffStr)

  // Thin out for shorter ranges (keep every point); thin for ALL (weekly)
  if (range === 'ALL' || range === '1Y') {
    return { range, points: pts.filter((_, i) => i % 7 === 0 || i === pts.length - 1) }
  }
  return { range, points: pts }
}

// ─── Portfolio history ────────────────────────────────────────────────────────
// Investments only (brokerage + 401k), growing from ~$93,500 to $159,480
const PORT_START = 93500
const PORT_END = 159480

let _portAllPoints = null

function buildPortfolioPoints() {
  if (_portAllPoints) return _portAllPoints
  const rng = createRng(0xfedc9876)
  const start = new Date('2024-09-01')
  const end = new Date(TODAY)
  const totalDays = Math.round((end - start) / 86400000)
  const points = []

  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const ds = d.toISOString().slice(0, 10)
    const progress = i / totalDays
    const trend = PORT_START + (PORT_END - PORT_START) * (progress * progress * (3 - 2 * progress))
    const noise = (rng() - 0.48) * 2500
    const value = round2(Math.max(PORT_START - 3000, trend + noise))
    points.push({ date: ds, value })
  }
  _portAllPoints = points
  return points
}

export function getDemoPortfolioHistory(range) {
  const all = buildPortfolioPoints()
  const today = new Date(TODAY)
  let cutoff

  if (range === '1W') cutoff = new Date(today.getTime() - 7 * 86400000)
  else if (range === '1M') cutoff = new Date(today.getTime() - 30 * 86400000)
  else if (range === '3M') cutoff = new Date(today.getTime() - 90 * 86400000)
  else if (range === 'YTD') cutoff = new Date(today.getFullYear(), 0, 1)
  else if (range === '1Y') cutoff = new Date(today.getTime() - 365 * 86400000)
  else cutoff = new Date('2024-09-01')

  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const pts = all.filter(p => p.date >= cutoffStr)

  if (range === 'ALL' || range === '1Y') {
    return { range, points: pts.filter((_, i) => i % 7 === 0 || i === pts.length - 1) }
  }
  return { range, points: pts }
}

export function getDemoPortfolioSnapshot(date) {
  const all = buildPortfolioPoints()
  const pt = all.find(p => p.date === date) || all[all.length - 1]
  const scale = pt.value / PORT_END
  return {
    date,
    holdings: DEMO_HOLDINGS.map(h => ({
      ...h,
      value: round2(h.value * scale),
      institution_price: round2(h.institution_price * scale),
      close_price: round2(h.close_price * scale),
    })),
  }
}

// ─── Ticker history ───────────────────────────────────────────────────────────
// Starting prices ~18 months ago, trending to current prices with realistic noise
const TICKER_TRENDS = {
  AAPL:  { start: 172, end: 185,  vol: 0.018 },
  MSFT:  { start: 415, end: 420,  vol: 0.016 },
  GOOGL: { start: 158, end: 175,  vol: 0.020 },
  AMZN:  { start: 188, end: 195,  vol: 0.022 },
  NVDA:  { start: 440, end: 880,  vol: 0.035 }, // huge winner
  META:  { start: 490, end: 515,  vol: 0.025 },
  TSLA:  { start: 260, end: 250,  vol: 0.045 }, // volatile, down slightly
  PLTR:  { start: 25,  end: 43,   vol: 0.038 },
  CRWD:  { start: 340, end: 370,  vol: 0.028 },
  NFLX:  { start: 690, end: 650,  vol: 0.022 }, // slightly down
  AMD:   { start: 155, end: 170,  vol: 0.030 },
  AVGO:  { start: 155, end: 190,  vol: 0.025 },
  SNOW:  { start: 185, end: 150,  vol: 0.032 }, // down
  ARM:   { start: 100, end: 128,  vol: 0.030 },
  VIIIX: { start: 310, end: 375,  vol: 0.010 },
  VSMAX: { start: 78,  end: 95,   vol: 0.012 },
  VTRIX: { start: 12,  end: 14.5, vol: 0.012 },
  VBTIX: { start: 9.5, end: 9.8,  vol: 0.005 },
}

// ─── Demo agent context ───────────────────────────────────────────────────────
export function getDemoAgentContext() {
  const txns = getDemoTransactions()
  const spending = txns.filter(isSpending)

  // Last 3 months spending by category
  const threeMonthsAgo = '2025-12-19'
  const recent3m = spending.filter(t => t.date >= threeMonthsAgo)
  const catTotals = {}
  recent3m.forEach(t => {
    catTotals[t.personal_finance_category] = round2((catTotals[t.personal_finance_category] || 0) + t.amount)
  })
  const catSummary = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amt]) => `  ${cat}: $${amt.toFixed(2)}`)
    .join('\n')

  // Monthly cash flow (last 6 months)
  const cfStr = computeCashFlow().slice(-6)
    .map(m => `  ${m.month}: income $${m.inflows.toFixed(0)}, spending $${m.outflows.toFixed(0)}, net $${m.net.toFixed(0)}`)
    .join('\n')

  // Recent 25 transactions
  const recentStr = txns.slice(0, 25)
    .map(t => `  ${t.date}  ${t.name.substring(0, 28).padEnd(28)}  ${t.amount >= 0 ? ' ' : '-'}$${Math.abs(t.amount).toFixed(2).padStart(7)}  ${t.personal_finance_category}`)
    .join('\n')

  // Portfolio
  const brokerStr = BROKERAGE_STOCKS.map(s =>
    `  ${s.ticker.padEnd(5)} ${s.qty}sh @ $${s.price} (cost $${s.cost_basis_per}) = $${round2(s.qty * s.price).toLocaleString()}`
  ).join('\n')
  const k401Str = K401_FUNDS.map(s =>
    `  ${s.ticker.padEnd(5)} ${s.qty}sh @ $${s.price} (cost $${s.cost_basis_per}) = $${round2(s.qty * s.price).toLocaleString()}`
  ).join('\n')

  return `FINANCIAL PROFILE: Alex Rivera, 29, software engineer in NYC. Today: 2026-03-19.

ACCOUNTS:
  Chase Total Checking (depository): $4,847.32 current
  Chase Premier Savings (depository): $24,150.00 current
  Chase Sapphire Preferred (credit card, balance owed): $2,341.87
  Vanguard Individual Brokerage: $72,250.00
  Vanguard 401(k): $87,230.00
  Net worth: ~$186,135

INCOME: $9,000/month take-home (two $4,500 ACME TECH INC direct deposits on 1st & 15th)

FIXED MONTHLY EXPENSES:
  Rent (Apt 4B, 245 E 14th St, Manhattan): $3,200
  Equinox gym: $200
  MTA unlimited monthly: $132
  AT&T phone: $95
  Spectrum internet: $65
  Con Edison electric: ~$80–$130 seasonal
  Hulu: $19.99, ChatGPT Plus: $20, NY Times: $17, Netflix: $15.49, Spotify: $10.99, iCloud+: $2.99, GitHub: $4

SPENDING LAST 3 MONTHS BY CATEGORY:
${catSummary}

CASH FLOW (last 6 months):
${cfStr}

RECENT TRANSACTIONS (most recent 25):
${recentStr}

BROKERAGE HOLDINGS ($72,250 total, $${BROKERAGE_CASH.toFixed(0)} cash):
${brokerStr}

401(k) HOLDINGS ($87,230 total, $${K401_CASH.toFixed(0)} cash):
${k401Str}

PORTFOLIO NOTES:
  NVDA: biggest winner, ~100% gain from cost basis
  TSLA: slightly underwater (bought at $280, now $250)
  SNOW: underwater (bought at $180, now $150)
  NFLX: slightly down (bought at $690, now $650)
  Net unrealized gain across brokerage: positive overall despite 3 losers
  Portfolio grown from ~$93,500 (Sep 2024) to ~$159,480 today (+70%)
  Net worth grown from ~$115,600 (Sep 2024) to ~$186,135 today`
}

export function getDemoTickerHistory(tickers, range) {
  const allPts = buildPortfolioPoints() // piggyback on existing date list
  const today = new Date(TODAY)
  let cutoff

  if (range === '1W') cutoff = new Date(today.getTime() - 7 * 86400000)
  else if (range === '1M') cutoff = new Date(today.getTime() - 30 * 86400000)
  else if (range === '3M') cutoff = new Date(today.getTime() - 90 * 86400000)
  else if (range === 'YTD') cutoff = new Date(today.getFullYear(), 0, 1)
  else if (range === '1Y') cutoff = new Date(today.getTime() - 365 * 86400000)
  else if (range === '5Y') cutoff = new Date(today.getTime() - 5 * 365 * 86400000)
  else cutoff = new Date('2024-09-01')

  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const startDate = new Date('2024-09-01')
  const totalDays = Math.round((new Date(TODAY) - startDate) / 86400000)

  const history = {}
  tickers.forEach(ticker => {
    const trend = TICKER_TRENDS[ticker] || { start: 100, end: 100, vol: 0.015 }
    const rng = createRng(ticker.split('').reduce((s, c) => s + c.charCodeAt(0), 0))
    // Generate full 18-month series
    const pts = []
    for (let i = 0; i <= totalDays; i++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + i)
      const ds = d.toISOString().slice(0, 10)
      const prog = i / totalDays
      const base = trend.start + (trend.end - trend.start) * (prog * prog * (3 - 2 * prog))
      const noise = (rng() - 0.5) * 2 * trend.vol * base
      pts.push({ date: ds, close: round2(Math.max(1, base + noise)) })
    }
    const filtered = pts.filter(p => p.date >= cutoffStr)
    history[ticker] = (range === 'ALL' || range === '1Y' || range === '5Y')
      ? filtered.filter((_, i) => i % 7 === 0 || i === filtered.length - 1)
      : filtered
  })

  return { tickers, range, history }
}
