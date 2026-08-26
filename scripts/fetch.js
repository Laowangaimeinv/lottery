#!/usr/bin/env node
'use strict';

/**
 * 彩票开奖数据抓取脚本（多源容错版 v2）
 *
 * 主数据源：gudaoxuri/lottery_history（GitHub 公开仓库，每日自动从官网抓取
 *           双色球/大乐透开奖数据，经 jsDelivr / raw.githubusercontent 分发。
 *           这两个 CDN 对 GitHub Actions 海外 runner 100% 可达，绕开国内接口墙）
 * 备用源：开彩网 f.apiplus.net（国内接口，海外 runner 常直连失败，故加公共代理兜底）
 *
 * 字段映射：
 *   双色球 gudaoxuri -> { issue:'20'+issueNumber, date:drawDate, red:redBalls, blue:blueBall }
 *   大乐透 gudaoxuri -> { issue:'20'+issueNumber, date:drawDate, front:frontBalls, back:backBalls }
 *   双色球 apiplus   -> opencode "05,16,24,26,29,30+02"
 *   大乐透 apiplus   -> opencode "08,09,10,11,25+04,12"
 *
 * 逻辑：对每个游戏依次尝试所有源，任一成功即采用；解析 -> 与本地 data/lottery.json
 *       按期号去重合并 -> 按 issue 降序（最新在前）-> 仅在发现新数据时写回。
 */

const fs = require('fs/promises');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'lottery.json');
const GH_REPO = 'gudaoxuri/lottery_history';
const GH_REF = 'main';
const TIMEOUT_MS = 15000;

const proxify = (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`;

function buildSources() {
  return {
    ssq: [
      { name: 'jsDelivr(gudaoxuri)', url: `https://cdn.jsdelivr.net/gh/${GH_REPO}@${GH_REF}/data/ssq.json`, map: mapGudaoxuriSsq },
      { name: 'raw(gudaoxuri)',      url: `https://raw.githubusercontent.com/${GH_REPO}/${GH_REF}/data/ssq.json`, map: mapGudaoxuriSsq },
      { name: 'apiplus',             url: 'http://f.apiplus.net/ssq-30.json', map: mapApiplusSsq },
      { name: 'proxy(apiplus)',      url: proxify('http://f.apiplus.net/ssq-30.json'), map: mapApiplusSsq },
    ],
    dlt: [
      { name: 'jsDelivr(gudaoxuri)', url: `https://cdn.jsdelivr.net/gh/${GH_REPO}@${GH_REF}/data/dlt.json`, map: mapGudaoxuriDlt },
      { name: 'raw(gudaoxuri)',      url: `https://raw.githubusercontent.com/${GH_REPO}/${GH_REF}/data/dlt.json`, map: mapGudaoxuriDlt },
      { name: 'apiplus',             url: 'http://f.apiplus.net/dlt-30.json', map: mapApiplusDlt },
      { name: 'proxy(apiplus)',      url: proxify('http://f.apiplus.net/dlt-30.json'), map: mapApiplusDlt },
    ],
  };
}
const SOURCES = buildSources();

// ---------- 字段映射 ----------
function mapGudaoxuriSsq(item) {
  const red = (item.redBalls || []).map(Number);
  const blue = Number(item.blueBall);
  if (red.length !== 6 || red.some(n => !(n >= 1 && n <= 33)) || !(blue >= 1 && blue <= 16))
    throw new Error('双色球格式异常: ' + JSON.stringify(item));
  return { issue: '20' + String(item.issueNumber), date: String(item.drawDate), red, blue };
}
function mapGudaoxuriDlt(item) {
  const front = (item.frontBalls || []).map(Number);
  const back = (item.backBalls || []).map(Number);
  if (front.length !== 5 || back.length !== 2 || front.some(n => !(n >= 1 && n <= 35)) || back.some(n => !(n >= 1 && n <= 12)))
    throw new Error('大乐透格式异常: ' + JSON.stringify(item));
  return { issue: '20' + String(item.issueNumber), date: String(item.drawDate), front, back };
}
function parseSsqOpencode(oc) {
  const [r, b] = String(oc).split('+');
  const red = r.split(',').map(Number);
  const blue = Number(b);
  if (red.length !== 6 || red.some(n => !(n >= 1 && n <= 33)) || !(blue >= 1 && blue <= 16))
    throw new Error('双色球格式异常: ' + oc);
  return { red, blue };
}
function parseDltOpencode(oc) {
  const [f, b] = String(oc).split('+');
  const front = f.split(',').map(Number);
  const back = b.split(',').map(Number);
  if (front.length !== 5 || back.length !== 2 || front.some(n => !(n >= 1 && n <= 35)) || back.some(n => !(n >= 1 && n <= 12)))
    throw new Error('大乐透格式异常: ' + oc);
  return { front, back };
}
function mapApiplusSsq(item) {
  const { red, blue } = parseSsqOpencode(item.opencode);
  return { issue: String(item.expect), date: String(item.opentime).split(' ')[0], red, blue };
}
function mapApiplusDlt(item) {
  const { front, back } = parseDltOpencode(item.opencode);
  return { issue: String(item.expect), date: String(item.opentime).split(' ')[0], front, back };
}

