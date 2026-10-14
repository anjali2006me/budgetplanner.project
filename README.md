# BudgetWise: Personal Budget & Expense Planner

A 5-page web app to track income, expenses, monthly budgets and spending patterns.

- **Front end:** plain HTML, CSS and JavaScript (no build step, no framework)
- **Backend + database:** [Supabase](https://supabase.com) (hosted Postgres with an auto-generated REST API)
- **Authentication:** login and sign-up page; every page requires a signed-in user. Real accounts through Supabase Auth, and each user's data is private (row level security)
- **Demo mode:** if Supabase isn't configured, accounts and data live in browser `localStorage` (separate per account) with preset sample data, so it works with no backend at all

## Pages

| Page | File | What it does |
|---|---|---|
| Login / Sign up | `login.html` | Email + password sign in and account creation; redirects to the dashboard |
| Dashboard | `index.html` | Income, expenses, net balance, savings rate, spending donut, 6-month bars, budget health, recent transactions |
| Transactions | `transactions.html` | Add, edit and delete; search and filter by type, category and month; CSV export |
| Budgets | `budgets.html` | Monthly limit per expense category with progress bars and over-budget warnings |
| Reports | `reports.html` | Month picker, trend line chart, category breakdown vs budget, largest expenses, CSV export |
| Categories | `categories.html` | Create, edit and delete income and expense categories, reset sample data |

## Run it in Antigravity IDE

1. Unzip the project, then in Antigravity use **File → Open Folder** and choose the `budgetwise` folder.
2. Open the integrated terminal and start a static server (pick one):
   ```bash
   python3 -m http.server 5500
   # or
   npx serve .
   ```
3. Open `http://localhost:5500`. The app works immediately in demo mode.

## Connect Supabase (real backend + database)

1. Create a free project at <https://supabase.com>.
2. In the dashboard open **SQL Editor → New query**, paste the contents of `supabase/schema.sql` and click **Run**. This creates the `categories`, `transactions` and `budgets` tables with a `user_id` column and per-user security policies.
   - **Already ran an older version of the schema (the one without logins)?** Run `supabase/auth-migration.sql` instead. It adds the `user_id` columns and per-user policies, and deletes the old shared sample rows (each user gets fresh sample data on first login).
3. Go to **Project Settings → API** and copy the **Project URL** and the **anon public** key.
4. Paste them into `js/config.js`:
   ```js
   window.BW_CONFIG = {
     SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
     SUPABASE_ANON_KEY: 'YOUR-ANON-KEY'
   };
   ```
5. In Supabase go to **Authentication → Providers → Email**. For a quick demo turn **off** "Confirm email" so new accounts can sign in immediately. If you leave it on, new users must click the link in their confirmation email before signing in. That link sends them to your project's **Site URL**, so under **Authentication → URL Configuration** set it to `http://localhost:5500` (the default `localhost:3000` will show an error page).
6. Reload the app, click **Create account** on the login page and sign up. The sidebar badge shows "Supabase connected" and your new account is filled with the preset sample data. Check **Authentication → Users** and **Table Editor** in Supabase to see the account and its rows.

If Supabase can't be reached (wrong key, offline), the app shows a message and falls back to local storage instead of breaking.

## Database design

```
auth.users (managed by Supabase Auth)
   └─< categories (id, user_id, name, type, color)           unique per user (name, type)
          ├─< transactions (id, user_id, type, amount, category_id, description, date)   category deleted -> category_id = NULL
          └─1 budgets      (id, user_id, category_id UNIQUE, monthly_limit)             category deleted -> budget deleted

Row level security: every policy is "user_id = auth.uid()", so a signed-in user can only read and change their own rows.
```

## Project structure

```
budgetwise/
├── login.html · index.html · transactions.html · budgets.html · reports.html · categories.html
├── css/style.css            # design tokens, layout, light/dark theme, responsive
├── js/
│   ├── config.js            # Supabase URL + anon key
│   ├── data.js              # data layer: Supabase or localStorage, plus sample-data generator
│   ├── auth.js              # sign up / sign in / sign out (Supabase Auth, or local demo accounts)
│   ├── login.js             # login page behaviour
│   ├── app.js               # shared helpers, navigation, modal, CSV download
│   ├── charts.js            # dependency-free SVG donut, bar and line charts
│   └── dashboard.js · transactions.js · budgets.js · reports.js · categories.js
└── supabase/
    ├── schema.sql           # fresh install: tables, indexes, per-user row level security
    └── auth-migration.sql   # upgrade an older no-login database to the per-user version
```

## Notes for your report / viva

- **Security:** with Supabase, passwords are handled by Supabase Auth (never stored by this app) and row level security keeps each user's data private. The anon key in `config.js` is meant to be public; never use the `service_role` key. In demo mode (no Supabase) accounts are stored in the browser with a hashed password, which is fine to demonstrate the login flow but is not real security because anyone with access to the browser can read its storage.
- **Data layer abstraction:** every page calls `DB.load/add/update/remove`; only `data.js` knows whether the data is in Supabase or localStorage.
- **Currency** is Indian Rupees (₹). Change `BW.fmt` in `js/app.js` to use another currency.
- **Sample data** is generated relative to today's date, so the dashboard always shows recent months. "Reset sample data" on the Categories page restores it.
