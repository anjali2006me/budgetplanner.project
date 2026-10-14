(async function () {
  'use strict';
  try {
    await BW.ready();
    const sel = document.getElementById('month');
    let data = await DB.load();
    BW.fillMonthSelect(sel, data.transactions, BW.currentMonth());
    sel.addEventListener('change', render);
    render();

    function render() {
      const { categories, transactions, budgets } = data;
      const cm = BW.catMap(categories);
      const month = sel.value;
      const prev = BW.shiftMonth(month, -1);

      const inc = BW.sum(transactions, 'income', month);
      const exp = BW.sum(transactions, 'expense', month);
      const pInc = BW.sum(transactions, 'income', prev);
      const pExp = BW.sum(transactions, 'expense', prev);
      const net = inc - exp;
      const rate = inc > 0 ? Math.round((net / inc) * 100) : 0;

      document.getElementById('subtitle').textContent = 'Summary for ' + BW.monthLabel(month);

      document.getElementById('kpis').innerHTML =
        `<div class="kpi"><span class="kpi-label">Income</span><strong class="kpi-value income">${BW.fmt(inc)}</strong>${BW.delta(inc, pInc, false)}</div>` +
        `<div class="kpi"><span class="kpi-label">Expenses</span><strong class="kpi-value expense">${BW.fmt(exp)}</strong>${BW.delta(exp, pExp, true)}</div>` +
        `<div class="kpi"><span class="kpi-label">Net balance</span><strong class="kpi-value ${net >= 0 ? 'income' : 'expense'}">${net < 0 ? '−' : ''}${BW.fmt(Math.abs(net))}</strong><span class="kpi-note">${net >= 0 ? 'Saved this month' : 'Overspent this month'}</span></div>` +
        `<div class="kpi"><span class="kpi-label">Savings rate</span><strong class="kpi-value">${rate}%</strong><span class="kpi-note">of income kept</span></div>`;

      // donut: expense by category
      const spent = BW.spentByCategory(transactions, month);
      const items = Object.keys(spent).map(id => ({
        label: id === 'none' ? 'Uncategorized' : (cm[id] ? cm[id].name : 'Unknown'),
        value: spent[id],
        color: id === 'none' || !cm[id] ? '#94a3b8' : cm[id].color
      })).sort((a, b) => b.value - a.value);
      Charts.donut(document.getElementById('donut'), items, BW.fmt(exp), 'spent');

      // 6-month bars ending at the selected month
      const months = [];
      for (let i = 5; i >= 0; i--) months.push(BW.shiftMonth(month, -i));
      Charts.bars(document.getElementById('bars'), months.map(BW.shortMonth), [
        { name: 'Income', color: 'var(--income)', values: months.map(m => BW.sum(transactions, 'income', m)) },
        { name: 'Expenses', color: 'var(--expense)', values: months.map(m => BW.sum(transactions, 'expense', m)) }
      ], { label: 'Income versus expenses for the last six months' });

      // budget health
      const health = budgets.map(b => {
        const c = cm[b.category_id];
        const s = spent[b.category_id] || 0;
        return { c, s, limit: b.monthly_limit, pct: BW.pct(s, b.monthly_limit) };
      }).filter(h => h.c).sort((a, b) => b.pct - a.pct).slice(0, 6);

      document.getElementById('budgetHealth').innerHTML = health.length
        ? health.map(h =>
            `<div class="bar-row"><div class="bar-top"><span>${BW.chip(h.c)}</span>` +
            `<span>${BW.fmt(h.s)} / ${BW.fmt(h.limit)} · ${h.pct}%</span></div>` +
            `<div class="bar ${BW.progressClass(h.pct)}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(h.pct, 100)}"><i style="width:${Math.min(h.pct, 100)}%"></i></div></div>`).join('')
        : '<p class="empty">No budgets yet. <a href="budgets.html">Set your first budget</a>.</p>';

      // recent transactions
      const recent = transactions.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 6);
      document.getElementById('recent').innerHTML = recent.length
        ? '<table><tbody>' + recent.map(t =>
            `<tr><td>${BW.esc(BW.dateLabel(t.date))}</td><td class="desc">${BW.esc(t.description || '—')}<br>${BW.chip(cm[t.category_id])}</td>` +
            `<td class="num ${t.type}">${t.type === 'income' ? '+' : '−'}${BW.fmt(t.amount)}</td></tr>`).join('') + '</tbody></table>'
        : '<p class="empty">No transactions yet.</p>';
    }
  } catch (e) { BW.fail(e); }
})();
