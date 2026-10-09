/** Dependency-free SVG charts (CSP-safe: attributes only, no inline styles). */
import { html, raw } from '../core/dom.js';
import { fmtNumber } from './ui.js';

const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Smooth path through points using a monotone-ish cubic interpolation. */
function smooth(points) {
  if (points.length < 2) return points.length ? `M${points[0][0]},${points[0][1]}` : '';
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
}

const niceMax = (value) => {
  if (value <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * pow >= value / 4) * pow;
  return Math.ceil(value / step) * step;
};

/**
 * Multi-series area chart. series: [{ key, label, tone }], data: [{ day, [key]: n }].
 * Hover is handled by `bindChartTooltip`.
 */
export function areaChart({ data, series, height = 240 }) {
  const width = 720;
  const pad = { t: 16, r: 12, b: 28, l: 36 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0))));
  const x = (i) => pad.l + (data.length <= 1 ? w / 2 : (i / (data.length - 1)) * w);
  const y = (v) => pad.t + h - (v / max) * h;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));
  const day = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

  const layers = series.map((s, si) => {
    const pts = data.map((d, i) => [x(i), y(Number(d[s.key]) || 0)]);
    const line = smooth(pts);
    const area = `${line} L${x(data.length - 1)},${pad.t + h} L${x(0)},${pad.t + h} Z`;
    return `<defs><linearGradient id="g-${s.key}-${si}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="stop-${s.tone}" stop-opacity=".35"/><stop offset="1" class="stop-${s.tone}" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#g-${s.key}-${si})"/><path d="${line}" class="chart__line chart__line--${s.tone}"/>`;
  }).join('');

  const svg = `<svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${esc(series.map((s) => s.label).join(', '))}">
    ${ticks.map((t) => `<line x1="${pad.l}" x2="${width - pad.r}" y1="${y(t)}" y2="${y(t)}" class="chart__grid"/><text x="${pad.l - 8}" y="${y(t) + 4}" class="chart__tick" text-anchor="end">${t}</text>`).join('')}
    ${data.map((d, i) => (i % labelEvery === 0 || i === data.length - 1 ? `<text x="${x(i)}" y="${height - 8}" class="chart__tick" text-anchor="middle">${esc(day(d.day))}</text>` : '')).join('')}
    ${layers}
    <line class="chart__cursor" x1="0" x2="0" y1="${pad.t}" y2="${pad.t + h}" visibility="hidden"/>
  </svg>`;
  const payload = encodeURIComponent(JSON.stringify({ data, series, pad, width }));
  return html`<div class="chart-wrap" data-chart="${payload}">${raw(svg)}<div class="chart__tip" hidden></div></div>`;
}

/** Wires hover tooltips for every area chart inside root. */
export function bindChartTooltip(root) {
  root.querySelectorAll('[data-chart]').forEach((wrap) => {
    const { data, series, pad, width } = JSON.parse(decodeURIComponent(wrap.dataset.chart));
    const svg = wrap.querySelector('svg');
    const cursor = wrap.querySelector('.chart__cursor');
    const tip = wrap.querySelector('.chart__tip');
    const w = width - pad.l - pad.r;
    wrap.addEventListener('pointermove', (event) => {
      const rect = svg.getBoundingClientRect();
      const vx = ((event.clientX - rect.left) / rect.width) * width;
      const i = Math.max(0, Math.min(data.length - 1, Math.round(((vx - pad.l) / w) * (data.length - 1))));
      const px = pad.l + (data.length <= 1 ? w / 2 : (i / (data.length - 1)) * w);
      cursor.setAttribute('x1', px); cursor.setAttribute('x2', px); cursor.setAttribute('visibility', 'visible');
      const d = data[i];
      tip.hidden = false;
      tip.innerHTML = `<b>${new Date(`${d.day}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}</b>${series.map((s) => `<span><i class="dot dot--${s.tone}"></i>${esc(s.label)}: <strong>${fmtNumber(d[s.key] ?? 0)}</strong></span>`).join('')}`;
      const left = (px / width) * rect.width;
      tip.style.left = `${Math.min(rect.width - 150, Math.max(0, left - 70))}px`;
    });
    wrap.addEventListener('pointerleave', () => { tip.hidden = true; cursor.setAttribute('visibility', 'hidden'); });
  });
}

/** Horizontal bar list. items: [{ label, value }]. */
export function barList(items, { empty = 'Belum ada data', format = fmtNumber } = {}) {
  if (!items?.length) return html`<p class="muted small">${empty}</p>`;
  const max = Math.max(...items.map((i) => i.value), 1);
  return html`<ul class="barlist">${items.map((item) => html`
    <li><div class="barlist__bar" data-vars="--w:${((item.value / max) * 100).toFixed(1)}%"></div><span class="barlist__label">${item.label}</span><b>${format(item.value)}</b></li>`)}</ul>`;
}

/** Donut chart. segments: [{ label, value, tone }]. */
export function donut(segments, { label = '', size = 150 } = {}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const r = 15.915; // circumference = 100
  let offset = 25;
  const arcs = total ? segments.filter((s) => s.value > 0).map((s) => {
    const pct = (s.value / total) * 100;
    const arc = `<circle cx="21" cy="21" r="${r}" fill="none" class="donut__seg tone-${s.tone}" stroke-width="5" stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="${offset}"/>`;
    offset -= pct;
    return arc;
  }).join('') : '';
  return html`
    <div class="donut">
      ${raw(`<svg viewBox="0 0 42 42" width="${size}" height="${size}" role="img" aria-label="${esc(label)}"><circle cx="21" cy="21" r="${r}" fill="none" class="donut__track" stroke-width="5"/>${arcs}<text x="21" y="21" class="donut__value" text-anchor="middle" dominant-baseline="central">${fmtNumber(total)}</text></svg>`)}
      <ul class="legend">${segments.map((s) => html`<li><i class="dot dot--${s.tone}"></i><span>${s.label}</span><b>${fmtNumber(s.value)}</b></li>`)}</ul>
    </div>`;
}

/** Tiny sparkline for KPI cards. */
export function sparkline(values, tone = 'accent') {
  if (!values?.length) return '';
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [values.length === 1 ? 50 : (i / (values.length - 1)) * 100, 28 - (v / max) * 26]);
  return raw(`<svg class="spark spark--${tone}" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path d="${smooth(pts)}"/></svg>`);
}
