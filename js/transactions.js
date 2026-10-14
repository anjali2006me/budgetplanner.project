(async function () {
  'use strict';
  try {
    await BW.ready();
    let data = await DB.load();
    const $ = id => document.getElementById(id);
    const q = $('q'), fType = $('fType'), fCat = $('fCat'), fMonth = $('fMonth');

    BW.fillMonthSelect(fMonth, data.transactions, 'all', 'All months');
    fillCatFilter();
    [q, fType, fCat, fMonth].forEach(el => el.addEventListener('input', render));
    $('clearBtn').onclick = () => { q.value = ''; fType.value = 'all'; fCat.value = 'all'; fMonth.value = 'all'; render(); };
    $('addBtn').onclick = () => openForm();
    $('exportBtn').onclick = exportCsv;
    render();
    if (new URLSearchParams(location.search).get('add')) openForm();

    function fillCatFilter() {
      fCat.innerHTML = '<option value="all">All categories</option><option value="none">Uncategorized</option>' +
        data.categories.map(c => `<option value="${c.id}">${BW.esc(c.name)} (${c.type})</option>`).join('');
    }

    function filtered() {
      const text = q.value.trim().toLowerCase();
      const cm = BW.catMap(data.categories);
      return data.transactions.filter(t => {
        if (fType.value !== 'all' && t.type !== fType.value) return false;
        if (fMonth.value !== 'all' && !t.date.startsWith(fMonth.value)) return false;
        if (fCat.value === 'none' && t.category_id) return false;
        if (fCat.value !== 'all' && fCat.value !== 'none' && t.category_id !== fCat.value) return false;
        if (text) {
          const hay = (t.description + ' ' + (cm[t.category_id] ? cm[t.category_id].name : '')).toLowerCase();
          if (!hay.includes(text)) return false;
        }
        return true;
      }).sort((a, b) => b.date.localeCompare(a.date) || (b.created_at || '').localeCompare(a.created_at || ''));
    }

    function render() {
      const rows = filtered();
      const cm = BW.catMap(data.categories);
      const inc = rows.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const exp = rows.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      $('summary').innerHTML =
        `<span><b>${rows.length}</b> transaction${rows.length === 1 ? '' : 's'}</span>` +
        `<span>Income <b class="income">${BW.fmt(inc)}</b></span>` +
        `<span>Expenses <b class="expense">${BW.fmt(exp)}</b></span>` +
        `<span>Net <b>${inc - exp < 0 ? '−' : ''}${BW.fmt(Math.abs(inc - exp))}</b></span>`;

      $('tableWrap').innerHTML = rows.length
        ? '<table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th><th></th></tr></thead><tbody>' +
          rows.map(t =>
            `<tr><td>${BW.esc(BW.dateLabel(t.date))}</td><td class="desc">${BW.esc(t.description || '—')}</td>` +
            `<td>${BW.chip(cm[t.category_id])}</td>` +
            `<td class="num ${t.type}">${t.type === 'income' ? '+' : '−'}${BW.fmt(t.amount)}</td>` +
            `<td><div class="row-actions"><button class="btn small" data-edit="${t.id}">Edit</button>` +
            `<button class="btn small danger" data-del="${t.id}">Delete</button></div></td></tr>`).join('') +
          '</tbody></table>'
        : '<p class="empty">No transactions match these filters.</p>';

      $('tableWrap').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openForm(data.transactions.find(t => t.id === b.dataset.edit)));
      $('tableWrap').querySelectorAll('[data-del]').forEach(b => b.onclick = () => del(b.dataset.del));
    }

    async function refresh(msg) {
      data = await DB.load();
      const keep = fMonth.value;
      BW.fillMonthSelect(fMonth, data.transactions, 'all', 'All months');
      fMonth.value = [...fMonth.options].some(o => o.value === keep) ? keep : 'all';
      fillCatFilter();
      render();
      if (msg) BW.toast(msg);
    }

    async function del(id) {
      if (!confirm('Delete this transaction?')) return;
      try { await DB.remove('transactions', id); await refresh('Transaction deleted'); } catch (e) { BW.toast(e.message, 'bad'); }
    }

    function openForm(tx) {
      const editing = !!tx;
      const cur = tx || { type: 'expense', amount: '', category_id: '', description: '', date: BW.today() };
      const body =
        `<div class="seg" role="radiogroup" aria-label="Type">` +
        `<label><input type="radio" name="type" value="expense"><span>Expense</span></label>` +
        `<label><input type="radio" name="type" value="income"><span>Income</span></label></div>` +
        `<label>Amount (₹)<input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required></label>` +
        `<label>Category<select name="category_id"></select></label>` +
        `<label>Date<input name="date" type="date" required></label>` +
        `<label>Description<input name="description" maxlength="80" placeholder="e.g. Weekly groceries"></label>`;

      const { form } = BW.modal(editing ? 'Edit transaction' : 'Add transaction', body, async fd => {
        const amount = parseFloat(fd.get('amount'));
        if (!(amount > 0)) throw new Error('Enter an amount greater than 0.');
        if (!fd.get('date')) throw new Error('Pick a date.');
        if (!fd.get('category_id')) throw new Error('Choose a category (add one on the Categories page if the list is empty).');
        const row = {
          type: fd.get('type'), amount: Math.round(amount * 100) / 100,
          category_id: fd.get('category_id'), description: String(fd.get('description') || '').trim(), date: fd.get('date')
        };
        if (editing) await DB.update('transactions', tx.id, row); else await DB.add('transactions', row);
        await refresh(editing ? 'Transaction updated' : 'Transaction added');
      });

      const catSel = form.elements.category_id;
      const fillCats = keep => {
        const type = form.elements.type.value;
        const list = data.categories.filter(c => c.type === type);
        catSel.innerHTML = list.length
          ? list.map(c => `<option value="${c.id}">${BW.esc(c.name)}</option>`).join('')
          : '<option value="">No ' + type + ' categories</option>';
        if (keep && list.some(c => c.id === keep)) catSel.value = keep;
      };
      form.querySelectorAll('input[name=type]').forEach(r => { r.checked = r.value === cur.type; r.addEventListener('change', () => fillCats()); });
      form.elements.amount.value = cur.amount;
      form.elements.date.value = cur.date;
      form.elements.description.value = cur.description;
      fillCats(cur.category_id);
    }

    function exportCsv() {
      const rows = filtered();
      if (!rows.length) { BW.toast('Nothing to export for these filters'); return; }
      const cm = BW.catMap(data.categories);
      BW.download('budgetwise-transactions-' + BW.today() + '.csv',
        [['Date', 'Type', 'Category', 'Description', 'Amount (INR)']].concat(
          rows.map(t => [t.date, t.type, cm[t.category_id] ? cm[t.category_id].name : 'Uncategorized', t.description, t.amount.toFixed(2)])));
      BW.toast('Exported ' + rows.length + ' transactions');
    }
  } catch (e) { BW.fail(e); }
})();
