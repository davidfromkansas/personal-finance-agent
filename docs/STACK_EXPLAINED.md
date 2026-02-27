# What we're building: explained simply

This doc describes the “stack” (the set of tools and services that make the app work) in plain language—no coding required to understand it.

---

## The big picture

The app has three main parts:

1. **What you see and click** (the website or app screen)
2. **Who you are** (signing in with Google)
3. **Your money data** (read-only connection to your bank or card, and where we store a copy so you can search it and ask questions later)

Each part uses different services. Here’s how they fit together.

---

## 1. What you see and click — the “frontend”

**What it is:** The screens you use: the landing page (“Your money. Simply Organized.”), the button to sign in with Google, and (once we build it) the place where you see your transactions and eventually chat about your spending.

**What we use:** **React** (a way to build interactive web pages) and **Vite** (a tool that packages and runs that code in the browser).

**Simple analogy:** This is the storefront—the part customers see and interact with. It doesn’t store your password or your bank data; it just shows the UI and sends your actions (e.g. “I clicked Sign in”) to the right place.

---

## 2. Who you are — signing in with Google

**What it is:** The “Continue with Google” flow. You click it, choose your Google account, and the app knows it’s you—without us ever seeing or storing your Google password.

**What we use:** **Firebase** (a Google product). Firebase runs the sign-in flow with Google and tells our app “this person is logged in as this email/name.”

**Simple analogy:** Like showing your ID at the door. The bouncer (Firebase) checks it with Google and tells our app “this person is allowed in.” We don’t keep a copy of your ID; we just know you’re in.

**You only do this once.** After you sign in with Google, we remember you. When you come back to the app later, you don’t have to sign in again unless you signed out or your session expired.

---

## 3. Your money data — safe, read-only connection

This part has two sub-parts: **getting** the data and **storing** it.

### Getting the data: Plaid

**What it is:** When you “connect” your bank or credit card (e.g. Chase Sapphire), you’re using a service called **Plaid**. You log in to your bank in a window Plaid provides; we never see your bank username or password. Plaid then gives us **read-only** transaction data (dates, amounts, merchants, categories)—no moving money, no making payments.

**What we use:** **Plaid** (a company that connects apps to banks and cards in a standard, secure way).

**Simple analogy:** Like giving someone read-only access to your checkbook: they can see what you spent and where, but they can’t write checks or move money.

**You only connect each bank/card once.** The first time you connect (e.g. Chase Sapphire), you’ll go through Plaid’s flow and log into your bank in their window. We then save that connection securely. The next time you open the app, we already have that link—we don’t ask you to connect again. You’ll only see the Plaid flow again if you add another account or need to reconnect (e.g. after changing your bank password).

### Storing the data: our own database

**What it is:** We keep a copy of your transaction data on **our** servers (not at the bank and not at Plaid). That way we can:

- Show it quickly when you open the app
- Let you search and filter it
- Later, power a chat feature (“How much did I spend on dining last month?”) without calling the bank every time

**What we use:** **Postgres** (a type of database—a structured place to store and query data). It runs on **Railway** (the company that hosts our backend and database).

**Simple analogy:** Like keeping a personal spreadsheet of your spending that only you can see, and that we use only to answer your questions and show your history.

---

## 4. The “backend” — our server

**What it is:** The part of the app that **you don’t see**. It runs on a computer in the cloud and:

- Talks to Plaid (with secret keys we never put in the part you see)
- Saves and reads your transaction data from the database
- Sends that data to the part you *do* see, when you’re logged in

**What we use:** **Node + Express** (a way to build that server and its “endpoints”—the digital doors the frontend knocks on to get or send data). This code lives in the **same project** under the folder **`/server`**, and it also runs on **Railway**.

**Simple analogy:** The kitchen and office behind the storefront. You don’t go there, but they prepare what you asked for (e.g. “my transactions for last month”) and hand it to the frontend to show you.

---

## 5. Where everything runs — Railway

**What it is:** **Railway** is a hosting company. We use it to run:

- The **frontend** (the website you open in the browser)
- The **backend** (our Node + Express server)
- The **database** (Postgres) where we store your linked accounts and transaction copy

So one company hosts all three; we don’t manage our own physical servers.

**Simple analogy:** Railway is the landlord that provides the building and utilities; we just install our app (frontend, backend, and database) in that building.

---

## One-sentence summary

**You use a website (React + Vite) that lets you sign in with Google (Firebase), connect your bank or card read-only (Plaid), and see and later chat about your spending using data we store safely in our database (Postgres) and serve through our server (Node + Express), all hosted in one place (Railway).**

---

## Why it’s set up this way

- **Security:** Your Google password and bank login never live in our app; Firebase and Plaid handle those. Our server holds the “keys” to talk to Plaid and the database, and they never go to your browser.
- **Speed and features:** By storing a copy of your transactions, we can load them fast and build search and chat without hitting the bank every time.
- **Simplicity:** One repo (one codebase), one host (Railway), and clear roles: frontend = what you see, backend = what does the work, database = where we keep your data.

If you want to go deeper on any one part (e.g. “How does Plaid get my transactions?” or “What does Railway actually do?”), we can add a short section for that.