// ---------- 抓取（多源容错 + 并集）----------
async function trySource(key, src) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(src.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'lottery-updater/2.0' },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const arr = await res.json();
    if (!Array.isArray(arr)) throw new Error('返回非数组');
    const out = [];
    for (const item of arr) {
      try { out.push(src.map(item)); } catch (_) { /* 跳过异常单条 */ }
    }
    if (out.length === 0) throw new Error('解析后为空');
    console.log(`  ✓ [${key}] 源「${src.name}」解析 ${out.length} 条`);
    return out;
  } catch (e) {
    const cause = e.cause && e.cause.code ? ` (${e.cause.code})` : '';
    console.warn(`  ✗ [${key}] 源「${src.name}」失败：${e.message}${cause}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGame(key) {
  const srcs = SOURCES[key];
  const gudaoxuriSrcs = srcs.filter(s => s.name.includes('gudaoxuri'));
  const fallbackSrcs = srcs.filter(s => !s.name.includes('gudaoxuri'));
  const union = new Map();
  const merge = (recs) => { if (recs) for (const r of recs) if (!union.has(r.issue)) union.set(r.issue, r); };

  // 优先并集 gudaoxuri 的两路 CDN：raw（实时、无构建缓存）+ jsDelivr（稳但有缓存）
  // 两者互补，确保不漏掉最新一期（单纯用 jsDelivr 会因缓存延迟少抓一期）
  for (const src of gudaoxuriSrcs) merge(await trySource(key, src));
  // 仅当 gudaoxuri 两路都失败，才回退到 apiplus（国内接口，海外 runner 常不可达）
  if (union.size === 0) {
    for (const src of fallbackSrcs) merge(await trySource(key, src));
  }
  if (union.size === 0) throw new Error('所有源均失败');
  console.log(`  [${key}] 合并去重后共 ${union.size} 条`);
  return Array.from(union.values());
}

// ---------- 主流程 ----------
async function main() {
  let data;
  try {
    data = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  } catch (e) {
    console.warn('读取现有数据失败，初始化为空：', e.message);
    data = { ssq: [], dlt: [] };
  }
  data.ssq = data.ssq || [];
  data.dlt = data.dlt || [];

  let changed = false;
  for (const key of Object.keys(SOURCES)) {
    console.log(`抓取 ${key} …`);
    let fresh;
    try {
      fresh = await fetchGame(key);
    } catch (e) {
      console.warn(`  [${key}] 全部源失败，保留现有数据：${e.message}`);
      continue;
    }
    const existing = new Map(data[key].map(d => [String(d.issue), d]));
    let added = 0;
    for (const d of fresh) {
      if (!existing.has(d.issue)) { existing.set(d.issue, d); added++; }
    }
    const merged = Array.from(existing.values()).sort(
      (a, b) => String(b.issue).localeCompare(String(a.issue))
    );
    data[key] = merged;
    console.log(`  [${key}] 新增 ${added} 期，现有 ${merged.length} 期`);
    if (added > 0) changed = true;
  }

  if (changed) {
    data.updatedAt = new Date().toISOString();
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log('数据已更新并写回', DATA_FILE);
  } else {
    console.log('没有新数据，文件未改动。');
  }
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = {
  mapGudaoxuriSsq, mapGudaoxuriDlt,
  mapApiplusSsq, mapApiplusDlt,
  parseSsqOpencode, parseDltOpencode,
  fetchGame, main, SOURCES,
};
