'use strict';

/* ============ 彩种配置 ============ */
const GAME = {
  ssq: {
    label: '双色球',
    sets: [
      { key: 'red',  label: '红球', count: 6, max: 33, cls: 'red' },
      { key: 'blue', label: '蓝球', count: 1, max: 16, cls: 'blue' }
    ],
    randomGroups: [
      { key: 'red',  n: 6, max: 33, cls: 'red' },
      { key: 'blue', n: 1, max: 16, cls: 'blue' }
    ]
  },
  dlt: {
    label: '大乐透',
    sets: [
      { key: 'front', label: '前区', count: 5, max: 35, cls: 'red' },
      { key: 'back',  label: '后区', count: 2, max: 12, cls: 'blue' }
    ],
    randomGroups: [
      { key: 'front', n: 5, max: 35, cls: 'red' },
      { key: 'back',  n: 2, max: 12, cls: 'blue' }
    ]
  }
};

const PALETTE = ['#e53935', '#1e88e5', '#2e9e5b', '#e0a106', '#8e24aa', '#00897b', '#d81b60', '#5e35b1'];

/* ============ 状态 ============ */
const state = { game: 'ssq', tab: 'latest', trendView: 'table', data: null };

/* ============ 工具 ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function sortedDraws(game) {
  return (state.data[game] || []).slice().sort((a, b) => String(a.issue).localeCompare(String(b.issue)));
}
function getNums(draw, key) {
  if (key === 'blue') return [draw.blue];
  return draw[key] || [];
}
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function fmtNums(arr) { return arr.map(pad2).join(' '); }

function ballHTML(num, cls, small) {
  return `<span class="ball ${cls}${small ? ' sm' : ''}">${pad2(num)}</span>`;
}
function ballsRowHTML(nums, cls, small) {
  return `<div class="balls">${nums.map(n => ballHTML(n, cls, small)).join('')}</div>`;
}

/* ============ 渲染：最新开奖 ============ */
function renderLatest() {
  const draws = sortedDraws(state.game);
  const main = $('#latestMain');
  const list = $('#latestList');
  if (!draws.length) {
    main.innerHTML = '<div class="empty-tip">暂无数据，请等待自动更新或手动触发。</div>';
    list.innerHTML = '';
    return;
  }
  const newest = draws[draws.length - 1];
  let html = `<div class="latest-issue">第 <b>${newest.issue}</b> 期 · 开奖日期 ${newest.date}</div>`;
  for (const set of GAME[state.game].sets) {
    html += `<div class="draw-row"><span class="draw-label">${set.label}</span>${ballsRowHTML(getNums(newest, set.key), set.cls)}</div>`;
  }
  main.innerHTML = html;

  const recent = draws.slice(-9, -1).reverse();
  list.innerHTML = recent.map(d => {
    let rows = GAME[state.game].sets.map(set =>
      `<div class="draw-row"><span class="draw-label">${set.label}</span>${ballsRowHTML(getNums(d, set.key), set.cls, true)}</div>`
    ).join('');
    return `<div class="list-card"><div class="row1"><span class="iss">第 ${d.issue} 期</span><span class="dt">${d.date}</span></div>${rows}</div>`;
  }).join('') || '<div class="empty-tip">暂无更早记录。</div>';
}

/* ============ 渲染：走势图 ============ */
function setupCanvas(canvas, cssHeight) {
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = '100%';
  const cssWidth = canvas.clientWidth || canvas.parentElement.clientWidth;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, W: cssWidth, H: cssHeight };
}

