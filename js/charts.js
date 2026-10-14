// Tiny dependency-free SVG charts: donut, grouped bars, lines.
(function () {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => (window.BW ? BW.fmt(n) : '₹' + Math.round(n));

  const short = n => {
    const v = Math.abs(n);
    if (v >= 100000) return (n / 100000).toFixed(v % 100000 === 0 ? 0 : 1) + 'L';
    if (v >= 1000) return (n / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k';
    return String(Math.round(n));
  };

  function niceMax(v) {
    if (v <= 0) return 1000;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / p;
    const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return n * p;
  }

  function legend(series) {
    return '<div class="legend">' + series.map(s =>
      `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('') + '</div>';
  }

  function frame(W, H, L, R, T, B, max, aria) {
    const ih = H - T - B;
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">`;
    for (let i = 0; i <= 4; i++) {
      const y = T + ih - (ih * i) / 4;
      s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/>` +
           `<text class="axis" x="${L - 8}" y="${y + 4}" text-anchor="end">${short((max * i) / 4)}</text>`;
    }
    return s;
  }

  const Charts = {
    donut(el, items, centerTop, centerBottom) {
      const total = items.reduce((s, i) => s + i.value, 0);
      if (!total) { el.innerHTML = '<p class="empty">No expenses recorded for this month.</p>'; return; }
      const r = 70, C = 2 * Math.PI * r;
      let off = 0;
      const segs = items.map(i => {
        const len = (C * i.value) / total;
        const seg = `<circle cx="100" cy="100" r="${r}" fill="none" stroke-width="26" style="stroke:${i.color}" ` +
          `stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 100 100)">` +
          `<title>${esc(i.label)}: ${money(i.value)} (${Math.round((i.value / total) * 100)}%)</title></circle>`;
        off += len;
        return seg;
      }).join('');
      const list = items.slice(0, 7).map(i =>
        `<li><i style="background:${i.color}"></i><span>${esc(i.label)}</span>` +
        `<b>${Math.round((i.value / total) * 100)}%</b></li>`).join('');
      el.innerHTML =
        `<div class="donut-wrap"><svg class="donut" viewBox="0 0 200 200" role="img" aria-label="Spending by category">` +
        `<circle cx="100" cy="100" r="${r}" fill="none" stroke-width="26" class="donut-track"/>${segs}` +
        `<text x="100" y="98" text-anchor="middle" class="donut-top">${esc(centerTop)}</text>` +
        `<text x="100" y="118" text-anchor="middle" class="donut-bottom">${esc(centerBottom)}</text></svg>` +
        `<ul class="donut-legend">${list}</ul></div>`;
    },

    bars(el, labels, series, opts) {
      opts = opts || {};
      const W = 600, H = 250, L = 44, R = 8, T = 12, B = 28;
      const iw = W - L - R, ih = H - T - B;
      const max = niceMax(Math.max.apply(null, series.reduce((a, s) => a.concat(s.values), [0])));
      const gw = iw / labels.length;
      const bw = Math.min(26, gw / (series.length + 0.8));
      let svg = frame(W, H, L, R, T, B, max, opts.label || 'Bar chart');
      labels.forEach((lb, i) => {
        const cx = L + gw * i + gw / 2;
        series.forEach((s, j) => {
          const h = (ih * s.values[i]) / max;
          const x = cx + (j - (series.length - 1) / 2) * (bw + 3) - bw / 2;
          svg += `<rect x="${x}" y="${T + ih - h}" width="${bw}" height="${Math.max(h, 0)}" rx="3" style="fill:${s.color}">` +
                 `<title>${esc(s.name)} · ${esc(lb)}: ${money(s.values[i])}</title></rect>`;
        });
        svg += `<text class="axis" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(lb)}</text>`;
      });
      el.innerHTML = svg + '</svg>' + legend(series);
    },

    line(el, labels, series, opts) {
      opts = opts || {};
      const W = 600, H = 250, L = 44, R = 12, T = 12, B = 28;
      const iw = W - L - R, ih = H - T - B;
      const max = niceMax(Math.max.apply(null, series.reduce((a, s) => a.concat(s.values), [0])));
      const gw = iw / labels.length;
      const px = i => L + gw * i + gw / 2;
      const py = v => T + ih - (ih * v) / max;
      let svg = frame(W, H, L, R, T, B, max, opts.label || 'Line chart');
      labels.forEach((lb, i) => { svg += `<text class="axis" x="${px(i)}" y="${H - 8}" text-anchor="middle">${esc(lb)}</text>`; });
      series.forEach(s => {
        const pts = s.values.map((v, i) => px(i) + ',' + py(v)).join(' ');
        svg += `<polyline points="${pts}" fill="none" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" style="stroke:${s.color}"/>`;
        s.values.forEach((v, i) => {
          svg += `<circle cx="${px(i)}" cy="${py(v)}" r="4" style="fill:${s.color}">` +
                 `<title>${esc(s.name)} · ${esc(labels[i])}: ${money(v)}</title></circle>`;
        });
      });
      el.innerHTML = svg + '</svg>' + legend(series);
    }
  };

  window.Charts = Charts;
})();
