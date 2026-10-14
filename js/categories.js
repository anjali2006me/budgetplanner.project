(async function () {
  'use strict';
  try {
    const mode = await BW.ready();
    let data = await DB.load();
    const $ = id => document.getElementById(id);

    $('storageInfo').textContent = mode === 'supabase'
      ? 'Your data lives in your Supabase Postgres database (tables: categories, transactions, budgets) and is shared across every browser that uses this project.'
      : 'Demo mode: your data lives in this browser (localStorage), separately for each account, and survives refreshes. To use a real database, add your Supabase URL and anon key to js/config.js.';

    $('addBtn').onclick = () => openForm();
    $('resetBtn').onclick = async () => {
      if (!confirm('Replace ALL categories, transactions and budgets with the original sample data?')) return;
      try { await DB.reset(); data = await DB.load(); render(); BW.toast('Sample data restored'); } catch (e) { BW.toast(e.message, 'bad'); }
    };
    render();

    function render() {
      const usage = {};
      data.transactions.forEach(t => { if (t.category_id) usage[t.category_id] = (usage[t.category_id] || 0) + 1; });
      const list = type => {
        const cats = data.categories.filter(c => c.type === type);
        return cats.length
          ? cats.map(c =>
              `<li>${BW.chip(c)}<span class="count">${usage[c.id] || 0} txn${usage[c.id] === 1 ? '' : 's'}</span>` +
              `<button class="btn small" data-edit="${c.id}">Edit</button>` +
              `<button class="btn small danger" data-del="${c.id}">Delete</button></li>`).join('')
          : `<li class="empty">No ${type} categories yet.</li>`;
      };
      $('expenseList').innerHTML = list('expense');
      $('incomeList').innerHTML = list('income');
      document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openForm(data.categories.find(c => c.id === b.dataset.edit)));
      document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => del(b.dataset.del, usage));
    }

    async function del(id, usage) {
      const c = data.categories.find(x => x.id === id);
      const n = usage[id] || 0;
      const msg = n
        ? `Delete "${c.name}"? Its ${n} transaction(s) will become Uncategorized and its budget will be removed.`
        : `Delete "${c.name}"?`;
      if (!confirm(msg)) return;
      try { await DB.remove('categories', id); data = await DB.load(); render(); BW.toast('Category deleted'); } catch (e) { BW.toast(e.message, 'bad'); }
    }

    function openForm(cat) {
      const editing = !!cat;
      const cur = cat || { name: '', type: 'expense', color: '#0f766e' };
      const body =
        `<label>Name<input name="name" maxlength="40" required placeholder="e.g. Subscriptions"></label>` +
        `<label>Type<select name="type"><option value="expense">Expense</option><option value="income">Income</option></select></label>` +
        `<label>Colour<input name="color" type="color"></label>`;
      const { form } = BW.modal(editing ? 'Edit category' : 'New category', body, async fd => {
        const name = String(fd.get('name') || '').trim();
        if (!name) throw new Error('Give the category a name.');
        const type = fd.get('type');
        if (data.categories.some(c => c.id !== (cat && cat.id) && c.type === type && c.name.toLowerCase() === name.toLowerCase())) {
          throw new Error('A ' + type + ' category called "' + name + '" already exists.');
        }
        const row = { name, type, color: fd.get('color') };
        if (editing) {
          // changing the type would orphan existing transactions of the old type
          if (type !== cat.type && data.transactions.some(t => t.category_id === cat.id)) {
            throw new Error('This category already has transactions, so its type cannot be changed.');
          }
          await DB.update('categories', cat.id, row);
        } else {
          await DB.add('categories', row);
        }
        data = await DB.load(); render();
        BW.toast(editing ? 'Category updated' : 'Category added');
      });
      form.elements.name.value = cur.name;
      form.elements.type.value = cur.type;
      form.elements.color.value = cur.color;
    }
  } catch (e) { BW.fail(e); }
})();