function drawLineChart(canvas, opts) {
  const { ctx, W, H } = setupCanvas(canvas, 300);
  const padL = 40, padR = 14, padT = 16, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const { series, yMax, yMin = 1, labels } = opts;
  const n = labels.length;

  ctx.clearRect(0, 0, W, H);
  ctx.font = '13px sans-serif';
  ctx.textBaseline = 'middle';

  // 横向网格 + Y 轴刻度
  const yticks = 5;
  ctx.strokeStyle = '#eef1f7';
  ctx.fillStyle = '#9aa3b5';
  ctx.textAlign = 'right';
  for (let i = 0; i <= yticks; i++) {
    const v = yMin + (yMax - yMin) * i / yticks;
    const y = padT + plotH * (1 - i / yticks);
    ctx.beginPath();
    ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillText(String(Math.round(v)), padL - 6, y);
  }

  // X 轴标签（抽样）
  ctx.textAlign = 'center';
  ctx.fillStyle = '#9aa3b5';
  const step = Math.max(1, Math.ceil(n / 5));
  for (let i = 0; i < n; i += step) {
    const x = n === 1 ? padL + plotW / 2 : padL + plotW * (i / (n - 1));
    ctx.fillText(labels[i], x, H - padB + 16);
  }
  if (n > 0) {
    const x = n === 1 ? padL + plotW / 2 : W - padR;
    ctx.fillText(labels[n - 1], x, H - padB + 16);
  }

  // 折线
  series.forEach((s, si) => {
    const color = PALETTE[si % PALETTE.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    s.values.forEach((v, i) => {
      const x = n === 1 ? padL + plotW / 2 : padL + plotW * (i / (n - 1));
      const y = padT + plotH * (1 - (v - yMin) / (yMax - yMin));
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    // 数据点（带白色描边更精致）
    s.values.forEach((v, i) => {
      const x = n === 1 ? padL + plotW / 2 : padL + plotW * (i / (n - 1));
      const y = padT + plotH * (1 - (v - yMin) / (yMax - yMin));
      ctx.beginPath(); ctx.arc(x, y, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.lineWidth = 1.4; ctx.strokeStyle = '#fff'; ctx.stroke();
    });
  });

  // 图例
  let lx = padL, ly = 10;
  series.forEach((s, si) => {
    const color = PALETTE[si % PALETTE.length];
    ctx.fillStyle = color;
    ctx.fillRect(lx, ly - 5, 12, 12);
    ctx.fillStyle = '#1a1f2e';
    ctx.textAlign = 'left';
    ctx.fillText(s.name, lx + 16, ly + 1);
    lx += 16 + ctx.measureText(s.name).width + 18;
  });
}

/* 视图路由：'table' 基本走势(官网矩阵) | 'line' 折线 */
function renderTrend() {
  if (state.trendView === 'line') {
    $('#trendTableWrap').style.display = 'none';
    $('#trendCharts').style.display = '';
    renderTrendLine();
  } else {
    $('#trendCharts').style.display = 'none';
    $('#trendTableWrap').style.display = '';
    renderTrendTable();
  }
}

/* 折线走势（原 Canvas 实现，保留作第二视图） */
function renderTrendLine() {
  const draws = sortedDraws(state.game);
  const host = $('#trendCharts');
  if (!draws.length) { host.innerHTML = '<div class="empty-tip">暂无数据。</div>'; return; }

  const range = $('#trendRange').value;
  let view = draws;
  if (range !== 'all') view = draws.slice(-parseInt(range, 10));
  const labels = view.map(d => d.issue);
  const n = view.length;

  host.innerHTML = '';
  for (const set of GAME[state.game].sets) {
    const card = document.createElement('div');
    card.className = 'chart-card';
    const title = document.createElement('h3');
    title.textContent = set.label + '走势（共 ' + n + ' 期）';
    const canvas = document.createElement('canvas');
    card.appendChild(title); card.appendChild(canvas);
    host.appendChild(card);

    const series = [];
    for (let p = 0; p < set.count; p++) {
      const values = view.map(d => getNums(d, set.key)[p]);
      series.push({ name: '第' + (p + 1) + '位', values });
    }
    drawLineChart(canvas, { series, yMax: set.max, yMin: 1, labels });
  }
}

/* ============ 基本走势（官网同款号码矩阵表）============ */
let trendViewData = [];
function trendTh(text, cls, rowspan) {
  const e = document.createElement('th');
  e.textContent = text;
  if (cls) e.className = cls;
  if (rowspan) e.rowSpan = rowspan;
  return e;
}
function trendTd(text, cls) {
  const e = document.createElement('td');
  e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
function renderTrendTable() {
  const drawsAll = sortedDraws(state.game); // 旧 -> 新
  const wrap = $('#trendTableWrap');
  if (!drawsAll.length) { wrap.innerHTML = '<div class="empty-tip">暂无数据。</div>'; return; }

  const range = $('#trendRange').value;
  let view = (range === 'all') ? drawsAll.slice() : drawsAll.slice(-parseInt(range, 10));
  view.reverse(); // 新 -> 旧（最新一期在最上方）
  trendViewData = view;

  const sets = GAME[state.game].sets;

  // 遗漏：按显示顺序（新->旧），每个号码距上次开出的期数
  const omission = {};
  sets.forEach(set => {
    omission[set.key] = {};
    for (let num = 1; num <= set.max; num++) {
      omission[set.key][num] = new Array(view.length);
      let last = -1;
      for (let r = 0; r < view.length; r++) {
        const has = getNums(view[r], set.key).includes(num);
        if (has) { omission[set.key][num][r] = 0; last = r; }
        else { omission[set.key][num][r] = (last === -1) ? (r + 1) : (r - last); }
      }
    }
  });

  const scroll = document.createElement('div');
  scroll.className = 'trend-scroll';
  const inner = document.createElement('div');
  inner.className = 'trend-inner';
  const table = document.createElement('table');
  table.className = 'trend-table';

  // 表头（两级：分组 + 号码）
  const thead = document.createElement('thead');
  const tr1 = document.createElement('tr');
  tr1.appendChild(trendTh('期号', 'col-issue', 2));
  tr1.appendChild(trendTh('开奖日期', 'col-date', 2));
  sets.forEach(set => {
    const g = trendTh(set.label, 'grp-' + set.cls);
    g.colSpan = set.max;
    tr1.appendChild(g);
  });
  const tr2 = document.createElement('tr');
  sets.forEach(set => {
    for (let num = 1; num <= set.max; num++) {
      const c = trendTh(String(num), 'num');
      if (num === 1 && set.cls === 'blue') c.classList.add('sep');
      tr2.appendChild(c);
    }
  });
  thead.appendChild(tr1); thead.appendChild(tr2);
  table.appendChild(thead);

  // 表体
  const tbody = document.createElement('tbody');
  view.forEach((d, r) => {
    const tr = document.createElement('tr');
    tr.appendChild(trendTd(d.issue, 'col-issue'));
    tr.appendChild(trendTd(d.date, 'col-date'));
    sets.forEach(set => {
      for (let num = 1; num <= set.max; num++) {
        const has = getNums(d, set.key).includes(num);
        const cell = document.createElement('td');
        cell.dataset.setkey = set.key;
        cell.dataset.num = num;
        const sep = (set.cls === 'blue' && num === 1) ? ' sep' : '';
        if (has) {
          cell.className = 'ball-cell set-' + set.cls + sep;
          cell.innerHTML = `<span class="ball ${set.cls} mini">${pad2(num)}</span>`;
        } else {
          cell.className = 'miss-cell' + sep;
          cell.textContent = omission[set.key][num][r];
        }
        tr.appendChild(cell);
      }
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  // 连线层（SVG 覆盖在表格之上，置于 inner 内与表格同步滚动）
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'trend-links');
  svg.id = 'trendLinksSvg';

  inner.appendChild(table);
  inner.appendChild(svg);
  scroll.appendChild(inner);
  wrap.innerHTML = '';
  wrap.appendChild(scroll);

  requestAnimationFrame(() => {
    svg.setAttribute('width', inner.scrollWidth || table.scrollWidth || table.offsetWidth);
    svg.setAttribute('height', inner.scrollHeight || table.scrollHeight || table.offsetHeight);
    drawTrendLinks();
  });

  // 滚动时以 rAF 节流重绘连线，保证与表格始终对齐（修复手机端图层被吞/错位）
  let trendRaf = null;
  scroll.addEventListener('scroll', () => {
    if (trendRaf) cancelAnimationFrame(trendRaf);
    trendRaf = requestAnimationFrame(drawTrendLinks);
  }, { passive: true });
}

function drawTrendLinks() {
  const svg = $('#trendLinksSvg');
  if (!svg) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  if (!$('#trendLinks').checked) return;
  const wrap = $('#trendTableWrap');
  const scroll = wrap.querySelector('.trend-scroll');
  const inner = scroll.querySelector('.trend-inner');
  const table = inner.querySelector('table');
  // 以 inner 为基准：inner 是 SVG 的包含块，随内容滚动，其视口坐标与单元格同步变化，
  // 二者之差恒为「单元格相对内容区左上角」的坐标（即 SVG 内部坐标），滚动后依然正确。
  const base = inner.getBoundingClientRect();
  const rows = Array.from(table.querySelectorAll('tbody tr'));
  const sets = GAME[state.game].sets;
  const svgNS = 'http://www.w3.org/2000/svg';
  sets.forEach(set => {
    const color = set.cls === 'blue' ? '#1e88e5' : '#e53935';
    for (let p = 0; p < set.count; p++) {
      const pts = [];
      rows.forEach((tr, ri) => {
        const draw = trendViewData[ri];
        const num = getNums(draw, set.key)[p];
        const cell = tr.querySelector('td[data-setkey="' + set.key + '"][data-num="' + num + '"]');
        if (cell) {
          const cr = cell.getBoundingClientRect();
          pts.push((cr.left - base.left + cr.width / 2) + ',' + (cr.top - base.top + cr.height / 2));
        }
      });
      if (pts.length > 1) {
        const poly = document.createElementNS(svgNS, 'polyline');
        poly.setAttribute('points', pts.join(' '));
        poly.setAttribute('fill', 'none');
        poly.setAttribute('stroke', color);
        poly.setAttribute('stroke-width', '1.4');
        poly.setAttribute('stroke-opacity', '0.5');
        poly.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(poly);
      }
    }
  });
}

/* ============ 渲染：遗漏（冷热） ============ */
function renderMissing() {
  const draws = sortedDraws(state.game);
  const host = $('#missingGrids');
  if (!draws.length) { host.innerHTML = '<div class="empty-tip">暂无数据。</div>'; return; }
  const n = draws.length;

  host.innerHTML = '';
  for (const set of GAME[state.game].sets) {
    const block = document.createElement('div');
    block.className = 'miss-block';
    const h = document.createElement('h3');
    h.textContent = set.label + ' 遗漏（共 ' + n + ' 期）';
    const grid = document.createElement('div');
    grid.className = 'miss-grid';
    block.appendChild(h); block.appendChild(grid);
    host.appendChild(block);

    for (let num = 1; num <= set.max; num++) {
      // 从最新往回找
      let omission = n; // 从未出现
      for (let i = n - 1; i >= 0; i--) {
        if (getNums(draws[i], set.key).includes(num)) { omission = n - 1 - i; break; }
      }
      const tier = omission <= 5 ? 'hot' : omission <= 12 ? 'warm' : 'cold';
      const item = document.createElement('div');
      item.className = 'miss-item ' + tier;
      item.innerHTML = ballHTML(num, '') + `<div class="omission">遗漏 ${omission}</div>`;
      grid.appendChild(item);
    }
  }
}

/* ============ 选号中心（机选/手选 · 单式/复式/胆拖）============ */
const ZONE = {
  ssq: [
    { key: 'red',  name: '红球', min: 6, max: 33, color: 'red' },
    { key: 'blue', name: '蓝球', min: 1, max: 16, color: 'blue' }
  ],
  dlt: [
    { key: 'front', name: '前区', min: 5, max: 35, color: 'red' },
    { key: 'back',  name: '后区', min: 2, max: 12, color: 'blue' }
  ]
};
const MAX_NOTES = 300;   // 生成注数上限（防爆炸）
const IMG_MAX = 140;     // 图片最多绘制的注数
const selState = { game: 'ssq', input: 'auto', play: 'single', autoCount: 5, multiple: 1, picks: {} };
let lastNotes = [];
let lastDataURL = '';

function sampleUnique(count, max) {
  const pool = Array.from({ length: max }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}
function sampleFrom(pool, k) {
  const a = pool.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}
function combinations(arr, k) {
  const res = [];
  const rec = (start, combo) => {
    if (combo.length === k) { res.push(combo.slice()); return; }
    for (let i = start; i < arr.length; i++) { combo.push(arr[i]); rec(i + 1, combo); combo.pop(); }
  };
  rec(0, []);
  return res;
}

/* 把一个区的选择展开成「若干组完整号码」（每组长度 = min） */
function expandZone(zone, sel) {
  const min = zone.min;
  if (sel.kind === 'combo') {
    const set = [...sel.set].sort((a, b) => a - b);
    if (set.length < min) return null;
    return combinations(set, min);
  }
  // 胆拖
  const b = [...sel.banker].sort((a, b) => a - b);
  const d = [...sel.drag].sort((a, b) => a - b);
  if (b.length >= min) return [b.slice(0, min)];
  const need = min - b.length;
  if (d.length < need) return null;
  return combinations(d, need).map(c => [...b, ...c]);
}

function explodeOne(g, sel) {
  const zones = ZONE[g];
  const perZone = [];
  for (const z of zones) {
    const ex = expandZone(z, sel[z.key]);
    if (!ex) return { error: zoneErr(z, sel[z.key]) };
    perZone.push(ex);
  }
  let notes = [[]];
  for (const ex of perZone) {
    const next = [];
    for (const n of notes) for (const e of ex) next.push([...n, e]);
    notes = next;
  }
  return { notes };
}
function zoneErr(z, sel) {
  if (sel.kind === 'combo') return `${z.name}至少选 ${z.min} 个（当前 ${sel.set.length} 个）`;
  const need = z.min - sel.banker.length;
  return `${z.name}胆码 ${sel.banker.length} 个，拖码需 ≥ ${need} 个（当前 ${sel.drag.length} 个）`;
}

/* 手选状态 */
function ensurePicks() {
  const g = selState.game, play = selState.play;
  selState.picks[g] = selState.picks[g] || {};
  for (const z of ZONE[g]) {
    if (!selState.picks[g][z.key] || selState.picks[g][z.key].type !== play) {
      selState.picks[g][z.key] = { type: play, nums: new Set(), banker: new Set(), drag: new Set() };
    }
  }
}
function buildSelFromManual() {
  const g = selState.game, play = selState.play;
  const sel = {};
  for (const z of ZONE[g]) {
    const p = (selState.picks[g] && selState.picks[g][z.key]) || { nums: new Set(), banker: new Set(), drag: new Set() };
    if (play === 'banker') {
      sel[z.key] = { kind: 'banker', banker: [...p.banker].sort((a, b) => a - b), drag: [...p.drag].sort((a, b) => a - b) };
    } else {
      sel[z.key] = { kind: 'combo', set: [...p.nums].sort((a, b) => a - b) };
    }
  }
  return sel;
}

/* 机选：根据玩法生成若干组选择 */
function autoSels() {
  const g = selState.game, play = selState.play, count = selState.autoCount;
  const zones = ZONE[g];
  const out = [];
  for (let i = 0; i < count; i++) {
    const sel = {};
    for (const z of zones) {
      if (play === 'single') {
        sel[z.key] = { kind: 'combo', set: sampleUnique(z.min, z.max) };
      } else if (play === 'compound') {
        const cap = (z.key === 'red' || z.key === 'front') ? 4 : 3;
        const c = Math.min(z.max, z.min + 1 + Math.floor(Math.random() * cap));
        sel[z.key] = { kind: 'combo', set: sampleUnique(c, z.max) };
      } else { // 胆拖
        const bk = 1 + Math.floor(Math.random() * (z.min - 1));
        const need = z.min - bk;
        const dr = need + 1 + Math.floor(Math.random() * 3);
        const all = Array.from({ length: z.max }, (_, i) => i + 1);
        const banker = sampleUnique(bk, z.max);
        const rest = all.filter(x => !banker.includes(x));
        const drag = sampleFrom(rest, Math.min(dr, rest.length));
        sel[z.key] = { kind: 'banker', banker, drag };
      }
    }
    out.push(sel);
  }
  return out;
}

function generateSel() {
  const sels = (selState.input === 'auto') ? autoSels() : [buildSelFromManual()];
  let notes = [];
  for (const sel of sels) {
    const r = explodeOne(selState.game, sel);
    if (r.error) { selMsg(r.error, 'bad'); return; }
    notes = notes.concat(r.notes);
  }
  if (!notes.length) { selMsg('未生成任何注，请检查选号', 'bad'); return; }
  let truncated = false;
  if (notes.length > MAX_NOTES) { notes = notes.slice(0, MAX_NOTES); truncated = true; }
  lastNotes = notes;
  renderSlipPreview(notes, truncated);
  drawSlip(notes, truncated);
  selMsg(`已生成 ${notes.length} 注${truncated ? '（注数较多，仅显示前 ' + MAX_NOTES + ' 注）' : ''}`, 'ok');
}

function renderSlipPreview(notes, truncated) {
  const g = selState.game;
  const host = $('#selPreview');
  const total = notes.length * selState.multiple;
  let html = `<div class="slip-head">共 <b>${notes.length}</b> 注 · 倍数 ×${selState.multiple} · 合计 <b>${total * 2}</b> 元</div>`;
  notes.forEach((note, idx) => {
    const parts = ZONE[g].map((z, zi) => ballsRowHTML(note[zi], z.color)).join('<span class="plus">+</span>');
    html += `<div class="r-card"><span class="rno">${idx + 1}</span>${parts}</div>`;
  });
  if (truncated) html += `<div class="empty-tip">注数较多，仅显示前 ${MAX_NOTES} 注。</div>`;
  host.innerHTML = html;
  $('#saveArea').style.display = '';
}

/* 绘制选号单图片（编号一律黑色字体，红/蓝仅用球圈颜色区分） */
function drawBall(ctx, cx, cy, r, num, ring) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = ring; ctx.stroke();
  ctx.fillStyle = '#111';
  ctx.font = `bold ${Math.round(r * 1.0)}px "PingFang SC","Microsoft YaHei",sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(pad2(num), cx, cy + 1);
}
function drawSlip(notes, truncated) {
  const g = selState.game;
  const zones = ZONE[g];
  const W = 720, scale = 2, padX = 40, ballR = 26, rowH = 78;
  const headerH = 196, footerH = 104;
  const drawn = notes.slice(0, IMG_MAX);
  const H = headerH + drawn.length * rowH + footerH;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale; canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f7f9fc'; ctx.fillRect(0, 0, W, headerH);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#111';
  ctx.font = 'bold 40px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText((g === 'ssq' ? '双色球' : '大乐透') + ' · 选号单', padX, 66);
  const now = new Date();
  const dateStr = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
  ctx.fillStyle = '#444'; ctx.font = '22px "PingFang SC",sans-serif';
  ctx.fillText('生成日期：' + dateStr + '　倍数 ×' + selState.multiple, padX, 104);
  ctx.fillText('共 ' + notes.length + ' 注　合计 ' + (notes.length * selState.multiple * 2) + ' 元（2元/注）', padX, 136);
  if (truncated) { ctx.fillStyle = '#c62828'; ctx.fillText('（注数较多，仅显示前 ' + IMG_MAX + ' 注）', padX, 168); }
  ctx.strokeStyle = '#dde3ee'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(padX, headerH - 16); ctx.lineTo(W - padX, headerH - 16); ctx.stroke();
  let y = headerH + rowH / 2;
  drawn.forEach((note, idx) => {
    ctx.fillStyle = '#111'; ctx.font = 'bold 26px "PingFang SC",sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('注' + (idx + 1), padX, y);
    let x = padX + 96;
    zones.forEach((z, zi) => {
      note[zi].forEach(n => { drawBall(ctx, x, y, ballR, n, z.color === 'blue' ? '#1d6fb8' : '#e23b3b'); x += ballR * 2 + 14; });
      x += 18;
    });
    y += rowH;
  });
  const fy = H - footerH + 40;
  ctx.fillStyle = '#8a93a6'; ctx.font = '18px "PingFang SC",sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('本选号单由「彩票开奖助手」生成，仅供娱乐参考，请理性购彩。', padX, fy);
  ctx.fillText('数据来源：公开开奖接口 · GitHub Pages 托管', padX, fy + 26);
  lastDataURL = canvas.toDataURL('image/png');
  $('#slipImg').src = lastDataURL;
}

function saveSlip() {
  if (!lastDataURL) { selMsg('请先生成选号', 'bad'); return; }
  const now = new Date();
  const a = document.createElement('a');
  a.href = lastDataURL;
  a.download = `选号单_${selState.game}_${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}.png`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  selMsg('已开始下载图片', 'ok');
}
function copySlip() {
  if (!lastNotes.length) { selMsg('请先生成选号', 'bad'); return; }
  const g = selState.game;
  const text = lastNotes.map((note, idx) =>
    '注' + (idx + 1) + '：' + ZONE[g].map((z, zi) => note[zi].map(pad2).join(' ')).join(' + ')
  ).join('\n');
  try {
    navigator.clipboard.writeText(text).then(() => selMsg('已复制全部选号', 'ok'), () => selMsg('复制失败，请手动选择', 'bad'));
  } catch (e) { selMsg('复制失败，请手动选择', 'bad'); }
}
function selMsg(text, type) {
  const el = $('#selMsg');
  el.textContent = text;
  el.className = 'sel-msg' + (type ? ' ' + type : '');
  if (text) { clearTimeout(el._t); el._t = setTimeout(() => { el.textContent = ''; el.className = 'sel-msg'; }, 3500); }
}
function resetSel() {
  selState.picks = {}; lastNotes = []; lastDataURL = '';
  $('#selPreview').innerHTML = ''; $('#saveArea').style.display = 'none'; $('#selMsg').textContent = '';
  if (selState.input === 'manual') renderManualArea();
}

/* 手选区渲染 */
function renderManualArea() {
  const area = $('#manualArea');
  if (selState.input !== 'manual') { area.style.display = 'none'; area.innerHTML = ''; return; }
  area.style.display = '';
  ensurePicks();
  const g = selState.game, play = selState.play, zones = ZONE[g];
  let html = `<p class="hint">手选模式：点击号码进行选择。${play === 'banker' ? '「胆码」必出、「拖码」与其组合出号。' : '（每种至少选 ' + zones.map(z => z.min).join(' / ') + ' 个）'}</p>`;
  for (const z of zones) {
    const p = selState.picks[g][z.key];
    if (play === 'banker') {
      html += zoneBlock(g, z, p, 'banker');
      html += zoneBlock(g, z, p, 'drag');
    } else {
      html += zoneBlock(g, z, p, 'single');
    }
  }
  area.innerHTML = html;
}
function zoneBlock(g, z, p, role) {
  const isBanker = role === 'banker', isDrag = role === 'drag';
  const set = isBanker ? p.banker : isDrag ? p.drag : p.nums;
  const label = isBanker ? '胆码' : isDrag ? '拖码' : z.name;
  let statusCls = '', statusTxt = '';
  if (!isBanker && !isDrag) {
    const ok = set.size >= z.min;
    statusCls = ok ? 'ok' : 'bad';
    statusTxt = `${set.size} / 至少 ${z.min}`;
  } else if (isBanker) {
    statusCls = set.size > 0 ? 'ok' : 'bad';
    statusTxt = `胆 ${set.size}`;
  } else {
    statusTxt = `拖 ${set.size}`;
  }
  let cells = '';
  for (let n = 1; n <= z.max; n++) {
    const on = set.has(n);
    let cls = 'num-pick';
    if (isBanker) { if (on) cls += ' banker-on'; }
    else if (isDrag) { if (on) cls += ' drag-on'; }
    else { if (on) cls += ' on'; }
    cells += `<button class="${cls}" data-zone="${z.key}" data-num="${n}" data-role="${role}">${pad2(n)}</button>`;
  }
  return `<div class="zone-block">
    <div class="zone-head">
      <span class="zone-name ${z.color}">${label}</span>
      ${isBanker || isDrag ? `<span class="role-label ${role}">${label}</span>` : ''}
      <span class="zone-count ${statusCls}">${statusTxt}</span>
    </div>
    <div class="num-grid ${z.color}">${cells}</div>
  </div>`;
}

/* 选号面板整体渲染 */
function renderSelection() {
  ensurePicks();
  $$('.seg-selgame').forEach(b => b.classList.toggle('active', b.dataset.selgame === selState.game));
  $$('#inputTypeSeg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.input === selState.input));
  $$('#playSeg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.play === selState.play));
  $('#autoParam').style.display = selState.input === 'auto' ? '' : 'none';
  $('#multiVal').textContent = selState.multiple;
  if (selState.input === 'manual') renderManualArea(); else $('#manualArea').innerHTML = '';
}

/* 选号面板事件绑定 */
function bindSelectionEvents() {
  $$('.seg-selgame').forEach(b => b.addEventListener('click', () => { selState.game = b.dataset.selgame; renderSelection(); }));
  $$('#inputTypeSeg .seg-btn').forEach(b => b.addEventListener('click', () => { selState.input = b.dataset.input; renderSelection(); }));
  $$('#playSeg .seg-btn').forEach(b => b.addEventListener('click', () => { selState.play = b.dataset.play; renderSelection(); }));
  $('#autoCount').addEventListener('change', e => { selState.autoCount = parseInt(e.target.value, 10); });
  $('#multiMinus').addEventListener('click', () => { selState.multiple = Math.max(1, selState.multiple - 1); $('#multiVal').textContent = selState.multiple; });
  $('#multiPlus').addEventListener('click', () => { selState.multiple = Math.min(99, selState.multiple + 1); $('#multiVal').textContent = selState.multiple; });
  $('#genBtn').addEventListener('click', generateSel);
  $('#resetBtn').addEventListener('click', resetSel);
  $('#saveImgBtn').addEventListener('click', saveSlip);
  $('#copySlipBtn').addEventListener('click', copySlip);
  $('#manualArea').addEventListener('click', e => {
    const btn = e.target.closest('.num-pick'); if (!btn) return;
    const zone = btn.dataset.zone, num = +btn.dataset.num;
    const p = selState.picks[selState.game][zone];
    if (selState.play === 'banker') {
      const set = btn.dataset.role === 'banker' ? p.banker : p.drag;
      const other = btn.dataset.role === 'banker' ? p.drag : p.banker;
      if (other.has(num)) other.delete(num);
      set.has(num) ? set.delete(num) : set.add(num);
    } else {
      p.nums.has(num) ? p.nums.delete(num) : p.nums.add(num);
    }
    renderManualArea();
  });
}

/* 统一彩种切换：顶部开关 + 最新开奖区开关 双向同步 */
function setGame(game) {
  state.game = game;
  $$('.game-btn').forEach(x => x.classList.toggle('active', x.dataset.game === game));
  $$('.latest-game-btn').forEach(x => x.classList.toggle('active', x.dataset.game === game));
  renderCurrent();
}

/* ============ 切换与控制 ============ */
function renderCurrent() {
  if (state.tab === 'latest') renderLatest();
  else if (state.tab === 'trend') renderTrend();
  else if (state.tab === 'missing') renderMissing();
  else if (state.tab === 'random') renderSelection();
}

function bindEvents() {
  $$('.game-btn').forEach(b => b.addEventListener('click', () => setGame(b.dataset.game)));
  $$('.latest-game-btn').forEach(b => b.addEventListener('click', () => setGame(b.dataset.game)));
  $$('.tab').forEach(t => t.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    state.tab = t.dataset.tab;
    $$('.panel').forEach(p => p.classList.remove('active'));
    $('#' + state.tab).classList.add('active');
    document.querySelector('.topbar').classList.remove('head-hidden');
    renderCurrent();
  }));
  $('#trendRange').addEventListener('change', renderTrend);
  $$('.view-btn').forEach(b => b.addEventListener('click', () => {
    $$('.view-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    state.trendView = b.dataset.view;
    renderTrend();
  }));
  $('#trendLinks').addEventListener('change', () => {
    if (state.tab === 'trend' && state.trendView === 'table') drawTrendLinks();
  });
  bindSelectionEvents();

  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (state.tab === 'trend') renderTrend(); syncHeaderH(); }, 200);
  });
}

/* 手机端：把顶栏实际高度写入 CSS 变量，供 main 顶部留白使用 */
function syncHeaderH() {
  if (!window.matchMedia('(max-width: 560px)').matches) return;
  const h = document.querySelector('.topbar').offsetHeight;
  if (h) document.documentElement.style.setProperty('--header-h', h + 'px');
}

/* 手机端：上滑时收起顶栏（释放空间看走势图），下滑或回到顶部时恢复 */
function bindHeaderAutoHide() {
  const topbar = document.querySelector('.topbar');
  const apply = (y, last) => {
    if (y > last && y > 30) topbar.classList.add('head-hidden');
    else if (y < last) topbar.classList.remove('head-hidden');
  };
  let lastWin = 0;
  window.addEventListener('scroll', () => {
    const y = window.pageYOffset || document.documentElement.scrollTop || 0;
    apply(y, lastWin); lastWin = y;
  }, { passive: true });
  const wrap = document.getElementById('trendTableWrap');
  let lastTrend = 0;
  wrap.addEventListener('scroll', (e) => {
    const y = e.target.scrollTop || 0;
    apply(y, lastTrend); lastTrend = y;
  }, true);
}

/* ============ 初始化 ============ */
async function init() {
  bindEvents();
  try {
    const res = await fetch('./data/lottery.json', { cache: 'no-store' });
    state.data = await res.json();
    const ts = state.data.updatedAt;
    $('#updatedAt').textContent = ts ? new Date(ts).toLocaleString('zh-CN') : '已加载';
  } catch (e) {
    $('#updatedAt').textContent = '加载失败';
    state.data = { ssq: [], dlt: [] };
  }
  renderCurrent();
  // 初始化时对齐所有彩种开关的激活态（默认双色球）
  $$('.game-btn').forEach(x => x.classList.toggle('active', x.dataset.game === state.game));
  $$('.latest-game-btn').forEach(x => x.classList.toggle('active', x.dataset.game === state.game));
  syncHeaderH();
  bindHeaderAutoHide();
}
init();
