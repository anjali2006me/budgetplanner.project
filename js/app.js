// Shared helpers + navigation shell used by every page.
(function () {
  'use strict';

  const BW = (window.BW = {});
  const pad = n => String(n).padStart(2, '0');

  BW.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  BW.fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  BW.pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

  BW.today = () => {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };
  BW.currentMonth = () => BW.today().slice(0, 7);

  BW.monthLabel = ym => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
  };
  BW.shortMonth = ym => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'short' });
  };
  BW.shiftMonth = (ym, delta) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  };
  BW.dateLabel = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  // months present in the data (plus the current one), newest first
  BW.monthOptions = tx => {
    const set = new Set(tx.map(t => t.date.slice(0, 7)));
    set.add(BW.currentMonth());
    return Array.from(set).sort().reverse();
  };
  BW.fillMonthSelect = (sel, tx, value, allLabel) => {
    const opts = BW.monthOptions(tx).map(m => `<option value="${m}">${BW.monthLabel(m)}</option>`);
    if (allLabel) opts.unshift(`<option value="all">${allLabel}</option>`);
    sel.innerHTML = opts.join('');
    sel.value = value;
  };

  BW.sum = (tx, type, month) =>
    tx.filter(t => t.type === type && (!month || t.date.startsWith(month))).reduce((s, t) => s + t.amount, 0);

  // { categoryId | 'none': amount } for expenses in a month
  BW.spentByCategory = (tx, month) => {
    const out = {};
    tx.forEach(t => {
      if (t.type !== 'expense' || !t.date.startsWith(month)) return;
      const k = t.category_id || 'none';
      out[k] = (out[k] || 0) + t.amount;
    });
    return out;
  };

  BW.catMap = cats => Object.fromEntries(cats.map(c => [c.id, c]));
  BW.chip = cat =>
    `<span class="chip"><i style="background:${cat ? BW.esc(cat.color) : '#94a3b8'}"></i>${BW.esc(cat ? cat.name : 'Uncategorized')}</span>`;

  BW.delta = (cur, prev, goodWhenDown) => {
    if (!prev) return '<span class="kpi-note">No data for last month</span>';
    const ch = Math.round(((cur - prev) / prev) * 100);
    if (ch === 0) return '<span class="kpi-note">Same as last month</span>';
    const good = goodWhenDown ? ch < 0 : ch > 0;
    return `<span class="kpi-note ${good ? 'good' : 'bad'}">${ch > 0 ? '▲' : '▼'} ${Math.abs(ch)}% vs last month</span>`;
  };

  BW.progressClass = pct => (pct > 100 ? 'over' : pct >= 80 ? 'warn' : 'ok');

  // ───────── CSV ─────────
  BW.csv = rows => rows.map(r => r.map(v => {
    v = String(v == null ? '' : v);
    return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }).join(',')).join('\r\n');

  BW.download = (filename, rows) => {
    const blob = new Blob(['﻿' + BW.csv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ───────── UI bits ─────────
  BW.toast = (msg, kind) => {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  };

  // onSubmit(formData, form) -> may throw Error(message) or return false to keep the dialog open
  BW.modal = (title, bodyHtml, onSubmit, submitLabel) => {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML =
      `<form class="modal" novalidate role="dialog" aria-modal="true" aria-label="${BW.esc(title)}">` +
      `<h2>${BW.esc(title)}</h2><div class="modal-body">${bodyHtml}</div>` +
      `<p class="form-error" hidden></p>` +
      `<div class="modal-actions"><button type="button" class="btn ghost" data-close>Cancel</button>` +
      `<button class="btn primary">${BW.esc(submitLabel || 'Save')}</button></div></form>`;
    document.body.appendChild(ov);
    const form = ov.querySelector('form');
    const err = ov.querySelector('.form-error');
    const onKey = e => { if (e.key === 'Escape') close(); };
    function close() { document.removeEventListener('keydown', onKey); ov.remove(); }
    document.addEventListener('keydown', onKey);
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    ov.querySelector('[data-close]').onclick = close;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      err.hidden = true;
      try {
        const res = await onSubmit(new FormData(form), form);
        if (res !== false) close();
      } catch (ex) {
        err.textContent = ex.message || String(ex);
        err.hidden = false;
      }
    });
    const first = form.querySelector('input:not([type=radio]),select');
    if (first) first.focus();
    return { close, form };
  };

  // ───────── navigation shell ─────────
  const PAGES = [
    ['dashboard', 'index.html', 'Dashboard', 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z'],
    ['transactions', 'transactions.html', 'Transactions', 'M7 7h13v2H7V7zm0 4h13v2H7v-2zm0 4h13v2H7v-2zM3 7h2v2H3V7zm0 4h2v2H3v-2zm0 4h2v2H3v-2z'],
    ['budgets', 'budgets.html', 'Budgets', 'M12 2a10 10 0 1 0 10 10H12V2zm2 .2V10h7.8A10 10 0 0 0 14 2.2z'],
    ['reports', 'reports.html', 'Reports', 'M5 9h3v10H5V9zm5.5-5h3v15h-3V4zM16 13h3v6h-3v-6z'],
    ['categories', 'categories.html', 'Categories', 'M12 2 2 12l10 10 10-10L12 2zm0 4.8L17.2 12 12 17.2 6.8 12 12 6.8z']
  ];

  function buildNav(mode, user) {
    const nav = document.getElementById('nav');
    if (!nav) return;
    const active = document.body.dataset.page;
    const links = PAGES.map(p =>
      `<a href="${p[1]}" class="${p[0] === active ? 'active' : ''}"${p[0] === active ? ' aria-current="page"' : ''}>` +
      `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${p[3]}"/></svg><span>${p[2]}</span></a>`).join('');
    const pill = mode === 'supabase'
      ? '<span class="pill live" title="Data is stored in your Supabase Postgres database">● Supabase connected</span>'
      : '<span class="pill" title="Data is stored in this browser (localStorage)">● Demo · local storage</span>';
    const who = user.name || user.email;
    nav.innerHTML =
      `<div class="brand"><span class="logo">₹</span><span>BudgetWise</span></div>` +
      `<nav aria-label="Main">${links}</nav>` +
      `<div class="nav-foot">` +
      `<div class="user-box"><span class="avatar" aria-hidden="true">${BW.esc(who.charAt(0).toUpperCase())}</span>` +
      `<span class="user-email" title="${BW.esc(user.email)}">${BW.esc(who)}</span></div>` +
      `<button class="btn small ghost" id="signOut">Sign out</button>${pill}</div>`;
    document.getElementById('signOut').onclick = async () => {
      try { await Auth.signOut(); } catch (e) { console.error(e); }
      location.href = 'login.html';
    };
  }

  // Every app page calls this first. Not signed in -> redirect to the login page.
  BW.ready = async () => {
    const mode = await DB.init();
    let user = null;
    try { user = await Auth.current(); } catch (e) { console.error(e); }
    if (!user) {
      location.replace('login.html');
      return new Promise(() => {});          // never resolves, so the page scripts stop here
    }
    await DB.setUser(user);
    buildNav(mode, user);
    if (DB.initError()) BW.toast(DB.initError(), 'bad');
    return mode;
  };

  BW.fail = e => {
    console.error(e);
    const main = document.querySelector('.main');
    if (main) main.insertAdjacentHTML('afterbegin', `<div class="banner bad">Something went wrong: ${BW.esc(e.message || e)}</div>`);
  };
})();
