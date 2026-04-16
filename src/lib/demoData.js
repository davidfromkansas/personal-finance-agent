/**
 * All static fake data for demo mode.
 * Alex Rivera, 28, software engineer in NYC with active social life and girlfriend.
 * Dynamic dates — always relative to today. ~1,500 transactions over 12 months.
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
const pad = n => String(n).padStart(2, '0')
const _now = new Date()
const TODAY = `${_now.getFullYear()}-${pad(_now.getMonth() + 1)}-${pad(_now.getDate())}`
const TODAY_DATE = new Date(TODAY + 'T12:00:00')

function dateStr(y, m, d) { return `${y}-${pad(m)}-${pad(d)}` }
function daysInMonth(y, m) { return new Date(y, m, 0).getDate() }
function dayOfWeek(y, m, d) { return new Date(y, m - 1, d).getDay() }

// 13 months: 12 months ago → current month
function buildMonths() {
  const ty = _now.getFullYear(), tm = _now.getMonth() + 1
  const endTotal = ty * 12 + (tm - 1)
  const startTotal = endTotal - 12
  return Array.from({ length: 13 }, (_, i) => {
    const total = startTotal + i
    const y = Math.floor(total / 12)
    const m = (total % 12) + 1
    return { y, m, str: `${y}-${pad(m)}` }
  })
}
const MONTHS = buildMonths()

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
    id: 1, item_id: 'demo-item-chase', institution_name: 'Chase', institution_logo: null,
    products_granted: ['transactions'], status: 'connected', error_code: null,
    last_synced_at: new Date().toISOString(), syncing: false,
    accounts: [
      { account_id: ACCT.CHECKING.id, name: ACCT.CHECKING.name, type: 'depository', subtype: 'checking', current: 4847.32, available: 4547.32, currency: 'USD' },
      { account_id: ACCT.SAVINGS.id,  name: ACCT.SAVINGS.name,  type: 'depository', subtype: 'savings',  current: 24150.00, available: 24150.00, currency: 'USD' },
      { account_id: ACCT.CC.id,       name: ACCT.CC.name,       type: 'credit',     subtype: 'credit card', current: 2341.87, available: 7658.13, currency: 'USD' },
    ],
  },
  {
    id: 2, item_id: 'demo-item-vanguard', institution_name: 'Vanguard', institution_logo: null,
    products_granted: ['transactions', 'investments'], status: 'connected', error_code: null,
    last_synced_at: new Date().toISOString(), syncing: false,
    accounts: [
      { account_id: ACCT.BROKERAGE.id, name: ACCT.BROKERAGE.name, type: 'investment', subtype: 'brokerage', current: 142655.00, available: null, currency: 'USD' },
      { account_id: ACCT.K401.id,      name: ACCT.K401.name,      type: 'investment', subtype: '401k',      current: 87230.00, available: null, currency: 'USD' },
    ],
  },
]

export const DEMO_ACCOUNTS = DEMO_CONNECTIONS.flatMap(c => c.accounts.map(a => ({ ...a, institution_name: c.institution_name })))

// ─── Investment Holdings ──────────────────────────────────────────────────────
const BROKERAGE_STOCKS = [
  { ticker: 'AAPL', name: 'Apple Inc', qty: 45, price: 185.00, cost_basis_per: 148.50, type: 'equity' },
  { ticker: 'NVDA', name: 'NVIDIA Corp', qty: 15, price: 880.00, cost_basis_per: 420.00, type: 'equity' },
  { ticker: 'MSFT', name: 'Microsoft Corp', qty: 22, price: 420.00, cost_basis_per: 310.00, type: 'equity' },
  { ticker: 'TSLA', name: 'Tesla Inc', qty: 25, price: 250.00, cost_basis_per: 280.00, type: 'equity' },
  { ticker: 'VOO', name: 'Vanguard S&P 500 ETF', qty: 15, price: 480.00, cost_basis_per: 390.00, type: 'etf' },
]
const BROKERAGE_STOCK_VALUE = BROKERAGE_STOCKS.reduce((s, h) => s + h.qty * h.price, 0)
const BROKERAGE_TOTAL = BROKERAGE_STOCK_VALUE + 1850
const BROKERAGE_CASH = 1850

const K401_FUNDS = [
  { ticker: 'VIIIX', name: 'Vanguard Institutional Index Fund', qty: 180, price: 375.00, cost_basis_per: 280.00, type: 'mutual fund' },
]
const K401_FUND_VALUE = K401_FUNDS.reduce((s, h) => s + h.qty * h.price, 0)
const K401_TOTAL = K401_FUND_VALUE
const K401_CASH = 0
const PORT_TOTAL = BROKERAGE_TOTAL + K401_TOTAL

function makeHolding(stock, accountId, accountName, institutionName) {
  return {
    item_id: accountId.startsWith('demo-chase') ? 'demo-item-chase' : 'demo-item-vanguard',
    account_id: accountId, institution_name: institutionName, account_name: accountName,
    security_name: stock.name, ticker: stock.ticker, security_type: stock.type,
    quantity: stock.qty, institution_price: stock.price, institution_price_as_of: TODAY,
    close_price: stock.price, value: round2(stock.qty * stock.price),
    cost_basis: round2(stock.qty * stock.cost_basis_per),
  }
}

export const DEMO_HOLDINGS = [
  ...BROKERAGE_STOCKS.map(s => makeHolding(s, ACCT.BROKERAGE.id, ACCT.BROKERAGE.name, 'Vanguard')),
  makeHolding({ ticker: 'CASH', name: 'Cash & Cash Equivalents', qty: 1, price: BROKERAGE_CASH, cost_basis_per: BROKERAGE_CASH, type: 'cash' }, ACCT.BROKERAGE.id, ACCT.BROKERAGE.name, 'Vanguard'),
  ...K401_FUNDS.map(s => makeHolding(s, ACCT.K401.id, ACCT.K401.name, 'Vanguard')),
]

// ─── Quotes ──────────────────────────────────────────────────────────────────
export const DEMO_QUOTES = {}
for (const s of [...BROKERAGE_STOCKS, ...K401_FUNDS]) {
  const rng = createRng(s.ticker.split('').reduce((a, c) => a + c.charCodeAt(0), 0))
  const chg = round2((rng() - 0.45) * s.price * 0.03)
  DEMO_QUOTES[s.ticker] = { price: s.price, change: chg, changePercent: round2(chg / s.price * 100) }
}

// ─── Merchant templates ──────────────────────────────────────────────────────
const GROCERY = ["Trader Joe's", 'Whole Foods Market', 'Key Food', 'Westside Market NYC', 'Fairway Market', 'Morton Williams', "Zabar's"]
const CASUAL_DINING = [
  "Joe's Pizza", "Xi'an Famous Foods", 'The Halal Guys', 'Shake Shack', 'Chipotle', 'Sweetgreen',
  "Chop't", 'Dos Toros Taqueria', "Vanessa's Dumpling House", 'Two Boots Pizza', 'Superiority Burger',
  "Katz's Delicatessen", "Mamoun's Falafel", "Juliana's Pizza", 'Los Tacos No. 1', 'Dig Inn', 'Parm',
]
const DATE_DINING = [
  'Carbone', 'Don Angie', 'Balthazar', 'The Smith', 'Sushi Yasuda', 'Bar Pitti',
  'Gramercy Tavern', 'Momofuku Ko', "L'Artusi", 'Llama Inn', 'Thai Diner', 'Via Carota',
  'Tatiana by Kwame Onwuachi', 'Dhamaka', 'Atomix', 'Cote Korean Steakhouse', 'Lilia',
]
const BRUNCH = [
  "Jack's Wife Freda", 'Egg Shop', 'Clinton St. Baking Company', 'Russ & Daughters Cafe',
  'Buvette', "Sadelle's", 'Cafe Mogador', 'Sunday in Brooklyn', "Ruby's Cafe", 'Maman',
  "The Butcher's Daughter", 'Cafe Cluny',
]
const COFFEE = [
  "Gregory's Coffee", 'Joe Coffee Company', 'Blue Bottle Coffee', 'Think Coffee',
  'Starbucks', "Dunkin'", 'Birch Coffee', 'Devocion', 'Blank Street Coffee',
]
const DELIVERY = ['DoorDash', 'Seamless', 'Uber Eats', 'Grubhub']
const BARS = [
  'Employees Only', 'Dead Rabbit', 'Attaboy', "McSorley's Old Ale House",
  'The Scratcher', "Milano's Bar", 'Blind Tiger Ale House', 'Peculier Pub',
  'PDT', 'Death & Co', 'Dante', 'The Up & Up', 'Pianos', 'Barcade',
]
const LATE_NIGHT = ["Artichoke Basille's Pizza", "Mamoun's Falafel", '99 Cent Fresh Pizza', 'The Halal Guys', 'Veselka']
const SHOPPING_GENERAL = ['Amazon', 'Target', 'Best Buy', 'Apple.com', 'MUJI']
const SHOPPING_CLOTHES = ['Uniqlo', 'H&M', 'Zara', 'Nike', 'Everlane', 'Bonobos', 'J.Crew']
const GIFTS_GF = ['1-800-Flowers', 'Tiffany & Co.', 'Sephora', 'Glossier', 'Mejuri', 'Le Labo', 'The Strand Bookstore', 'Diptyque']
const PHARMACY = ['Duane Reade', 'CVS Pharmacy', 'Walgreens']
const ENTERTAINMENT = [
  'AMC Lincoln Square', 'Regal Union Square', 'Brooklyn Bowl', 'The Metropolitan Museum of Art',
  'MoMA', 'The Comedy Cellar', 'Webster Hall', 'Alamo Drafthouse Cinema', 'Nitehawk Cinema',
]
const COUPLE_ACTIVITIES = ['SPIN New York', 'Chelsea Piers', 'Brooklyn Boulders', 'The Escape Game NYC', 'Spa Castle', 'SUMMIT One Vanderbilt', 'Sleep No More']
const EVENTS = ['Ticketmaster', 'StubHub', 'SeatGeek']
const BODEGA = ['Gristedes', '7-Eleven']

// ─── Transaction generator ────────────────────────────────────────────────────
let _txnCache = null
let _txnId = 0

function makeTxn(acct, name, amount, date, cat, detailedCat, channel = 'other') {
  _txnId++
  return {
    plaid_transaction_id: `demo-txn-${String(_txnId).padStart(5, '0')}`,
    account_id: acct.id, account_name: acct.name, name, amount: round2(amount),
    date, authorized_date: date, pending: false, logo_url: null,
    original_description: name.toUpperCase(), merchant_name: name,
    personal_finance_category: cat, personal_finance_category_detailed: detailedCat,
    personal_finance_category_confidence: 'HIGH', payment_channel: channel,
    location: null, website: null, counterparties: null, check_number: null,
  }
}

function generateTransactions() {
  const rng = createRng(0xdeadbeef)
  const txns = []

  MONTHS.forEach(({ y, m }, mi) => {
    const days = daysInMonth(y, m)

    // ─── Fixed monthly bills ────────────────────────────────────────
    txns.push(makeTxn(ACCT.CHECKING, 'ACME TECH INC Direct Deposit', -4500.00, dateStr(y, m, 1), 'INCOME', 'INCOME_WAGES'))
    txns.push(makeTxn(ACCT.CHECKING, 'ACME TECH INC Direct Deposit', -4500.00, dateStr(y, m, 15), 'INCOME', 'INCOME_WAGES'))
    txns.push(makeTxn(ACCT.CHECKING, 'Apt 4B \u2014 245 E 14th St', 3200.00, dateStr(y, m, 2), 'HOME', 'HOME_RENT'))

    const isWinter = m === 12 || m === 1 || m === 2
    const isSummer = m === 6 || m === 7 || m === 8
    const coned = isWinter ? rf(rng, 95, 130) : isSummer ? rf(rng, 85, 115) : rf(rng, 65, 90)
    txns.push(makeTxn(ACCT.CHECKING, 'Con Edison', round2(coned), dateStr(y, m, 10), 'HOME', 'HOME_UTILITIES'))

    txns.push(makeTxn(ACCT.CHECKING, 'Spectrum', 65.00, dateStr(y, m, 7), 'SUBSCRIPTION', 'SUBSCRIPTION_CABLE_AND_TELEPHONE', 'online'))
    txns.push(makeTxn(ACCT.CHECKING, 'AT&T', 95.00, dateStr(y, m, 8), 'SUBSCRIPTION', 'SUBSCRIPTION_CABLE_AND_TELEPHONE', 'online'))

    // Subscriptions
    txns.push(makeTxn(ACCT.CC, 'Netflix', 15.49, dateStr(y, m, 3), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))
    txns.push(makeTxn(ACCT.CC, 'Spotify', 10.99, dateStr(y, m, 3), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))
    txns.push(makeTxn(ACCT.CC, 'Hulu', 19.99, dateStr(y, m, 4), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))
    txns.push(makeTxn(ACCT.CC, 'ChatGPT Plus', 20.00, dateStr(y, m, 4), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))
    txns.push(makeTxn(ACCT.CC, 'iCloud+', 2.99, dateStr(y, m, 5), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))
    txns.push(makeTxn(ACCT.CC, 'GitHub', 4.00, dateStr(y, m, 5), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))
    txns.push(makeTxn(ACCT.CC, 'The New York Times', 17.00, dateStr(y, m, 6), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))
    txns.push(makeTxn(ACCT.CC, 'Claude Pro', 20.00, dateStr(y, m, 7), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))
    txns.push(makeTxn(ACCT.CC, 'Amazon Prime', 14.99, dateStr(y, m, 9), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))
    txns.push(makeTxn(ACCT.CC, 'Disney+', 13.99, dateStr(y, m, 10), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))
    txns.push(makeTxn(ACCT.CC, 'Apple Music', 10.99, dateStr(y, m, 11), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))
    txns.push(makeTxn(ACCT.CC, 'Notion', 10.00, dateStr(y, m, 12), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))
    txns.push(makeTxn(ACCT.CC, 'LinkedIn Premium', 29.99, dateStr(y, m, 14), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))
    txns.push(makeTxn(ACCT.CC, '1Password', 4.99, dateStr(y, m, 16), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))
    txns.push(makeTxn(ACCT.CC, 'Crunchyroll', 7.99, dateStr(y, m, 17), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))
    txns.push(makeTxn(ACCT.CC, 'YouTube Premium', 13.99, dateStr(y, m, 18), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))
    txns.push(makeTxn(ACCT.CC, 'Cursor Pro', 20.00, dateStr(y, m, 19), 'SUBSCRIPTION', 'SUBSCRIPTION_SUBSCRIPTION_SERVICES', 'online'))

    txns.push(makeTxn(ACCT.CHECKING, 'Lemonade Renters Insurance', 15.00, dateStr(y, m, 1), 'GENERAL_SERVICES', 'GENERAL_SERVICES_INSURANCE', 'online'))
    txns.push(makeTxn(ACCT.CC, 'Equinox', 200.00, dateStr(y, m, 6), 'PERSONAL_CARE', 'PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS'))
    txns.push(makeTxn(ACCT.CC, 'MTA New York City Transit', 132.00, dateStr(y, m, Math.min(18, days)), 'TRANSPORTATION', 'TRANSPORTATION_PUBLIC_TRANSIT'))
    txns.push(makeTxn(ACCT.CC, 'Cleanly', round2(rf(rng, 28, 45)), dateStr(y, m, ri(rng, 5, 12)), 'GENERAL_SERVICES', 'GENERAL_SERVICES_LAUNDRY_AND_DRY_CLEANING', 'online'))
    txns.push(makeTxn(ACCT.CC, 'Cleanly', round2(rf(rng, 28, 45)), dateStr(y, m, ri(rng, 18, 26)), 'GENERAL_SERVICES', 'GENERAL_SERVICES_LAUNDRY_AND_DRY_CLEANING', 'online'))
    txns.push(makeTxn(ACCT.CHECKING, 'Chase Credit Card Autopay', round2(rf(rng, 2200, 3800)), dateStr(y, m, 22), 'TRANSFER_OUT', 'TRANSFER_OUT_ACCOUNT_TRANSFER'))

    // ─── Weekly cadence ─────────────────────────────────────────────
    for (let weekStart = 1; weekStart <= days; weekStart += 7) {
      const weekEnd = Math.min(weekStart + 6, days)
      const wd = () => ri(rng, weekStart, weekEnd)
      const wkday = () => { for (let i = 0; i < 10; i++) { const d = ri(rng, weekStart, weekEnd); if (dayOfWeek(y, m, d) >= 1 && dayOfWeek(y, m, d) <= 5) return d }; return wd() }
      const wkend = () => { for (let i = 0; i < 10; i++) { const d = ri(rng, weekStart, weekEnd); const dow = dayOfWeek(y, m, d); if (dow === 0 || dow === 6) return d }; return wd() }

      // Coffee 2-3x/week
      for (let i = 0; i < ri(rng, 2, 3); i++)
        txns.push(makeTxn(ACCT.CC, pick(rng, COFFEE), round2(rf(rng, 4.50, 8.50)), dateStr(y, m, wkday()), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_COFFEE', 'in_store'))

      // Weekday lunches 2-3x
      for (let i = 0; i < ri(rng, 2, 3); i++)
        txns.push(makeTxn(ACCT.CC, pick(rng, CASUAL_DINING), round2(rf(rng, 12, 24)), dateStr(y, m, wkday()), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANTS_AND_BARS', 'in_store'))

      // Weeknight casual dinner 1-2x
      for (let i = 0; i < ri(rng, 1, 2); i++)
        txns.push(makeTxn(ACCT.CC, pick(rng, CASUAL_DINING), round2(rf(rng, 14, 35)), dateStr(y, m, wkday()), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANTS_AND_BARS', 'in_store'))

      // Grocery run 1x/week
      txns.push(makeTxn(ACCT.CC, pick(rng, GROCERY), round2(rf(rng, 35, 95)), dateStr(y, m, wd()), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES', 'in_store'))

      // Delivery 1x/week
      txns.push(makeTxn(ACCT.CC, pick(rng, DELIVERY), round2(rf(rng, 22, 55)), dateStr(y, m, wd()), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANTS_AND_BARS', 'online'))

      // Weekend brunch (~80% of weeks)
      if (rng() > 0.2)
        txns.push(makeTxn(ACCT.CC, pick(rng, BRUNCH), round2(rf(rng, 35, 85)), dateStr(y, m, wkend()), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANTS_AND_BARS', 'in_store'))

      // Date night (~75% of weeks)
      if (rng() > 0.25) {
        const dd = rng() > 0.5 ? wkend() : ri(rng, Math.max(weekStart, weekEnd - 2), weekEnd)
        txns.push(makeTxn(ACCT.CC, pick(rng, DATE_DINING), round2(rf(rng, 80, 220)), dateStr(y, m, dd), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANTS_AND_BARS', 'in_store'))
        if (rng() > 0.6)
          txns.push(makeTxn(ACCT.CC, pick(rng, BARS), round2(rf(rng, 25, 55)), dateStr(y, m, dd), 'ENTERTAINMENT', 'ENTERTAINMENT_BARS_CLUBS_AND_NIGHTCLUBS', 'in_store'))
      }

      // Going out with friends (~70% of weeks)
      if (rng() > 0.3) {
        const outDay = wkend()
        txns.push(makeTxn(ACCT.CC, pick(rng, BARS), round2(rf(rng, 35, 80)), dateStr(y, m, outDay), 'ENTERTAINMENT', 'ENTERTAINMENT_BARS_CLUBS_AND_NIGHTCLUBS', 'in_store'))
        if (rng() > 0.4)
          txns.push(makeTxn(ACCT.CC, pick(rng, BARS), round2(rf(rng, 25, 65)), dateStr(y, m, outDay), 'ENTERTAINMENT', 'ENTERTAINMENT_BARS_CLUBS_AND_NIGHTCLUBS', 'in_store'))
        if (rng() > 0.5)
          txns.push(makeTxn(ACCT.CC, pick(rng, LATE_NIGHT), round2(rf(rng, 6, 18)), dateStr(y, m, outDay), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANTS_AND_BARS', 'in_store'))
        if (rng() > 0.3)
          txns.push(makeTxn(ACCT.CC, rng() > 0.5 ? 'Uber' : 'Lyft', round2(rf(rng, 18, 42)), dateStr(y, m, outDay), 'TRANSPORTATION', 'TRANSPORTATION_TAXIS_AND_RIDE_SHARES', 'online'))
      }

      // Rideshare / Citibike 1-2x/week
      for (let i = 0; i < ri(rng, 1, 2); i++) {
        const isCiti = rng() < 0.35
        txns.push(makeTxn(ACCT.CC, isCiti ? 'Citibike' : (rng() > 0.5 ? 'Uber' : 'Lyft'),
          round2(isCiti ? 4.49 : rf(rng, 12, 32)), dateStr(y, m, wd()), 'TRANSPORTATION',
          isCiti ? 'TRANSPORTATION_BIKES_AND_SCOOTERS' : 'TRANSPORTATION_TAXIS_AND_RIDE_SHARES', 'online'))
      }

      // Bodega ~50%
      if (rng() > 0.5)
        txns.push(makeTxn(ACCT.CC, pick(rng, BODEGA), round2(rf(rng, 5, 18)), dateStr(y, m, wd()), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_CONVENIENCE_STORES', 'in_store'))
    }

    // ─── Monthly cadence ────────────────────────────────────────────
    // Shopping 2-4x
    for (let i = 0; i < ri(rng, 2, 4); i++) {
      const day = ri(rng, 1, days)
      if (rng() > 0.5) {
        const m_ = pick(rng, SHOPPING_GENERAL)
        txns.push(makeTxn(ACCT.CC, m_, round2(m_ === 'Amazon' ? rf(rng, 18, 150) : rf(rng, 25, 200)), dateStr(y, m, day),
          'GENERAL_MERCHANDISE', m_ === 'Amazon' ? 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES' : 'GENERAL_MERCHANDISE_SUPERSTORES',
          m_ === 'Amazon' || m_ === 'Apple.com' ? 'online' : 'in_store'))
      } else {
        txns.push(makeTxn(ACCT.CC, pick(rng, SHOPPING_CLOTHES), round2(rf(rng, 35, 180)), dateStr(y, m, day), 'SHOPS', 'SHOPS_CLOTHING_AND_ACCESSORIES', 'in_store'))
      }
    }

    // Pharmacy 1-2x
    for (let i = 0; i < ri(rng, 1, 2); i++)
      txns.push(makeTxn(ACCT.CC, pick(rng, PHARMACY), round2(rf(rng, 8, 55)), dateStr(y, m, ri(rng, 1, days)), 'MEDICAL', 'MEDICAL_PHARMACIES_AND_SUPPLEMENTS', 'in_store'))

    // Entertainment 1-2x
    for (let i = 0; i < ri(rng, 1, 2); i++) {
      const m_ = pick(rng, ENTERTAINMENT)
      const isMovie = m_.includes('AMC') || m_.includes('Regal') || m_.includes('Alamo') || m_.includes('Nitehawk')
      txns.push(makeTxn(ACCT.CC, m_, round2(isMovie ? rf(rng, 16, 28) : rf(rng, 18, 45)), dateStr(y, m, ri(rng, 1, days)),
        'ENTERTAINMENT', isMovie ? 'ENTERTAINMENT_MOVIES_AND_FILM' : 'ENTERTAINMENT_ARTS_AND_MUSEUMS', 'in_store'))
    }

    // Couple activity ~every other month
    if (rng() > 0.45)
      txns.push(makeTxn(ACCT.CC, pick(rng, COUPLE_ACTIVITIES), round2(rf(rng, 40, 120)), dateStr(y, m, ri(rng, 1, days)), 'ENTERTAINMENT', 'ENTERTAINMENT_RECREATION', 'in_store'))

    // Concert/game tickets ~every 2-3 months
    if (rng() > 0.6)
      txns.push(makeTxn(ACCT.CC, pick(rng, EVENTS), round2(rf(rng, 60, 280)), dateStr(y, m, ri(rng, 1, days)), 'ENTERTAINMENT', 'ENTERTAINMENT_SPORTING_EVENTS', 'online'))

    // Gift for GF ~every 2 months
    if (rng() > 0.55) {
      const gift = pick(rng, GIFTS_GF)
      txns.push(makeTxn(ACCT.CC, gift, round2(gift === '1-800-Flowers' ? rf(rng, 55, 95) : rf(rng, 40, 250)), dateStr(y, m, ri(rng, 1, days)),
        'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES', ['1-800-Flowers', 'Glossier', 'Mejuri'].includes(gift) ? 'online' : 'in_store'))
    }

    // Haircut every ~6 weeks
    if (mi % 2 === 0 || rng() > 0.7)
      txns.push(makeTxn(ACCT.CC, 'Fellow Barber', round2(rf(rng, 45, 65)), dateStr(y, m, ri(rng, 10, 25)), 'PERSONAL_CARE', 'PERSONAL_CARE_HAIR_AND_BEAUTY', 'in_store'))

    // ─── Special events ─────────────────────────────────────────────
    if (mi === 1) { // 2nd month: GF birthday
      txns.push(makeTxn(ACCT.CC, 'Le Bernardin', 420.00, dateStr(y, m, 8), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANTS_AND_BARS', 'in_store'))
      txns.push(makeTxn(ACCT.CC, 'Tiffany & Co.', 580.00, dateStr(y, m, 6), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES', 'in_store'))
    }
    if (mi === 3) { // holiday shopping
      txns.push(makeTxn(ACCT.CC, 'Amazon', 284.50, dateStr(y, m, 5), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES', 'online'))
      txns.push(makeTxn(ACCT.CC, 'Apple.com', 399.00, dateStr(y, m, 9), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES', 'online'))
      txns.push(makeTxn(ACCT.CC, 'JetBlue Airways', 342.00, dateStr(y, m, 12), 'TRAVEL', 'TRAVEL_FLIGHTS', 'online'))
      txns.push(makeTxn(ACCT.CC, 'Airbnb', 420.00, dateStr(y, m, 23), 'TRAVEL', 'TRAVEL_LODGING', 'online'))
    }
    if (mi === 5) { // Valentine's
      txns.push(makeTxn(ACCT.CC, 'Atomix', 380.00, dateStr(y, m, 14), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANTS_AND_BARS', 'in_store'))
      txns.push(makeTxn(ACCT.CC, '1-800-Flowers', 95.00, dateStr(y, m, 14), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES', 'online'))
      txns.push(makeTxn(ACCT.CC, 'Broadway.com', 280.00, dateStr(y, m, 14), 'ENTERTAINMENT', 'ENTERTAINMENT_ARTS_AND_MUSEUMS', 'online'))
    }
    if (mi === 6) { // Japan trip
      txns.push(makeTxn(ACCT.CC, 'ANA All Nippon Airways', 1850.00, dateStr(y, m, 1), 'TRAVEL', 'TRAVEL_FLIGHTS', 'online'))
      txns.push(makeTxn(ACCT.CC, 'Booking.com', 1420.00, dateStr(y, m, 3), 'TRAVEL', 'TRAVEL_LODGING', 'online'))
      txns.push(makeTxn(ACCT.CC, 'Japan Rail Pass', 285.00, dateStr(y, m, 5), 'TRAVEL', 'TRAVEL_TRANSIT', 'online'))
    }
    if (mi === 8) { // summer concerts
      txns.push(makeTxn(ACCT.CC, 'Ticketmaster', 185.00, dateStr(y, m, 10), 'ENTERTAINMENT', 'ENTERTAINMENT_MUSIC', 'online'))
      txns.push(makeTxn(ACCT.CC, 'SeatGeek', 145.00, dateStr(y, m, 22), 'ENTERTAINMENT', 'ENTERTAINMENT_SPORTING_EVENTS', 'online'))
    }
    if (mi === 10) { // Black Friday
      txns.push(makeTxn(ACCT.CC, 'Amazon', 512.00, dateStr(y, m, 28), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES', 'online'))
      txns.push(makeTxn(ACCT.CC, 'Best Buy', 349.00, dateStr(y, m, Math.min(29, days)), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES', 'in_store'))
    }
    if (mi === 11) { // Dec holiday gifts + NYE
      txns.push(makeTxn(ACCT.CC, 'Amazon', 328.00, dateStr(y, m, 7), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES', 'online'))
      txns.push(makeTxn(ACCT.CC, 'United Airlines', 380.00, dateStr(y, m, 10), 'TRAVEL', 'TRAVEL_FLIGHTS', 'online'))
      txns.push(makeTxn(ACCT.CC, 'Tiffany & Co.', 425.00, dateStr(y, m, 18), 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES', 'in_store'))
      txns.push(makeTxn(ACCT.CC, 'The NoMad Hotel', 320.00, dateStr(y, m, 31), 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_RESTAURANTS_AND_BARS', 'in_store'))
    }
  })

  // Cap at today and sort descending
  return txns.filter(t => t.date <= TODAY).sort((a, b) => b.date.localeCompare(a.date) || b.plaid_transaction_id.localeCompare(a.plaid_transaction_id))
}

export function getDemoTransactions() {
  if (!_txnCache) _txnCache = generateTransactions()
  return _txnCache
}

// ─── Recurring payments ───────────────────────────────────────────────────────
function nextMonthDate(dayOfMonth) {
  const d = new Date(_now)
  d.setMonth(d.getMonth() + 1)
  d.setDate(dayOfMonth)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function lastMonthDate(dayOfMonth) {
  const d = new Date(_now)
  d.setDate(dayOfMonth)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const DEMO_RECURRING = [
  { stream_id: 'demo-rec-rent', merchant_name: 'Apt 4B \u2014 245 E 14th St', description: 'Monthly Rent', logo_url: null, frequency: 'MONTHLY', average_amount: 3200.00, last_amount: 3200.00, predicted_next_date: nextMonthDate(2), first_date: MONTHS[0].str + '-02', last_date: lastMonthDate(2), personal_finance_category_primary: 'HOME', status: 'MATURE', source: 'recurring' },
  { stream_id: 'demo-rec-equinox', merchant_name: 'Equinox', description: 'Gym', logo_url: null, frequency: 'MONTHLY', average_amount: 200.00, last_amount: 200.00, predicted_next_date: nextMonthDate(6), first_date: MONTHS[0].str + '-06', last_date: lastMonthDate(6), personal_finance_category_primary: 'PERSONAL_CARE', status: 'MATURE', source: 'recurring' },
  { stream_id: 'demo-rec-att', merchant_name: 'AT&T', description: 'Phone', logo_url: null, frequency: 'MONTHLY', average_amount: 95.00, last_amount: 95.00, predicted_next_date: nextMonthDate(8), first_date: MONTHS[0].str + '-08', last_date: lastMonthDate(8), personal_finance_category_primary: 'SUBSCRIPTION', status: 'MATURE', source: 'recurring' },
  { stream_id: 'demo-rec-spectrum', merchant_name: 'Spectrum', description: 'Internet', logo_url: null, frequency: 'MONTHLY', average_amount: 65.00, last_amount: 65.00, predicted_next_date: nextMonthDate(7), first_date: MONTHS[0].str + '-07', last_date: lastMonthDate(7), personal_finance_category_primary: 'SUBSCRIPTION', status: 'MATURE', source: 'recurring' },
  { stream_id: 'demo-rec-netflix', merchant_name: 'Netflix', description: 'Streaming', logo_url: null, frequency: 'MONTHLY', average_amount: 15.49, last_amount: 15.49, predicted_next_date: nextMonthDate(3), first_date: MONTHS[0].str + '-03', last_date: lastMonthDate(3), personal_finance_category_primary: 'SUBSCRIPTION', status: 'MATURE', source: 'recurring' },
  { stream_id: 'demo-rec-spotify', merchant_name: 'Spotify', description: 'Music', logo_url: null, frequency: 'MONTHLY', average_amount: 10.99, last_amount: 10.99, predicted_next_date: nextMonthDate(3), first_date: MONTHS[0].str + '-03', last_date: lastMonthDate(3), personal_finance_category_primary: 'SUBSCRIPTION', status: 'MATURE', source: 'recurring' },
  { stream_id: 'demo-rec-hulu', merchant_name: 'Hulu', description: 'Streaming', logo_url: null, frequency: 'MONTHLY', average_amount: 19.99, last_amount: 19.99, predicted_next_date: nextMonthDate(4), first_date: MONTHS[0].str + '-04', last_date: lastMonthDate(4), personal_finance_category_primary: 'SUBSCRIPTION', status: 'MATURE', source: 'recurring' },
  { stream_id: 'demo-rec-chatgpt', merchant_name: 'ChatGPT Plus', description: 'AI', logo_url: null, frequency: 'MONTHLY', average_amount: 20.00, last_amount: 20.00, predicted_next_date: nextMonthDate(4), first_date: MONTHS[0].str + '-04', last_date: lastMonthDate(4), personal_finance_category_primary: 'SUBSCRIPTION', status: 'MATURE', source: 'recurring' },
  { stream_id: 'demo-rec-claude', merchant_name: 'Claude Pro', description: 'AI', logo_url: null, frequency: 'MONTHLY', average_amount: 20.00, last_amount: 20.00, predicted_next_date: nextMonthDate(7), first_date: MONTHS[0].str + '-07', last_date: lastMonthDate(7), personal_finance_category_primary: 'SUBSCRIPTION', status: 'MATURE', source: 'recurring' },
  { stream_id: 'demo-rec-nytimes', merchant_name: 'The New York Times', description: 'News', logo_url: null, frequency: 'MONTHLY', average_amount: 17.00, last_amount: 17.00, predicted_next_date: nextMonthDate(6), first_date: MONTHS[0].str + '-06', last_date: lastMonthDate(6), personal_finance_category_primary: 'SUBSCRIPTION', status: 'MATURE', source: 'recurring' },
  { stream_id: 'demo-rec-cursor', merchant_name: 'Cursor Pro', description: 'Dev Tool', logo_url: null, frequency: 'MONTHLY', average_amount: 20.00, last_amount: 20.00, predicted_next_date: nextMonthDate(19), first_date: MONTHS[0].str + '-19', last_date: lastMonthDate(19), personal_finance_category_primary: 'SUBSCRIPTION', status: 'MATURE', source: 'recurring' },
  { stream_id: 'demo-rec-yt', merchant_name: 'YouTube Premium', description: 'Streaming', logo_url: null, frequency: 'MONTHLY', average_amount: 13.99, last_amount: 13.99, predicted_next_date: nextMonthDate(18), first_date: MONTHS[0].str + '-18', last_date: lastMonthDate(18), personal_finance_category_primary: 'SUBSCRIPTION', status: 'MATURE', source: 'recurring' },
  { stream_id: 'demo-rec-cc', merchant_name: 'Chase Credit Card', description: 'Min Payment', logo_url: null, frequency: 'MONTHLY', average_amount: 35.00, last_amount: 35.00, predicted_next_date: nextMonthDate(15), first_date: MONTHS[0].str + '-15', last_date: lastMonthDate(15), personal_finance_category_primary: 'LOAN_PAYMENTS', status: 'MATURE', source: 'liability' },
]

// ─── Spending summary ─────────────────────────────────────────────────────────
const NON_SPENDING_CATS = new Set(['INCOME', 'TRANSFER_IN', 'TRANSFER_OUT', 'BANK_FEES'])
const NON_SPENDING_DETAILED = new Set(['LOAN_PAYMENTS_CREDIT_CARD_PAYMENT', 'LOAN_PAYMENTS_LINE_OF_CREDIT_PAYMENT'])
function isSpending(t) {
  return !NON_SPENDING_CATS.has(t.personal_finance_category) && !NON_SPENDING_DETAILED.has(t.personal_finance_category_detailed)
}

export function computeSpendingSummary(period) {
  const txns = getDemoTransactions().filter(isSpending)
  const today = new Date(TODAY + 'T12:00:00')
  const spendingAccts = [ACCT.CC.name, ACCT.CHECKING.name]
  const toDS = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`

  let buckets = [], startDate, endDate = TODAY

  if (period === 'week' || period === '1w') {
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() - (6 - i)); return d })
    buckets = days.map(d => ({ label: d.toLocaleDateString('en-US', { weekday: 'short' }), date: toDS(d), [ACCT.CC.name]: 0, [ACCT.CHECKING.name]: 0 }))
    startDate = toDS(days[0])
  } else if (period === 'month' || period === '1m') {
    const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() - (29 - i)); return d })
    buckets = days.map(d => ({ label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), date: toDS(d), [ACCT.CC.name]: 0, [ACCT.CHECKING.name]: 0 }))
    startDate = toDS(days[0])
  } else if (period === '3m') {
    buckets = Array.from({ length: 13 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() - (12 - i) * 7); return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), date: toDS(d), [ACCT.CC.name]: 0, [ACCT.CHECKING.name]: 0, _weekStart: toDS(d) } })
    startDate = buckets[0].date
  } else if (period === 'ytd') {
    const jan1 = new Date(today.getFullYear(), 0, 1)
    const weekCount = Math.ceil((today - jan1) / (7 * 86400000))
    buckets = Array.from({ length: weekCount }, (_, i) => { const d = new Date(jan1); d.setDate(d.getDate() + i * 7); return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), date: toDS(d), [ACCT.CC.name]: 0, [ACCT.CHECKING.name]: 0, _weekStart: toDS(d) } })
    startDate = toDS(jan1)
  } else {
    const monthCount = period === 'all' ? 12 : 12
    buckets = Array.from({ length: monthCount }, (_, i) => { const d = new Date(today); d.setMonth(d.getMonth() - (monthCount - 1 - i)); d.setDate(1); return { label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), date: toDS(d), [ACCT.CC.name]: 0, [ACCT.CHECKING.name]: 0, _month: toDS(d).slice(0, 7) } })
    startDate = buckets[0].date
  }

  txns.forEach(t => {
    if (t.date < startDate || t.date > endDate) return
    if (!spendingAccts.includes(t.account_name)) return
    let b
    if (period === 'week' || period === '1w' || period === 'month' || period === '1m') b = buckets.find(bkt => bkt.date === t.date)
    else if (period === '3m' || period === 'ytd') { for (let i = buckets.length - 1; i >= 0; i--) { if (t.date >= buckets[i].date) { b = buckets[i]; break } } }
    else b = buckets.find(bkt => bkt._month === t.date.slice(0, 7))
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
    if (t.personal_finance_category === 'INCOME') monthMap[mo].inflows = round2(monthMap[mo].inflows + Math.abs(t.amount))
    else if (isSpending(t)) monthMap[mo].outflows = round2(monthMap[mo].outflows + t.amount)
  })
  _cashFlowCache = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)).map(m => ({ ...m, net: round2(m.inflows - m.outflows) }))
  return _cashFlowCache
}

export function computeCashFlowTransactions(month) {
  const txns = getDemoTransactions().filter(t => t.date.startsWith(month))
  return { inflows: txns.filter(t => t.personal_finance_category === 'INCOME'), outflows: txns.filter(isSpending) }
}

// ─── Net worth history ────────────────────────────────────────────────────────
const NW_START = 155000, NW_END = 258000
let _nwAllPoints = null

function buildNetWorthPoints() {
  if (_nwAllPoints) return _nwAllPoints
  const rng = createRng(0x1234abcd)
  const start = new Date(MONTHS[0].y, MONTHS[0].m - 1, 1)
  const end = TODAY_DATE
  const totalDays = Math.round((end - start) / 86400000)
  const points = []
  function nwRegimeDrift(p) {
    if (p < 0.10) return { drift: 0.001, volMul: 1.0 }
    if (p < 0.25) return { drift: -0.002, volMul: 1.8 }
    if (p < 0.45) return { drift: 0.003, volMul: 1.5 }
    if (p < 0.60) return { drift: -0.001, volMul: 1.6 }
    if (p < 0.80) return { drift: 0.002, volMul: 1.2 }
    return { drift: 0.0025, volMul: 1.4 }
  }
  let value = NW_START
  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i)
    const ds = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
    if (i === 0) { points.push({ date: ds, net_worth: round2(value) }); continue }
    const progress = i / totalDays
    const { drift, volMul } = nwRegimeDrift(progress)
    const dailyNoise = (rng() + rng() + rng() - 1.5) * 0.008 * volMul
    const wave = Math.sin(i * 0.85) * 0.002
      + Math.sin(i * 0.28) * 0.003
      + Math.sin(i * 0.11) * 0.004
    value = value * (1 + drift + dailyNoise + wave)
    points.push({ date: ds, net_worth: round2(Math.max(NW_START * 0.5, value)) })
  }
  const scaleFactor = NW_END / value
  // Account balance ratios (checking, savings, cc debt, brokerage, 401k)
  const acctRatios = [
    { id: ACCT.CHECKING.id, ratio: 0.019 },   // ~$4,847
    { id: ACCT.SAVINGS.id,  ratio: 0.094 },    // ~$24,150
    { id: ACCT.CC.id,       ratio: -0.009 },   // ~-$2,342 (debt)
    { id: ACCT.BROKERAGE.id, ratio: 0.553 },   // ~$142,655
    { id: ACCT.K401.id,     ratio: 0.338 },    // ~$87,230
  ]
  for (const pt of points) {
    pt.net_worth = round2(pt.net_worth * scaleFactor)
    const by_account = {}
    for (const { id, ratio } of acctRatios) {
      by_account[id] = round2(pt.net_worth * ratio)
    }
    pt.by_account = by_account
  }
  _nwAllPoints = points
  return points
}

export function getDemoNetWorthHistory(range) {
  const all = buildNetWorthPoints()
  const today = TODAY_DATE
  let cutoff
  if (range === '1W') cutoff = new Date(today.getTime() - 7 * 86400000)
  else if (range === '1M') cutoff = new Date(today.getTime() - 30 * 86400000)
  else if (range === '3M') cutoff = new Date(today.getTime() - 90 * 86400000)
  else if (range === 'YTD') cutoff = new Date(today.getFullYear(), 0, 1)
  else if (range === '1Y') cutoff = new Date(today.getTime() - 365 * 86400000)
  else cutoff = new Date(MONTHS[0].y, MONTHS[0].m - 1, 1)

  const cutoffStr = `${cutoff.getFullYear()}-${pad(cutoff.getMonth()+1)}-${pad(cutoff.getDate())}`
  const pts = all.filter(p => p.date >= cutoffStr)
  return (range === 'ALL' || range === '1Y') ? { range, points: pts.filter((_, i) => i % 7 === 0 || i === pts.length - 1) } : { range, points: pts }
}

// ─── Portfolio history ────────────────────────────────────────────────────────
const PORT_START = 120000, PORT_END = PORT_TOTAL
let _portAllPoints = null

function buildPortfolioPoints() {
  if (_portAllPoints) return _portAllPoints
  const rng = createRng(0xfedc9876)
  const start = new Date(MONTHS[0].y, MONTHS[0].m - 1, 1)
  const end = TODAY_DATE
  const totalDays = Math.round((end - start) / 86400000)
  const points = []
  // Regime phases with drift + volatility; overlapping sine waves add local swings visible at every zoom level
  function regimeDrift(p) {
    if (p < 0.15) return { drift: 0.0002, volMul: 1.0 }
    if (p < 0.30) return { drift: -0.003, volMul: 2.2 }
    if (p < 0.50) return { drift: 0.004, volMul: 1.8 }
    if (p < 0.65) return { drift: -0.002, volMul: 2.0 }
    if (p < 0.85) return { drift: 0.0015, volMul: 1.2 }
    return { drift: 0.003, volMul: 1.5 }
  }
  let value = PORT_START
  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i)
    const ds = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
    if (i === 0) { points.push({ date: ds, value: round2(value) }); continue }
    const progress = i / totalDays
    const { drift, volMul } = regimeDrift(progress)
    const dailyNoise = (rng() + rng() + rng() - 1.5) * 0.012 * volMul
    // Multi-frequency sine waves so short windows (1W, 1M) always have visible swings
    const wave = Math.sin(i * 0.9) * 0.002          // ~7-day cycle
      + Math.sin(i * 0.3) * 0.003                    // ~21-day cycle
      + Math.sin(i * 0.12) * 0.004                   // ~52-day cycle
    value = value * (1 + drift + dailyNoise + wave)
    points.push({ date: ds, value: round2(Math.max(PORT_START * 0.5, value)) })
  }
  // Scale final point to match PORT_END
  const scaleFactor = PORT_END / value
  for (const pt of points) pt.value = round2(pt.value * scaleFactor)
  _portAllPoints = points
  return points
}

export function getDemoPortfolioHistory(range) {
  const all = buildPortfolioPoints()
  const today = TODAY_DATE
  let cutoff
  if (range === '1W') cutoff = new Date(today.getTime() - 7 * 86400000)
  else if (range === '1M') cutoff = new Date(today.getTime() - 30 * 86400000)
  else if (range === '3M') cutoff = new Date(today.getTime() - 90 * 86400000)
  else if (range === 'YTD') cutoff = new Date(today.getFullYear(), 0, 1)
  else if (range === '1Y') cutoff = new Date(today.getTime() - 365 * 86400000)
  else cutoff = new Date(MONTHS[0].y, MONTHS[0].m - 1, 1)

  const cutoffStr = `${cutoff.getFullYear()}-${pad(cutoff.getMonth()+1)}-${pad(cutoff.getDate())}`
  const pts = all.filter(p => p.date >= cutoffStr)
  return (range === 'ALL' || range === '1Y') ? { range, points: pts.filter((_, i) => i % 7 === 0 || i === pts.length - 1) } : { range, points: pts }
}

export function getDemoPortfolioSnapshot(date) {
  const all = buildPortfolioPoints()
  const pt = all.find(p => p.date === date) || all[all.length - 1]
  const scale = pt.value / PORT_END
  return { date, holdings: DEMO_HOLDINGS.map(h => ({ ...h, value: round2(h.value * scale), institution_price: round2(h.institution_price * scale), close_price: round2(h.close_price * scale) })) }
}

// ─── Ticker history ───────────────────────────────────────────────────────────
const TICKER_TRENDS = {
  AAPL: { start: 172, end: 185, vol: 0.018 }, MSFT: { start: 415, end: 420, vol: 0.016 },
  GOOGL: { start: 158, end: 175, vol: 0.020 }, AMZN: { start: 188, end: 195, vol: 0.022 },
  NVDA: { start: 440, end: 880, vol: 0.035 }, META: { start: 490, end: 515, vol: 0.025 },
  TSLA: { start: 260, end: 250, vol: 0.045 }, AMD: { start: 155, end: 170, vol: 0.030 },
  AVGO: { start: 155, end: 190, vol: 0.025 }, ARM: { start: 100, end: 128, vol: 0.030 },
  QCOM: { start: 150, end: 165, vol: 0.022 }, INTC: { start: 45, end: 32, vol: 0.035 },
  CRM: { start: 210, end: 270, vol: 0.022 }, ORCL: { start: 105, end: 155, vol: 0.020 },
  NOW: { start: 580, end: 780, vol: 0.022 }, SNOW: { start: 185, end: 150, vol: 0.032 },
  PLTR: { start: 25, end: 43, vol: 0.038 }, CRWD: { start: 340, end: 370, vol: 0.028 },
  PANW: { start: 240, end: 310, vol: 0.025 }, NFLX: { start: 690, end: 650, vol: 0.022 },
  DIS: { start: 90, end: 105, vol: 0.025 }, SPOT: { start: 160, end: 285, vol: 0.032 },
  V: { start: 255, end: 280, vol: 0.012 }, SQ: { start: 68, end: 72, vol: 0.040 },
  COIN: { start: 120, end: 215, vol: 0.048 }, UNH: { start: 510, end: 520, vol: 0.015 },
  LLY: { start: 480, end: 750, vol: 0.025 }, VOO: { start: 395, end: 480, vol: 0.010 },
  QQQ: { start: 370, end: 440, vol: 0.014 }, ARKK: { start: 50, end: 48, vol: 0.038 },
  VIIIX: { start: 310, end: 375, vol: 0.010 }, VSMAX: { start: 78, end: 95, vol: 0.012 },
  VTRIX: { start: 12, end: 14.5, vol: 0.012 }, VBTIX: { start: 9.5, end: 9.8, vol: 0.005 },
}

export function getDemoTickerHistory(tickers, range) {
  const today = TODAY_DATE
  let cutoff
  if (range === '1W') cutoff = new Date(today.getTime() - 7 * 86400000)
  else if (range === '1M') cutoff = new Date(today.getTime() - 30 * 86400000)
  else if (range === '3M') cutoff = new Date(today.getTime() - 90 * 86400000)
  else if (range === 'YTD') cutoff = new Date(today.getFullYear(), 0, 1)
  else if (range === '1Y') cutoff = new Date(today.getTime() - 365 * 86400000)
  else if (range === '5Y') cutoff = new Date(today.getTime() - 5 * 365 * 86400000)
  else cutoff = new Date(MONTHS[0].y, MONTHS[0].m - 1, 1)

  const cutoffStr = `${cutoff.getFullYear()}-${pad(cutoff.getMonth()+1)}-${pad(cutoff.getDate())}`
  const startDate = new Date(MONTHS[0].y, MONTHS[0].m - 1, 1)
  const totalDays = Math.round((today - startDate) / 86400000)

  const history = {}
  tickers.forEach(ticker => {
    const trend = TICKER_TRENDS[ticker] || { start: 100, end: 100, vol: 0.015 }
    const rng = createRng(ticker.split('').reduce((s, c) => s + c.charCodeAt(0), 0))
    const pts = []
    for (let i = 0; i <= totalDays; i++) {
      const d = new Date(startDate); d.setDate(d.getDate() + i)
      const ds = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
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

// ─── Cash flow time series ──────────────────────────────────────────────────
export function computeCashFlowTimeSeries(startDate, endDate, granularity = 'month') {
  const txns = getDemoTransactions().filter(t => t.date >= startDate && t.date <= endDate)
  const bucketMap = {}

  for (const t of txns) {
    let key
    if (granularity === 'day') key = t.date
    else if (granularity === 'week') {
      const d = new Date(t.date + 'T12:00:00')
      const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      key = `${mon.getFullYear()}-${pad(mon.getMonth()+1)}-${pad(mon.getDate())}`
    } else key = t.date.slice(0, 7)

    if (!bucketMap[key]) bucketMap[key] = { bucket: key, inflows: 0, outflows: 0 }
    if (t.personal_finance_category === 'INCOME') bucketMap[key].inflows = round2(bucketMap[key].inflows + Math.abs(t.amount))
    else if (isSpending(t)) bucketMap[key].outflows = round2(bucketMap[key].outflows + t.amount)
  }
  return Object.values(bucketMap).sort((a, b) => a.bucket.localeCompare(b.bucket)).map(b => ({ ...b, net: round2(b.inflows - b.outflows) }))
}

// ─── Cash flow breakdown (Sankey) ───────────────────────────────────────────
function periodDateRange(period, customRange) {
  const today = TODAY_DATE
  let start, end = TODAY
  if (period === 'week') { const d = new Date(today); d.setDate(d.getDate() - 7); start = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` }
  else if (period === 'month') { const d = new Date(today); d.setMonth(d.getMonth() - 1); start = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` }
  else if (period === 'quarter') { const d = new Date(today); d.setMonth(d.getMonth() - 3); start = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` }
  else if (period === 'ytd') start = `${today.getFullYear()}-01-01`
  else if (period === 'year') { const d = new Date(today); d.setFullYear(d.getFullYear() - 1); start = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` }
  else if (period === 'custom' && customRange) { start = customRange.startDate; end = customRange.endDate }
  else start = MONTHS[0].str + '-01'
  return { start, end }
}

export function computeCashFlowBreakdown(period, breakdown = 'category', accountIds = null, customRange = null, excludeCategories = []) {
  const { start, end } = periodDateRange(period, customRange)
  let txns = getDemoTransactions().filter(t => t.date >= start && t.date <= end)
  if (accountIds && accountIds.length) txns = txns.filter(t => accountIds.includes(t.account_id))

  const excludeSet = new Set(excludeCategories)
  const income = { total: 0, categories: [] }
  const expenses = { total: 0, categories: [] }
  const catMap = {}

  for (const t of txns) {
    const cat = breakdown === 'merchant' ? t.name : t.personal_finance_category
    if (excludeSet.has(cat)) continue
    const flowType = t.personal_finance_category === 'INCOME' ? 'income' : (isSpending(t) ? 'expense' : null)
    if (!flowType) continue
    if (!catMap[flowType + ':' + cat]) catMap[flowType + ':' + cat] = { flowType, name: cat, amount: 0 }
    catMap[flowType + ':' + cat].amount = round2(catMap[flowType + ':' + cat].amount + Math.abs(t.amount))
  }

  for (const entry of Object.values(catMap)) {
    if (entry.flowType === 'income') { income.total = round2(income.total + entry.amount); income.categories.push({ name: entry.name, amount: entry.amount }) }
    else { expenses.total = round2(expenses.total + entry.amount); expenses.categories.push({ name: entry.name, amount: entry.amount }) }
  }
  income.categories.sort((a, b) => b.amount - a.amount)
  expenses.categories.sort((a, b) => b.amount - a.amount)
  return { period, breakdown, income, expenses }
}

// ─── Cash flow node transactions ────────────────────────────────────────────
export function computeCashFlowNodeTransactions(period, breakdown = 'category', flowType = 'expense', categoryKey = '', accountIds = null, customRange = null) {
  const { start, end } = periodDateRange(period, customRange)
  let txns = getDemoTransactions().filter(t => t.date >= start && t.date <= end)
  if (accountIds && accountIds.length) txns = txns.filter(t => accountIds.includes(t.account_id))

  return txns.filter(t => {
    const isIncome = t.personal_finance_category === 'INCOME'
    if (flowType === 'income' && !isIncome) return false
    if (flowType === 'expense' && !isSpending(t)) return false
    if (flowType === 'expense' && isIncome) return false
    const cat = breakdown === 'merchant' ? t.name : t.personal_finance_category
    return cat === categoryKey
  }).sort((a, b) => b.date.localeCompare(a.date))
}

// ─── Investment & ticker transactions ───────────────────────────────────────
function generateInvestmentTransactions() {
  const rng = createRng(0xfeed1234)
  const txns = []
  const allStocks = [...BROKERAGE_STOCKS, ...K401_FUNDS]
  for (const stock of allStocks) {
    const accountId = BROKERAGE_STOCKS.includes(stock) ? ACCT.BROKERAGE.id : ACCT.K401.id
    // Initial buy ~10 months ago
    const buyMonth = MONTHS[ri(rng, 0, 3)]
    const buyDay = ri(rng, 1, daysInMonth(buyMonth.y, buyMonth.m))
    txns.push({
      investment_transaction_id: `demo-inv-${stock.ticker}-buy`,
      account_id: accountId,
      date: dateStr(buyMonth.y, buyMonth.m, buyDay),
      name: `Buy ${stock.ticker}`,
      ticker: stock.ticker,
      security_name: stock.name,
      type: 'buy',
      quantity: stock.qty,
      price: stock.cost_basis_per,
      amount: round2(stock.qty * stock.cost_basis_per),
    })
    // Some stocks got additional buys
    if (rng() > 0.6) {
      const addMonth = MONTHS[ri(rng, 4, 9)]
      const addDay = ri(rng, 1, daysInMonth(addMonth.y, addMonth.m))
      const addQty = ri(rng, 1, Math.max(1, Math.floor(stock.qty * 0.3)))
      const addPrice = round2(stock.cost_basis_per * rf(rng, 0.9, 1.1))
      txns.push({
        investment_transaction_id: `demo-inv-${stock.ticker}-add`,
        account_id: accountId,
        date: dateStr(addMonth.y, addMonth.m, addDay),
        name: `Buy ${stock.ticker}`,
        ticker: stock.ticker,
        security_name: stock.name,
        type: 'buy',
        quantity: addQty,
        price: addPrice,
        amount: round2(addQty * addPrice),
      })
    }
  }
  return txns.sort((a, b) => b.date.localeCompare(a.date))
}

let _invTxnCache = null
function getInvestmentTransactions() {
  if (!_invTxnCache) _invTxnCache = generateInvestmentTransactions()
  return _invTxnCache
}

export function getDemoInvestmentTransactions(accountId) {
  return getInvestmentTransactions().filter(t => t.account_id === accountId)
}

export function getDemoTickerTransactions(ticker) {
  return getInvestmentTransactions().filter(t => t.ticker === ticker)
}

// ─── Demo agent context ───────────────────────────────────────────────────────
// ─── Demo chat (client-side canned responses) ───────────────────────────────
const DEMO_CHAT_RESPONSES = [
  {
    keywords: ['snapshot', 'overview', 'summary', 'balances', 'where my money'],
    tools: ['get_current_balances', 'get_spending_summary', 'get_cash_flow'],
    text: () => {
      const cf = computeCashFlow().slice(-1)[0]
      return `Here's your financial snapshot as of ${TODAY}:

**Accounts**
| Account | Balance |
|---|---|
| Chase Total Checking | $4,847.32 |
| Chase Premier Savings | $24,150.00 |
| Chase Sapphire Preferred | -$2,341.87 |
| Vanguard Brokerage | $${BROKERAGE_TOTAL.toLocaleString()} |
| Vanguard 401(k) | $${K401_TOTAL.toLocaleString()} |

**Net Worth: ~$${NW_END.toLocaleString()}**

This month you've earned **$${cf?.inflows?.toLocaleString() ?? '9,000'}** and spent **$${cf?.outflows?.toLocaleString() ?? '6,500'}**, leaving a net savings of **$${cf?.net?.toLocaleString() ?? '2,500'}**. Your biggest spending categories are rent ($3,200), dining out, and groceries. Overall you're in good shape — your savings rate is around 28%.`
    },
  },
  {
    keywords: ['spending for', 'purchases', 'categories', 'top categories', 'where did my money', 'how much did i spend'],
    tools: ['get_spending_summary', 'get_transactions'],
    text: () => {
      const txns = getDemoTransactions().filter(isSpending)
      const thirtyAgo = (() => { const d = new Date(TODAY_DATE); d.setDate(d.getDate() - 30); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` })()
      const recent = txns.filter(t => t.date >= thirtyAgo)
      const catTotals = {}
      recent.forEach(t => { catTotals[t.personal_finance_category] = round2((catTotals[t.personal_finance_category] || 0) + t.amount) })
      const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 6)
      const total = sorted.reduce((s, [, v]) => s + v, 0)
      const rows = sorted.map(([cat, amt]) => `| ${cat} | $${amt.toFixed(2)} |`).join('\n')
      const biggest = recent.sort((a, b) => b.amount - a.amount).slice(0, 5)
      const bigRows = biggest.map(t => `| ${t.date} | ${t.name} | $${t.amount.toFixed(2)} |`).join('\n')
      return `Here's your spending breakdown for the last 30 days (**$${total.toFixed(2)}** total):

**By Category**
| Category | Amount |
|---|---|
${rows}

**Biggest Purchases**
| Date | Merchant | Amount |
|---|---|---|
${bigRows}

Your dining spending (casual + date nights + delivery) is your second-largest category after rent. The weekend brunches and date nights at places like Carbone and Balthazar are adding up — consider setting a monthly dining budget if you want to optimize savings.`
    },
  },
  {
    keywords: ['portfolio', 'investment', 'stocks', 'holdings', 'brokerage', 'performance', 'drivers', 'biggest drivers'],
    tools: ['get_portfolio_summary', 'get_holdings', 'get_investment_history'],
    text: () => {
      const gains = BROKERAGE_STOCKS.map(s => ({
        ticker: s.ticker,
        gain: round2((s.price - s.cost_basis_per) * s.qty),
        pct: round2((s.price - s.cost_basis_per) / s.cost_basis_per * 100),
      })).sort((a, b) => b.gain - a.gain)
      const winners = gains.filter(g => g.gain > 0).slice(0, 3)
      const losers = gains.filter(g => g.gain < 0)
      const winRows = winners.map(g => `| ${g.ticker} | +$${g.gain.toLocaleString()} | +${g.pct}% |`).join('\n')
      const loseRows = losers.map(g => `| ${g.ticker} | -$${Math.abs(g.gain).toLocaleString()} | ${g.pct}% |`).join('\n')
      return `Here's your portfolio overview:

**Brokerage Account: $${BROKERAGE_TOTAL.toLocaleString()}**
| Ticker | Shares | Price | Value |
|---|---|---|---|
${BROKERAGE_STOCKS.map(s => `| ${s.ticker} | ${s.qty} | $${s.price} | $${round2(s.qty * s.price).toLocaleString()} |`).join('\n')}

**Top Gainers**
| Ticker | Gain | % |
|---|---|---|
${winRows}

${losers.length ? `**Losers**\n| Ticker | Loss | % |\n|---|---|---|\n${loseRows}` : ''}

**401(k): $${K401_TOTAL.toLocaleString()}** — invested in ${K401_FUNDS[0].name}.

Your portfolio is heavily weighted toward big tech. NVDA has been your biggest winner. Consider whether you want to rebalance or take some profits.`
    },
  },
  {
    keywords: ['savings rate', 'saving', 'save'],
    tools: ['get_cash_flow', 'get_spending_summary'],
    text: () => {
      const cf = computeCashFlow().slice(-3)
      const rows = cf.map(m => {
        const rate = m.inflows > 0 ? round2((m.net / m.inflows) * 100) : 0
        return `| ${m.month} | $${m.inflows.toLocaleString()} | $${m.outflows.toLocaleString()} | $${m.net.toLocaleString()} | ${rate}% |`
      }).join('\n')
      const avgRate = round2(cf.reduce((s, m) => s + (m.inflows > 0 ? m.net / m.inflows * 100 : 0), 0) / cf.length)
      return `Here's how your savings rate has trended over the past 3 months:

| Month | Income | Spending | Net | Savings Rate |
|---|---|---|---|---|
${rows}

Your average savings rate is **${avgRate}%**. That's solid for someone in their late 20s in NYC — the typical benchmark is 20%. Your rent at $3,200/month is your biggest fixed cost. The months where your savings rate dips tend to correlate with bigger discretionary spending (date nights, events, shopping).`
    },
  },
  {
    keywords: ['coffee'],
    tools: ['get_transactions'],
    text: () => {
      const txns = getDemoTransactions().filter(t => t.personal_finance_category_detailed === 'FOOD_AND_DRINK_COFFEE')
      const byMonth = {}
      txns.forEach(t => {
        const mo = t.date.slice(0, 7)
        if (!byMonth[mo]) byMonth[mo] = { count: 0, total: 0 }
        byMonth[mo].count++
        byMonth[mo].total = round2(byMonth[mo].total + t.amount)
      })
      const months = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).slice(-6)
      const rows = months.map(([mo, d]) => `| ${mo} | ${d.count} | $${d.total.toFixed(2)} | $${(d.total / d.count).toFixed(2)} |`).join('\n')
      const totalSpent = months.reduce((s, [, d]) => s + d.total, 0)
      const totalCount = months.reduce((s, [, d]) => s + d.count, 0)
      return `Here's your coffee spending over the last 6 months:

| Month | Visits | Total | Avg/Visit |
|---|---|---|---|
${rows}

**Total: $${totalSpent.toFixed(2)} across ${totalCount} visits** (avg $${(totalSpent / totalCount).toFixed(2)}/visit)

You're averaging about ${Math.round(totalCount / months.length)} coffee runs per week. If you're looking to cut back, even dropping to 2x/week would save you ~$${round2(totalSpent / months.length * 0.3).toFixed(0)}/month.`
    },
  },
  {
    keywords: ['recurring', 'subscriptions', 'bills'],
    tools: ['get_transactions'],
    text: () => {
      const total = DEMO_RECURRING.reduce((s, r) => s + r.average_amount, 0)
      const rows = DEMO_RECURRING.map(r => `| ${r.merchant_name} | ${r.description} | $${r.average_amount.toFixed(2)} |`).join('\n')
      return `Here are your recurring payments:

| Service | Description | Monthly |
|---|---|---|
${rows}

**Total: $${total.toFixed(2)}/month**

Your biggest recurring costs are rent ($3,200) and Equinox ($200). On the subscriptions side, you're spending $${round2(total - 3200 - 200 - 95 - 65 - 35).toFixed(2)}/month on streaming, AI tools, and news. If you wanted to trim, consider whether you need both Netflix ($15.49) and Hulu ($19.99), or both ChatGPT Plus ($20) and Claude Pro ($20).`
    },
  },
  {
    keywords: ['cash flow', 'inflows', 'outflows', 'net cash'],
    tools: ['get_cash_flow', 'get_transactions'],
    text: () => {
      const cf = computeCashFlow().slice(-3)
      const rows = cf.map(m => `| ${m.month} | $${m.inflows.toLocaleString()} | $${m.outflows.toLocaleString()} | $${m.net >= 0 ? '+' : ''}${m.net.toLocaleString()} |`).join('\n')
      const avgNet = round2(cf.reduce((s, m) => s + m.net, 0) / cf.length)
      const worstMonth = cf.reduce((w, m) => m.net < w.net ? m : w, cf[0])
      return `Here's your cash flow analysis for the past 3 months:

| Month | Inflows | Outflows | Net |
|---|---|---|---|
${rows}

**Average monthly net: $${avgNet.toLocaleString()}**

${worstMonth.net < 0 ? `**Warning:** You spent more than you earned in ${worstMonth.month} (net $${worstMonth.net.toLocaleString()}). This was likely due to special events or larger purchases that month.` : 'You\'ve maintained positive cash flow every month — nice work.'}

Your inflows are consistent at ~$9,000/month from your salary. Outflow variation comes from dining, entertainment, and one-off purchases. Your rent ($3,200) and subscriptions (~$530) are fixed costs that make up about 40% of your spending.`
    },
  },
  {
    keywords: ['recent transactions', 'analyze my', 'unusual', 'unexpected', 'frequent merchants', 'largest purchases'],
    tools: ['get_transactions', 'get_spending_summary'],
    text: () => {
      const txns = getDemoTransactions().filter(isSpending)
      const thirtyAgo = (() => { const d = new Date(TODAY_DATE); d.setDate(d.getDate() - 30); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` })()
      const recent = txns.filter(t => t.date >= thirtyAgo)
      // Top merchants by frequency
      const merchantCount = {}
      recent.forEach(t => { merchantCount[t.name] = (merchantCount[t.name] || 0) + 1 })
      const topMerchants = Object.entries(merchantCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
      const merchantRows = topMerchants.map(([name, count]) => `| ${name} | ${count} |`).join('\n')
      // Largest purchases
      const biggest = recent.sort((a, b) => b.amount - a.amount).slice(0, 5)
      const bigRows = biggest.map(t => `| ${t.date} | ${t.name} | $${t.amount.toFixed(2)} | ${t.personal_finance_category} |`).join('\n')
      return `Here's your transaction analysis for the past 30 days:

**Most Frequent Merchants**
| Merchant | Visits |
|---|---|
${merchantRows}

**Largest Purchases**
| Date | Merchant | Amount | Category |
|---|---|---|---|
${bigRows}

Your coffee habit and dining out are your most frequent transaction types. No unusual or unexpected charges detected — your spending patterns look consistent with prior months. The largest outliers are rent and any one-off purchases like gifts or events.`
    },
  },
  {
    keywords: ['net worth trend', 'net worth insight', 'net worth analysis'],
    tools: ['get_net_worth', 'get_balance_history', 'get_accounts'],
    text: () => {
      const hist = getDemoNetWorthHistory('3M')
      const pts = hist.points
      const first = pts[0]?.net_worth ?? NW_START
      const last = pts[pts.length - 1]?.net_worth ?? NW_END
      const change = round2(last - first)
      const pct = round2(change / first * 100)
      return `Here's your net worth analysis:

**Current Net Worth: $${last.toLocaleString()}**
**3-Month Change: ${change >= 0 ? '+' : ''}$${change.toLocaleString()} (${pct >= 0 ? '+' : ''}${pct}%)**

**Breakdown by Account**
| Account | Balance | % of Net Worth |
|---|---|---|
| Chase Checking | $4,847 | ${round2(4847/last*100)}% |
| Chase Savings | $24,150 | ${round2(24150/last*100)}% |
| Chase Sapphire (debt) | -$2,342 | -${round2(2342/last*100)}% |
| Vanguard Brokerage | $${BROKERAGE_TOTAL.toLocaleString()} | ${round2(BROKERAGE_TOTAL/last*100)}% |
| Vanguard 401(k) | $${K401_TOTAL.toLocaleString()} | ${round2(K401_TOTAL/last*100)}% |

Your investments (brokerage + 401k) make up about ${round2((BROKERAGE_TOTAL + K401_TOTAL)/last*100)}% of your net worth. The main driver of net worth growth has been investment appreciation — your savings contributions add ~$2,500/month while portfolio gains have been the bigger factor. Consider building up your emergency fund (savings) to cover 6 months of expenses (~$39,000).`
    },
  },
  {
    keywords: ['explain my portfolio', 'portfolio performance in'],
    tools: ['get_portfolio_summary', 'get_holdings', 'get_investment_history'],
    text: () => {
      const hist = getDemoPortfolioHistory('1M')
      const pts = hist.points
      const first = pts[0]?.value ?? PORT_START
      const last = pts[pts.length - 1]?.value ?? PORT_TOTAL
      const change = round2(last - first)
      const pct = round2(change / first * 100)
      const gains = BROKERAGE_STOCKS.map(s => ({
        ticker: s.ticker, gain: round2((s.price - s.cost_basis_per) * s.qty),
        pct: round2((s.price - s.cost_basis_per) / s.cost_basis_per * 100),
      })).sort((a, b) => b.gain - a.gain)
      return `**Portfolio Performance — Past Month**

Your total portfolio moved from **$${first.toLocaleString()}** to **$${last.toLocaleString()}** (${change >= 0 ? '+' : ''}$${change.toLocaleString()}, ${pct >= 0 ? '+' : ''}${pct}%).

**Individual Stock Performance**
| Ticker | Current Value | Total Gain/Loss | % Return |
|---|---|---|---|
${gains.map(g => `| ${g.ticker} | $${round2(BROKERAGE_STOCKS.find(s=>s.ticker===g.ticker).qty * BROKERAGE_STOCKS.find(s=>s.ticker===g.ticker).price).toLocaleString()} | ${g.gain >= 0 ? '+' : ''}$${g.gain.toLocaleString()} | ${g.gain >= 0 ? '+' : ''}${g.pct}% |`).join('\n')}

NVDA continues to be your standout performer with the largest absolute gain. TSLA is underwater from your cost basis — consider whether your thesis still holds or if you want to average down.`
    },
  },
]

const DEMO_FALLBACK_RESPONSE =`I'm running in demo mode with sample data for Alex Rivera, a 28-year-old software engineer in NYC. I can answer questions about:

- **Spending & transactions** — "Where did my money go this month?"
- **Portfolio & investments** — "How are my stocks doing?"
- **Cash flow & savings** — "What's my savings rate?"
- **Subscriptions** — "What are my recurring bills?"
- **Coffee spending** — "How much do I spend on coffee?"

Try one of the suggested prompts above, or ask me anything about the demo finances!`

export function getDemoChatEvents(message) {
  const lower = message.toLowerCase()
  const match = DEMO_CHAT_RESPONSES.find(r => r.keywords.some(k => lower.includes(k)))
  const tools = match?.tools ?? []
  const text = match ? match.text() : DEMO_FALLBACK_RESPONSE

  // Return array of SSE-style events
  const events = []
  tools.forEach((tool, i) => {
    events.push({ type: 'tool_call', tool, callId: `demo-${i}` })
    events.push({ type: 'tool_done', callId: `demo-${i}`, count: ri(createRng(i + 42), 3, 25) })
  })
  // Split text into chunks for streaming feel
  const words = text.split(' ')
  for (let i = 0; i < words.length; i += 4) {
    events.push({ type: 'text', text: (i > 0 ? ' ' : '') + words.slice(i, i + 4).join(' ') })
  }
  events.push({ type: 'done' })
  return events
}

export function getDemoAgentContext() {
  const txns = getDemoTransactions()
  const spending = txns.filter(isSpending)
  const threeMonthsAgo = (() => { const d = new Date(TODAY_DATE); d.setMonth(d.getMonth() - 3); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` })()
  const recent3m = spending.filter(t => t.date >= threeMonthsAgo)
  const catTotals = {}
  recent3m.forEach(t => { catTotals[t.personal_finance_category] = round2((catTotals[t.personal_finance_category] || 0) + t.amount) })
  const catSummary = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => `  ${cat}: $${amt.toFixed(2)}`).join('\n')
  const cfStr = computeCashFlow().slice(-6).map(m => `  ${m.month}: income $${m.inflows.toFixed(0)}, spending $${m.outflows.toFixed(0)}, net $${m.net.toFixed(0)}`).join('\n')
  const recentStr = txns.slice(0, 25).map(t => `  ${t.date}  ${t.name.substring(0, 28).padEnd(28)}  ${t.amount >= 0 ? ' ' : '-'}$${Math.abs(t.amount).toFixed(2).padStart(7)}  ${t.personal_finance_category}`).join('\n')
  const brokerStr = BROKERAGE_STOCKS.map(s => `  ${s.ticker.padEnd(5)} ${s.qty}sh @ $${s.price} (cost $${s.cost_basis_per}) = $${round2(s.qty * s.price).toLocaleString()}`).join('\n')
  const k401Str = K401_FUNDS.map(s => `  ${s.ticker.padEnd(5)} ${s.qty}sh @ $${s.price} (cost $${s.cost_basis_per}) = $${round2(s.qty * s.price).toLocaleString()}`).join('\n')

  return `FINANCIAL PROFILE: Alex Rivera, 28, software engineer in NYC. Today: ${TODAY}.

ACCOUNTS:
  Chase Total Checking: $4,847.32
  Chase Premier Savings: $24,150.00
  Chase Sapphire Preferred (credit card): $2,341.87 owed
  Vanguard Individual Brokerage: $${BROKERAGE_TOTAL.toLocaleString()}
  Vanguard 401(k): $${K401_TOTAL.toLocaleString()}
  Net worth: ~$${NW_END.toLocaleString()}

INCOME: $9,000/month (two $4,500 deposits on 1st & 15th)

SPENDING LAST 3 MONTHS BY CATEGORY:
${catSummary}

CASH FLOW (last 6 months):
${cfStr}

RECENT TRANSACTIONS (25):
${recentStr}

BROKERAGE ($${BROKERAGE_TOTAL.toLocaleString()}, $${BROKERAGE_CASH} cash):
${brokerStr}

401(k) ($${K401_TOTAL.toLocaleString()}, $${K401_CASH} cash):
${k401Str}`
}
