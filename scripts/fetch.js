#!/usr/bin/env node
'use strict';

/**
 * 彩票开奖数据抓取脚本（多源容错 v3 — 官方同日源为主）
 *
 * 设计目标：开奖当晚即更新，用户打开即见最新一期。
 *
 * 主数据源（官方，开奖后数分钟内更新，当日可达）：
 *   双色球 -> 中彩网  https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=ssq
 *   大乐透 -> 体彩网  https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=85
 *
 * 兜底数据源（并集，任一有更新即采用，避免官方源偶发不可达时停更）：
 *   - gudaoxuri/lottery_history（GitHub 公开镜像，raw + jsDelivr 双路，对 GitHub Actions 海外 runner 100% 可达）
 *   - 开彩网 apiplus（国内接口，海外 runner 常不可达，故保留公共代理兜底）
 *
 * 策略：每个彩种依次尝试所有源，官方源优先；解析后按期号取并集（官方先入，保证最新一期优先）。
 *       再与本地 data/lottery.json 按期号去重合并，按 issue 降序（最新在前），仅在发现新数据时写回。
 */

const fs = require('fs/promises');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'lottery.json');
const GH_REPO = 'gudaoxuri/lottery_history';
const GH_REF = 'main';
const TIMEOUT_MS = 15000;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const proxify = (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`;

// ---------- 字段映射 ----------
// 期号归一化：双色球/大乐透统一 7 位(20 前缀)，避免不同源/存量数据格式不一致导致合并错乱
function normSsqIssue(raw) {
  const s = String(raw).trim();
  return s.startsWith('20') && s.length >= 7 ? s : '20' + s;
}
function normDltIssue(raw) {
  const s = String(raw).trim();
  return s.startsWith('20') && s.length >= 7 ? s : '20' + s;
}
function mapCwlSsq(item) {
  const code = normSsqIssue(item.code || '');
  const date = String(item.date || '').match(/^\d{4}-\d{2}-\d{2}/);
  const red = String(item.red || '').split(',').map((s) => Number(s.trim()));
  const blue = Number(item.blue);
  if (!/^\d{7}$/.test(code)) throw new Error('双色球期号异常: ' + item.code);
  if (!date) throw new Error('双色球日期异常: ' + item.date);
  if (red.length !== 6 || red.some((n) => !(n >= 1 && n <= 33)) || !(blue >= 1 && blue <= 16))
    throw new Error('双色球号码异常: ' + item.red + '+' + item.blue);
  return { issue: code, date: date[0], red, blue };
}
function mapSportteryDlt(item) {
  const num = normDltIssue(item.lotteryDrawNum || '');
  const date = String(item.lotteryDrawTime || '').match(/^\d{4}-\d{2}-\d{2}/);
  const balls = String(item.lotteryDrawResult || '').trim().split(/\s+/).map(Number);
  const front = balls.slice(0, 5);
  const back = balls.slice(5, 7);
  if (!/^\d{5}$/.test(num)) throw new Error('大乐透期号异常: ' + item.lotteryDrawNum);
  if (!date) throw new Error('大乐透日期异常: ' + item.lotteryDrawTime);
  if (front.length !== 5 || back.length !== 2 || front.some((n) => !(n >= 1 && n <= 35)) || back.some((n) => !(n >= 1 && n <= 12)))
    throw new Error('大乐透号码异常: ' + item.lotteryDrawResult);
  return { issue: num, date: date[0], front, back };
}
function mapGudaoxuriSsq(item) {
  const red = (item.redBalls || []).map(Number);
  const blue = Number(item.blueBall);
  if (red.length !== 6 || red.some((n) => !(n >= 1 && n <= 33)) || !(blue >= 1 && blue <= 16))
    throw new Error('双色球格式异常: ' + JSON.stringify(item));
  return { issue: normSsqIssue(item.issueNumber), date: String(item.drawDate), red, blue };
}
function mapGudaoxuriDlt(item) {
  const front = (item.frontBalls || []).map(Number);
  const back = (item.backBalls || []).map(Number);
  if (front.length !== 5 || back.length !== 2 || front.some((n) => !(n >= 1 && n <= 35)) || back.some((n) => !(n >= 1 && n <= 12)))
    throw new Error('大乐透格式异常: ' + JSON.stringify(item));
  return { issue: normDltIssue(item.issueNumber), date: String(item.drawDate), front, back };
}
function parseSsqOpencode(oc) {
  const [r, b] = String(oc).split('+');
  const red = r.split(',').map(Number);
  const blue = Number(b);
  if (red.length !== 6 || red.some((n) => !(n >= 1 && n <= 33)) || !(blue >= 1 && blue <= 16))
    throw new Error('双色球格式异常: ' + oc);
  return { red, blue };
}
function parseDltOpencode(oc) {
  const [f, b] = String(oc).split('+');
  const front = f.split(',').map(Number);
  const back = b.split(',').map(Number);
  if (front.length !== 5 || back.length !== 2 || front.some((n) => !(n >= 1 && n <= 35)) || back.some((n) => !(n >= 1 && n <= 12)))
    throw new Error('大乐透格式异常: ' + oc);
  return { front, back };
}
function mapApiplusSsq(item) {
  const { red, blue } = parseSsqOpencode(item.opencode);
  const issue = normSsqIssue(item.expect);
  const date = String(item.opentime).split(' ')[0];
  if (!issue || !date) throw new Error('apiplus 字段缺失: ' + JSON.stringify(item));
  return { issue, date, red, blue };
}
function mapApiplusDlt(item) {
  const { front, back } = parseDltOpencode(item.opencode);
  const issue = normDltIssue(item.expect);
  const date = String(item.opentime).split(' ')[0];
  if (!issue || !date) throw new Error('apiplus 字段缺失: ' + JSON.stringify(item));
  return { issue, date, front, back };
}

// ---------- 数据源定义（官方源优先，镜像/接口兜底）----------
function buildSources() {
  return {
    ssq: [
      {
        name: '中彩网官方(cwl.gov.cn)',
        url: 'https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=ssq&pageNo=1&pageSize=30&systemType=PC',
        headers: { 'User-Agent': UA, 'Referer': 'https://www.cwl.gov.cn/kjxx/ssq/kjgg/', 'X-Requested-With': 'XMLHttpRequest' },
        extract: (d) => d.result || [],
        map: mapCwlSsq,
      },
      {
        name: 'jsDelivr(gudaoxuri)',
        url: `https://cdn.jsdelivr.net/gh/${GH_REPO}@${GH_REF}/data/ssq.json`,
        headers: { 'User-Agent': UA },
        extract: (d) => (Array.isArray(d) ? d : []),
        map: mapGudaoxuriSsq,
      },
      {
        name: 'raw(gudaoxuri)',
        url: `https://raw.githubusercontent.com/${GH_REPO}/${GH_REF}/data/ssq.json`,
        headers: { 'User-Agent': UA },
        extract: (d) => (Array.isArray(d) ? d : []),
        map: mapGudaoxuriSsq,
      },
      { name: 'apiplus', url: 'https://apiplus.net/ssq-30.json', headers: { 'User-Agent': UA }, extract: (d) => d.data || [], map: mapApiplusSsq },
      { name: 'proxy(apiplus)', url: proxify('https://apiplus.net/ssq-30.json'), headers: { 'User-Agent': UA }, extract: (d) => d.data || [], map: mapApiplusSsq },
    ],
    dlt: [
      {
        name: '体彩网官方(sporttery.cn)',
        url: 'https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=85&provinceId=0&pageSize=30&isVerify=1&pageNo=1',
        headers: { 'User-Agent': UA, 'Referer': 'https://www.lottery.gov.cn/' },
        extract: (d) => (d.value && d.value.list) || [],
        map: mapSportteryDlt,
      },
      {
        name: 'jsDelivr(gudaoxuri)',
        url: `https://cdn.jsdelivr.net/gh/${GH_REPO}@${GH_REF}/data/dlt.json`,
        headers: { 'User-Agent': UA },
        extract: (d) => (Array.isArray(d) ? d : []),
        map: mapGudaoxuriDlt,
      },
      {
        name: 'raw(gudaoxuri)',
        url: `https://raw.githubusercontent.com/${GH_REPO}/${GH_REF}/data/dlt.json`,
        headers: { 'User-Agent': UA },
        extract: (d) => (Array.isArray(d) ? d : []),
        map: mapGudaoxuriDlt,
      },
      { name: 'apiplus', url: 'https://apiplus.net/dlt-30.json', headers: { 'User-Agent': UA }, extract: (d) => d.data || [], map: mapApiplusDlt },
      { name: 'proxy(apiplus)', url: proxify('https://apiplus.net/dlt-30.json'), headers: { 'User-Agent': UA }, extract: (d) => d.data || [], map: mapApiplusDlt },
    ],
  };
}
const SOURCES = buildSources();

