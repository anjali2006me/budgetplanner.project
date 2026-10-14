// Data layer: Supabase (Postgres) when configured, otherwise browser localStorage.
// Every page talks only to window.DB, so the UI code is identical in both modes.
(function () {
  'use strict';

  const LS_KEY = 'budgetwise.v1';
  const NIL_UUID = '00000000-0000-0000-0000-000000000000';
  const cfg = window.BW_CONFIG || {};
  let sb = null;
  let lsKey = null;          // per-user localStorage key (demo mode), set by DB.setUser
  let mode = 'local';
  let initError = null;
  let initPromise = null;

  // ───────── helpers ─────────
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const uid = () =>
    window.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  async function chk(promise) {
    const res = await promise;
    if (res.error) throw new Error(res.error.message || 'Database error');
    return res.data;
  }

  const nTx = t => ({ ...t, amount: Number(t.amount) });
  const nBud = b => ({ ...b, monthly_limit: Number(b.monthly_limit) });

  // ───────── sample data (preset, generated relative to today) ─────────
  function buildSeed() {
    const r = rng(42);
    const rand = (a, b) => Math.round((a + r() * (b - a)) / 10) * 10;
    const pick = arr => arr[Math.floor(r() * arr.length)];

    const cats = [
      { key: 'salary',    name: 'Salary',        type: 'income',  color: '#2f9e6b' },
      { key: 'freelance', name: 'Freelance',     type: 'income',  color: '#5aa9a1' },
      { key: 'interest',  name: 'Interest',      type: 'income',  color: '#8fbf5a' },
      { key: 'rent',      name: 'Rent',          type: 'expense', color: '#3b6ea8' },
      { key: 'groceries', name: 'Groceries',     type: 'expense', color: '#d98b2b' },
      { key: 'dining',    name: 'Dining Out',    type: 'expense', color: '#d6563f' },
      { key: 'transport', name: 'Transport',     type: 'expense', color: '#7a5bb5' },
      { key: 'utilities', name: 'Utilities',     type: 'expense', color: '#2a9bb5' },
      { key: 'fun',       name: 'Entertainment', type: 'expense', color: '#c7478a' },
      { key: 'shopping',  name: 'Shopping',      type: 'expense', color: '#a8883a' },
      { key: 'health',    name: 'Health',        type: 'expense', color: '#4f9d5d' },
      { key: 'education', name: 'Education',     type: 'expense', color: '#5b6fb5' }
    ];

    const budgets = [
      { key: 'rent', limit: 18000 }, { key: 'groceries', limit: 9000 },
      { key: 'dining', limit: 4000 }, { key: 'transport', limit: 3000 },
      { key: 'utilities', limit: 3500 }, { key: 'fun', limit: 2500 },
      { key: 'shopping', limit: 5000 }, { key: 'health', limit: 2000 },
      { key: 'education', limit: 3000 }
    ];

    const tx = [];
    const today = new Date();
    for (let m = 0; m < 6; m++) {
      const base = new Date(today.getFullYear(), today.getMonth() - m, 1);
      const dim = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
      const add = (day, key, type, amount, description) => {
        const d = new Date(base.getFullYear(), base.getMonth(), Math.min(day, dim));
        if (d > today) return;
        tx.push({ catKey: key, type, amount, description, date: ymd(d) });
      };

      add(1, 'salary', 'income', 75000, 'Monthly salary');
      if (m !== 2) add(15, 'freelance', 'income', rand(8000, 18000), pick(['Website project', 'Logo design', 'Content writing']));
      if (m % 3 === 0) add(28, 'interest', 'income', rand(600, 1400), 'Savings account interest');

      add(3, 'rent', 'expense', 18000, 'House rent');
      add(7, 'utilities', 'expense', rand(2200, 3300), pick(['Electricity + broadband', 'Electricity bill', 'Water + internet']));
      for (let i = 0; i < 6; i++) add(2 + i * 5, 'groceries', 'expense', rand(600, 2000), pick(['Local market', 'Supermarket', 'Vegetables & fruits', 'Milk & essentials']));
      for (let i = 0; i < 4; i++) add(5 + i * 7, 'dining', 'expense', rand(300, 1400), pick(['Dinner with friends', 'Biryani night', 'Coffee shop', 'Weekend brunch']));
      for (let i = 0; i < 5; i++) add(4 + i * 6, 'transport', 'expense', rand(100, 650), pick(['Auto fare', 'Metro recharge', 'Fuel', 'Cab ride']));
      for (let i = 0; i < 2; i++) add(10 + i * 11, 'fun', 'expense', rand(400, 1300), pick(['Movie tickets', 'Streaming subscription', 'Concert']));
      for (let i = 0; i < 2; i++) add(12 + i * 9, 'shopping', 'expense', rand(800, 3800), pick(['Clothes', 'Headphones', 'Home decor', 'Shoes']));
      if (m % 2 === 0) add(18, 'health', 'expense', rand(500, 1900), pick(['Pharmacy', 'Doctor consultation', 'Lab tests']));
      if (m === 0 || m === 3) add(9, 'education', 'expense', 3000, 'Online course fee');
    }
    return { cats, budgets, tx };
  }

  // ───────── localStorage backend ─────────
  const read = () => {
    if (!lsKey) throw new Error('Not signed in.');
    return JSON.parse(localStorage.getItem(lsKey));
  };
  const write = d => localStorage.setItem(lsKey, JSON.stringify(d));

  function seedLocal() {
    const s = buildSeed();
    const idOf = {};
    const categories = s.cats.map(c => {
      const id = uid(); idOf[c.key] = id;
      return { id, name: c.name, type: c.type, color: c.color, created_at: new Date().toISOString() };
    });
    const budgets = s.budgets.map(b => ({ id: uid(), category_id: idOf[b.key], monthly_limit: b.limit }));
    const transactions = s.tx.map(t => ({
      id: uid(), type: t.type, amount: t.amount, category_id: idOf[t.catKey],
      description: t.description, date: t.date, created_at: new Date().toISOString()
    }));
    write({ categories, budgets, transactions });
  }

  // ───────── Supabase backend ─────────
  async function seedRemote() {
    const s = buildSeed();
    const cats = await chk(
      sb.from('categories').insert(s.cats.map(c => ({ name: c.name, type: c.type, color: c.color }))).select()
    );
    const idOf = {};
    s.cats.forEach(c => { idOf[c.key] = cats.find(x => x.name === c.name && x.type === c.type).id; });
    await chk(sb.from('budgets').insert(s.budgets.map(b => ({ category_id: idOf[b.key], monthly_limit: b.limit }))));
    await chk(sb.from('transactions').insert(s.tx.map(t => ({
      type: t.type, amount: t.amount, category_id: idOf[t.catKey], description: t.description, date: t.date
    }))));
  }

  // ───────── public API ─────────
  const DB = {
    mode: () => mode,
    initError: () => initError,
    client: () => sb,

    init() {
      if (initPromise) return initPromise;
      initPromise = (async () => {
        if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
          if (!window.supabase) {
            initError = 'Supabase library could not be loaded (offline?). Using local storage instead.';
          } else {
            try {
              sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
              await chk(sb.from('categories').select('id').limit(1));   // fails if the tables do not exist
              mode = 'supabase';
              return mode;
            } catch (e) {
              console.warn('[BudgetWise] Supabase unavailable, falling back to localStorage:', e);
              initError = 'Supabase error: ' + e.message + '. Using local storage instead.';
              sb = null;
            }
          }
        }
        mode = 'local';
        return mode;
      })();
      return initPromise;
    },

    // Call once after sign-in: points the data layer at this user's data and seeds sample data for new users.
    async setUser(user) {
      if (sb) {
        const rows = await chk(sb.from('categories').select('id').limit(1));
        if (!rows.length) await seedRemote();
      } else {
        lsKey = LS_KEY + '.' + user.id;
        if (!localStorage.getItem(lsKey)) seedLocal();
      }
    },

    async load() {
      if (sb) {
        const [categories, transactions, budgets] = await Promise.all([
          chk(sb.from('categories').select('*').order('name')),
          chk(sb.from('transactions').select('*').order('date', { ascending: false })),
          chk(sb.from('budgets').select('*'))
        ]);
        return { categories, transactions: transactions.map(nTx), budgets: budgets.map(nBud) };
      }
      const d = read();
      return {
        categories: d.categories.slice().sort((a, b) => a.name.localeCompare(b.name)),
        transactions: d.transactions.map(nTx),
        budgets: d.budgets.map(nBud)
      };
    },

    async add(table, row) {
      if (sb) return chk(sb.from(table).insert(row).select().single());
      const d = read();
      const rec = { id: uid(), created_at: new Date().toISOString(), ...row };
      if (table === 'categories' && d.categories.some(c => c.name.toLowerCase() === row.name.toLowerCase() && c.type === row.type)) {
        throw new Error('A ' + row.type + ' category with that name already exists.');
      }
      d[table].push(rec);
      write(d);
      return rec;
    },

    async update(table, id, patch) {
      if (sb) return chk(sb.from(table).update(patch).eq('id', id).select().single());
      const d = read();
      const i = d[table].findIndex(r => r.id === id);
      if (i < 0) throw new Error('Record not found.');
      d[table][i] = { ...d[table][i], ...patch };
      write(d);
      return d[table][i];
    },

    async remove(table, id) {
      if (sb) { await chk(sb.from(table).delete().eq('id', id)); return; }
      const d = read();
      d[table] = d[table].filter(r => r.id !== id);
      if (table === 'categories') {            // mimic the foreign-key rules from schema.sql
        d.budgets = d.budgets.filter(b => b.category_id !== id);
        d.transactions.forEach(t => { if (t.category_id === id) t.category_id = null; });
      }
      write(d);
    },

    // create, update or (limit <= 0) delete the monthly budget for a category
    async setBudget(categoryId, limit) {
      const { budgets } = await DB.load();
      const existing = budgets.find(b => b.category_id === categoryId);
      if (!(limit > 0)) { if (existing) await DB.remove('budgets', existing.id); return; }
      if (existing) await DB.update('budgets', existing.id, { monthly_limit: limit });
      else await DB.add('budgets', { category_id: categoryId, monthly_limit: limit });
    },

    // wipe everything and restore the preset sample data
    async reset() {
      if (sb) {
        for (const t of ['transactions', 'budgets', 'categories']) {
          await chk(sb.from(t).delete().neq('id', NIL_UUID));
        }
        await seedRemote();
      } else {
        seedLocal();
      }
    }
  };

  window.DB = DB;
})();
