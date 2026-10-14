(async function () {
  'use strict';
  try {
    await BW.ready();
    let data = await DB.load();
    const sel = document.getElementById('month');
    BW.fillMonthSelect(sel, data.transactions, BW.currentMonth());
    sel.addEventListener('change', render);
    render();

    function render() {
      const month = sel.value;
      const expCats = data.categories.filter(c => c.type === 'expense');
      const spent = BW.spentByCategory(data.transactions, month);
      const limitOf = Object.fromEntries(data.budgets.map(b => [b.category_id, b.monthly_limit]));

      const totalBudget = expCats.reduce((s, c) => s + (limitOf[c.id] || 0), 0);
      const budgetedSpent = expCats.reduce((s, c) => s + (limitOf[c.id] ? (spent[c.id] || 0) : 0), 0);
      const unbudgeted = Object.keys(spent).reduce((s, id) => s + (limitOf[id] ? 0 : spent[id]), 0);
      const left = totalBudget - budgetedSpent;

      document.getElementById('kpis').innerHTML =
        `<div class="kpi"><span class="kpi-label">Total budget</span><strong class="kpi-value">${BW.fmt(totalBudget)}</strong><span class="kpi-note">${data.budgets.length} categories budgeted</span></div>` +
        `<div class="kpi"><span class="kpi-label">Spent on budgeted categories</span><strong class="kpi-value expense">${BW.fmt(budgetedSpent)}</strong><span class="kpi-note">${BW.pct(budgetedSpent, totalBudget)}% of budget used</span></div>` +
        `<div class="kpi"><span class="kpi-label">${left >= 0 ? 'Remaining' : 'Over budget by'}</span><strong class="kpi-value ${left >= 0 ? 'income' : 'expense'}">${BW.fmt(Math.abs(left))}</strong>` +
        `<span class="kpi-note">${unbudgeted > 0 ? BW.fmt(unbudgeted) + ' spent outside budgets' : 'Everything is covered by a budget'}</span></div>`;

      const rows = expCats.map(c => {
        const limit = limitOf[c.id] || 0;
        const s = spent[c.id] || 0;
        const pct = BW.pct(s, limit);
        return `<tr><td>${BW.chip(c)}</td>` +
          `<td class="num"><input class="input budget-input" type="number" min="0" step="100" inputmode="numeric" data-cat="${c.id}" value="${limit || ''}" placeholder="No limit" aria-label="Monthly limit for ${BW.esc(c.name)}"></td>` +
          `<td class="num">${BW.fmt(s)}</td>` +
          `<td class="num ${limit && limit - s < 0 ? 'expense' : ''}">${limit ? (limit - s < 0 ? '−' : '') + BW.fmt(Math.abs(limit - s)) : '—'}</td>` +
          `<td style="min-width:150px">${limit
            ? `<div class="bar ${BW.progressClass(pct)}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(pct, 100)}"><i style="width:${Math.min(pct, 100)}%"></i></div><small class="kpi-note">${pct}% used</small>`
            : '<small class="kpi-note">No budget set</small>'}</td></tr>`;
      }).join('');

      document.getElementById('tableWrap').innerHTML = expCats.length
        ? '<table><thead><tr><th>Category</th><th class="num">Monthly limit (₹)</th><th class="num">Spent</th><th class="num">Remaining</th><th>Progress</th></tr></thead><tbody>' + rows + '</tbody></table>'
        : '<p class="empty">No expense categories yet. <a href="categories.html">Create one</a> first.</p>';

      document.querySelectorAll('.budget-input').forEach(inp => {
        inp.addEventListener('change', async () => {
          const val = inp.value === '' ? 0 : parseFloat(inp.value);
          if (isNaN(val) || val < 0) { BW.toast('Enter a valid amount', 'bad'); render(); return; }
          try {
            await DB.setBudget(inp.dataset.cat, Math.round(val * 100) / 100);
            data = await DB.load();
            render();
            BW.toast(val > 0 ? 'Budget saved' : 'Budget removed');
          } catch (e) { BW.toast(e.message, 'bad'); }
        });
      });
    }
  } catch (e) { BW.fail(e); }
})();
