# abacus-agent

Ask questions about your personal finances directly from the terminal.

```
› What did I spend on food last month?

● Spending ("Summarize food spending in February 2026")
  ↳ spending summary
└ Called 1 data source in 2.1s

You spent $843.20 on Food & Drink in February — up from $710.50 in January,
driven mostly by a few larger restaurant bills mid-month.
```

## Requirements

- Node.js 18 or higher
- An [Abacus](https://abacus-money.com) account with at least one linked bank or investment account

## Installation

```bash
npm install -g abacus-agent
```

## Getting Started

**1. Log in**

```bash
abacus login
```

This opens a browser window. Sign in with your Google account — the same one you use on [abacus-money.com](https://abacus-money.com). Your credentials are saved locally and never sent anywhere except the Abacus server.

**2. Ask a question**

```bash
abacus "What is my net worth?"
```

Or launch the interactive REPL for a full conversation:

```bash
abacus
```

## Usage

### Interactive mode

```bash
abacus
```

Starts a conversation where you can ask follow-up questions. Abacus remembers the context of the conversation.

```
› What are my account balances?
› How does that compare to last month?
› Which account has grown the most?
```

### Single question mode

```bash
abacus "How much did I spend on travel this year?"
```

Prints the answer and exits. Useful for scripting or quick lookups.

### Commands

| Command | Description |
|---|---|
| `help` | Show example questions and tips |
| `accounts` | Show all connected accounts and balances |
| `logout` | Log out and delete saved credentials |
| `logout --all` | Log out and revoke all tokens server-side |
| `exit` / `quit` | Exit the REPL |

## What you can ask

**Spending & Transactions**
- "How much did I spend last month?"
- "What are my biggest spending categories this year?"
- "Show me my transactions at Whole Foods"
- "Compare my spending this month vs last month"

**Accounts & Net Worth**
- "What are my account balances?"
- "What is my net worth?"
- "How much available credit do I have?"

**Investments**
- "How is my portfolio performing?"
- "What are my biggest positions?"
- "Show me my recent trades"

**Bills & Subscriptions**
- "What subscriptions am I paying for?"
- "What recurring bills are coming up?"

## Tips

- Date ranges work naturally: "last 3 months", "in January", "this year"
- Ask for comparisons: "vs last month", "vs this time last year"
- Ask follow-up questions — Abacus remembers the conversation

## Authentication

Credentials are stored locally at `~/.abacus/config.json`. To log out:

```bash
abacus logout
```

To revoke all sessions server-side:

```bash
abacus logout --all
```