// ---------- 抓取（多源并集，官方优先，带重试）----------
async function trySource(key, src, tries = 2) {
  let lastErr = '';
  for (let attempt = 1; attempt <= tries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(src.url, {
        signal: controller.signal,
        headers: src.headers || { 'User-Agent': UA },
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      const arr = src.extract ? src.extract(json) : json;
      if (!Array.isArray(arr)) throw new Error('返回非数组');
      const out = [];
      for (const item of arr) {
        try { out.push(src.map(item)); } catch (_) { /* 跳过异常单条 */ }
      }
      if (out.length === 0) throw new Error('解析后为空');
      console.log(`  ✓ [${key}] 源「${src.name}」解析 ${out.length} 条（最新 ${out[0].issue} ${out[0].date}）`);
      return out;
    } catch (e) {
      lastErr = e.message;
      const cause = e.cause && e.cause.code ? ` (${e.cause.code})` : '';
      if (attempt < tries) {
        console.warn(`  ↻ [${key}] 源「${src.name}」第${attempt}次失败：${e.message}${cause}，重试…`);
        await new Promise((r) => setTimeout(r, 1500));
      } else {
        console.warn(`  ✗ [${key}] 源「${src.name}」失败：${e.message}${cause}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function fetchGame(key) {
  const union = new Map();
  let firstOk = false;
  for (const src of SOURCES[key]) {
    const recs = await trySource(key, src);
    if (!recs) continue;
    firstOk = true;
    for (const r of recs) if (!union.has(r.issue)) union.set(r.issue, r); // 官方源优先入，最新一期不被覆盖
  }
  if (union.size === 0) throw new Error('所有源均失败');
  if (!firstOk) console.warn(`  [${key}] 注意：官方源未命中，仅镜像/兜底数据`);
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

  // 存量数据期号归一化（防止历史遗留的混合格式在合并时产生重复）
  for (const rec of data.ssq) rec.issue = normSsqIssue(rec.issue);
  for (const rec of data.dlt) rec.issue = normDltIssue(rec.issue);

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
    const existing = new Map(data[key].map((d) => [String(d.issue), d]));
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
  normSsqIssue, normDltIssue,
  mapCwlSsq, mapSportteryDlt,
  mapGudaoxuriSsq, mapGudaoxuriDlt,
  mapApiplusSsq, mapApiplusDlt,
  parseSsqOpencode, parseDltOpencode,
  fetchGame, main, SOURCES,
};
