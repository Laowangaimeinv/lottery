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

  // 连线层（SVG 覆盖在表格之上）
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'trend-links');
  svg.id = 'trendLinksSvg';

  scroll.appendChild(table);
  scroll.appendChild(svg);
  wrap.innerHTML = '';
  wrap.appendChild(scroll);

  requestAnimationFrame(() => {
    svg.setAttribute('width', scroll.scrollWidth);
    svg.setAttribute('height', scroll.scrollHeight);
    drawTrendLinks();
  });
}

function drawTrendLinks() {
  const svg = $('#trendLinksSvg');
  if (!svg) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  if (!$('#trendLinks').checked) return;
  const wrap = $('#trendTableWrap');
  const scroll = wrap.querySelector('.trend-scroll');
  const table = scroll.querySelector('table');
  const base = scroll.getBoundingClientRect();
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

/* ============ 机选 ============ */
function sampleUnique(count, max) {
  const pool = Array.from({ length: max }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

function generateOne() {
  return GAME[state.game].randomGroups.map(g => ({ key: g.key, cls: g.cls, nums: sampleUnique(g.n, g.max) }));
}

let lastRandom = [];
function renderRandom() {
  const count = parseInt($('#randomCount').value, 10);
  const host = $('#randomResults');
  lastRandom = [];
  for (let i = 0; i < count; i++) lastRandom.push(generateOne());

  host.innerHTML = lastRandom.map((groups, idx) => {
    const balls = groups.map((g, gi) =>
      (gi > 0 ? '<span class="plus">+</span>' : '') + ballsRowHTML(g.nums, g.cls)
    ).join('');
    return `<div class="r-card"><span class="rno">${idx + 1}.</span>${balls}</div>`;
  }).join('');
}

async function copyRandom() {
  if (!lastRandom.length) return;
  const game = GAME[state.game].label;
  const lines = lastRandom.map((groups, idx) => {
    const parts = groups.map(g => fmtNums(g.nums));
    return `第${idx + 1}注 ${game}：` + parts.join(' + ');
  });
  const text = lines.join('\n');
  try {
    await navigator.clipboard.writeText(text);
    flashCopy('已复制');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); flashCopy('已复制'); }
    catch (_) { flashCopy('复制失败，请手动选择'); }
    document.body.removeChild(ta);
  }
}
function flashCopy(msg) {
  const btn = $('#copyBtn');
  const old = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = old; }, 1500);
}

/* ============ 切换与控制 ============ */
function renderCurrent() {
  if (state.tab === 'latest') renderLatest();
  else if (state.tab === 'trend') renderTrend();
  else if (state.tab === 'missing') renderMissing();
  else if (state.tab === 'random') renderRandom();
}

function bindEvents() {
  $$('.game-btn').forEach(b => b.addEventListener('click', () => {
    $$('.game-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    state.game = b.dataset.game;
    renderCurrent();
  }));
  $$('.tab').forEach(t => t.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    state.tab = t.dataset.tab;
    $$('.panel').forEach(p => p.classList.remove('active'));
    $('#' + state.tab).classList.add('active');
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
  $('#randomBtn').addEventListener('click', renderRandom);
  $('#copyBtn').addEventListener('click', copyRandom);

  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (state.tab === 'trend') renderTrend(); }, 200);
  });
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
}
init();
