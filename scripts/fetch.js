#!/usr/bin/env node
'use strict';

/**
 * 彩票开奖数据抓取脚本
 * 数据源：开彩网 f.apiplus.net（免费、无需 key）
 *  - 双色球：http://f.apiplus.net/ssq-20.json
 *  - 大乐透：http://f.apiplus.net/dlt-20.json
 * 返回格式：[{ "expect":"2026097", "opencode":"05,16,24,26,29,30+02", "opentime":"2026-08-23 21:30:00" }]
 *
 * 逻辑：抓取最近 20 期 → 解析 → 与本地 data/lottery.json 按期号去重合并 → 写回。
 * 仅在发现新数据时才更新文件。
 */

const fs = require('fs/promises');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'lottery.json');
const API_BASE = 'http://f.apiplus.net';
const FETCH_LIMIT = 20;

// 彩种定义：code=接口代码，parse=解析 opencode 的函数
const GAMES = {
  ssq: {
    code: 'ssq',
    parse: (oc) => {
      const [redPart, bluePart] = oc.split('+');
      const red = redPart.split(',').map(Number);
      const blue = Number(bluePart);
      if (red.length !== 6 || !(blue >= 1 && blue <= 16)) throw new Error('双色球格式异常: ' + oc);
      return { red, blue };
    }
  },
  dlt: {
    code: 'dlt',
    parse: (oc) => {
      const [frontPart, backPart] = oc.split('+');
      const front = frontPart.split(',').map(Number);
      const back = backPart.split(',').map(Number);
      if (front.length !== 5 || back.length !== 2) throw new Error('大乐透格式异常: ' + oc);
      return { front, back };
    }
  }
};

async function fetchGame(gameKey) {
  const game = GAMES[gameKey];
  const url = `${API_BASE}/${game.code}-${FETCH_LIMIT}.json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'lottery-updater/1.0' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const arr = await res.json();
    if (!Array.isArray(arr)) throw new Error('返回非数组');
    const out = [];
    for (const item of arr) {
      try {
        const parsed = game.parse(String(item.opencode));
        out.push({
          issue: String(item.expect),
          date: String(item.opentime).split(' ')[0],
          ...parsed
        });
      } catch (e) {
        console.warn(`  [${gameKey}] 跳过异常记录 ${item && item.expect}: ${e.message}`);
      }
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}

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

  for (const key of Object.keys(GAMES)) {
    console.log(`抓取 ${key} …`);
    let fresh;
    try {
      fresh = await fetchGame(key);
    } catch (e) {
      console.warn(`  [${key}] 抓取失败，保留现有数据：${e.message}`);
      continue;
    }
    const existing = new Map(data[key].map(d => [String(d.issue), d]));
    let added = 0;
    for (const d of fresh) {
      if (!existing.has(d.issue)) {
        existing.set(d.issue, d);
        added++;
      }
    }
    const merged = Array.from(existing.values()).sort((a, b) => String(a.issue).localeCompare(String(b.issue)));
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

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
