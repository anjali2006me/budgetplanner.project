(async function () {
  'use strict';
  try {
    await BW.ready();
    const data = await DB.load();
    const $ = id => document.getElementById(id);
    const sel = $('month');
    BW.fillMonthSelect(sel, data.transactions, BW.currentMonth());
    sel.addEventListener('change', render);
    $('exportReport').onclick = exportReport;
    $('exportTx').onclick = exportMonthTx;
    render();

    function model() {
      const month = sel.value;
      const cm = BW.catMap(data.categories);
      const spent = BW.spentByCategory(data.transactions, month);
      const limitOf = Object.fromEntries(data.budgets.map(b => [b.category_id, b.monthly_limit]));
      const totalExp = Object.values(spent).reduce((s, v) => s + v, 0);
      const rows = Object.keys(spent).map(id => ({
        name: id === 'none' ? 'Uncategorized' : (cm[id] ? cm[id].name : 'Unknown'),
        color: id === 'none' || !cm[id] ? '#94a3b8' : cm[id].color,
        spent: spent[id], share: BW.pct(spent[id], totalExp), limit: limitOf[id] || 0
      })).sort((a, b) => b.spent - a.spent);
      return { month, cm, rows, totalExp };
    }

    function render() {
      const { month, cm, rows, totalExp } = model();
      const tx = data.transactions;
      const inc = BW.sum(tx, 'income', month);
      const net = inc - totalExp;
      const days = new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate();
      const isNow = month === BW.currentMonth();
      const elapsed = isNow ? new Date().getDate() : days;

      $('subtitle').textContent = 'Report for ' + BW.monthLabel(month);
      $('kpis').innerHTML =
        `<div class="kpi"><span class="kpi-label">Total income</span><strong class="kpi-value income">${BW.fmt(inc)}</strong>${BW.delta(inc, BW.sum(tx, 'income', BW.shiftMonth(month, -1)), false)}</div>` +
        `<div class="kpi"><span class="kpi-label">Total expenses</span><strong class="kpi-value expense">${BW.fmt(totalExp)}</strong>${BW.delta(totalExp, BW.sum(tx, 'expense', BW.shiftMonth(month, -1)), true)}</div>` +
        `<div class="kpi"><span class="kpi-label">Net savings</span><strong class="kpi-value ${net >= 0 ? 'income' : 'expense'}">${net < 0 ? '−' : ''}${BW.fmt(Math.abs(net))}</strong><span class="kpi-note">${inc > 0 ? Math.round((net / inc) * 100) + '% of income' : 'No income logged'}</span></div>` +
        `<div class="kpi"><span class="kpi-label">Average per day</span><strong class="kpi-value">${BW.fmt(Math.round(totalExp / Math.max(elapsed, 1)))}</strong><span class="kpi-note">over ${elapsed} day${elapsed === 1 ? '' : 's'}</span></div>`;

      const months = [];
      for (let i = 5; i >= 0; i--) months.push(BW.shiftMonth(month, -i));
      Charts.line($('trend'), months.map(BW.shortMonth), [
        { name: 'Income', color: 'var(--income)', values: months.map(m => BW.sum(tx, 'income', m)) },
        { name: 'Expenses', color: 'var(--expense)', values: months.map(m => BW.sum(tx, 'expense', m)) }
      ], { label: 'Income and expenses over six months' });

      Charts.donut($('donut'), rows.map(r => ({ label: r.name, value: r.spent, color: r.color })), BW.fmt(totalExp), 'total spent');

      $('breakdown').innerHTML = rows.length
        ? '<table><thead><tr><th>Category</th><th class="num">Spent</th><th class="num">Share</th><th class="num">Budget</th><th class="num">Status</th></tr></thead><tbody>' +
          rows.map(r => {
            const status = r.limit ? (r.spent > r.limit ? `<span class="expense">Over by ${BW.fmt(r.spent - r.limit)}</span>` : `<span class="income">${BW.fmt(r.limit - r.spent)} left</span>`) : '<span class="kpi-note">No budget</span>';
            return `<tr><td><span class="chip"><i style="background:${BW.esc(r.color)}"></i>${BW.esc(r.name)}</span></td><td class="num">${BW.fmt(r.spent)}</td><td class="num">${r.share}%</td><td class="num">${r.limit ? BW.fmt(r.limit) : '—'}</td><td class="num">${status}</td></tr>`;
          }).join('') + '</tbody></table>'
        : '<p class="empty">No expenses in this month.</p>';

      const top = tx.filter(t => t.type === 'expense' && t.date.startsWith(month)).sort((a, b) => b.amount - a.amount).slice(0, 5);
      $('top').innerHTML = top.length
        ? '<table><tbody>' + top.map(t =>
            `<tr><td>${BW.esc(BW.dateLabel(t.date))}</td><td class="desc">${BW.esc(t.description || '—')}<br>${BW.chip(cm[t.category_id])}</td><td class="num expense">${BW.fmt(t.amount)}</td></tr>`).join('') + '</tbody></table>'
        : '<p class="empty">No expenses in this month.</p>';
    }

    function exportReport() {
      const { month, rows, totalExp } = model();
      const inc = BW.sum(data.transactions, 'income', month);
      const out = [
        ['BudgetWise monthly report', BW.monthLabel(month)], [],
        ['Total income', inc.toFixed(2)], ['Total expenses', totalExp.toFixed(2)], ['Net savings', (inc - totalExp).toFixed(2)], [],
        ['Category', 'Spent', 'Share %', 'Budget', 'Remaining']
      ].concat(rows.map(r => [r.name, r.spent.toFixed(2), r.share, r.limit ? r.limit.toFixed(2) : '', r.limit ? (r.limit - r.spent).toFixed(2) : '']));
      BW.download('budgetwise-report-' + month + '.csv', out);
      BW.toast('Report exported');
    }

    function exportMonthTx() {
      const month = sel.value;
      const cm = BW.catMap(data.categories);
      const rows = data.transactions.filter(t => t.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
      if (!rows.length) { BW.toast('No transactions in this month'); return; }
      BW.download('budgetwise-transactions-' + month + '.csv',
        [['Date', 'Type', 'Category', 'Description', 'Amount (INR)']].concat(
          rows.map(t => [t.date, t.type, cm[t.category_id] ? cm[t.category_id].name : 'Uncategorized', t.description, t.amount.toFixed(2)])));
      BW.toast('Exported ' + rows.length + ' transactions');
    }
  } catch (e) { BW.fail(e); }
})();
