# 🎯 彩票开奖助手（双色球 / 大乐透）

一个零依赖的纯静态网页，集成 **最新开奖、号码走势图、遗漏冷热、随机机选** 四大功能，电脑手机全适配，大字号高对比，照顾老人老花眼，号码以“球体内显示”呈现。

数据由 **GitHub Actions 每日自动更新**（北京时间 22:30）。数据源优先采用公开仓库 `gudaoxuri/lottery_history`（每日从官网抓取，经 jsDelivr / raw.githubusercontent 分发，海外 Actions runner 稳定可达），并保留开彩网 `f.apiplus.net` 作为兜底，全程无需任何 API Key。

---

## ✨ 功能一览

- **最新开奖**：最新一期大号球体展示 + 近期若干期速览。
- **走势图**：各位置号码随期数变化的折线图（红球/前区、蓝球/后区分开绘制），可切换显示期数。
- **遗漏（冷热）**：红球 1–33 / 蓝球 1–16（大乐透前区 1–35 / 后区 1–12）的遗漏期数，绿=热号、红=冷号。
- **随机机选**：合法随机出号（双色球 6+1，大乐透 5+2），支持多注与一键复制。

## 📁 目录结构

```
.
├── index.html              # 页面入口
├── css/style.css           # 样式（响应式 / 老人友好 / 号码球）
├── js/app.js               # 核心逻辑（渲染 / 走势图 / 遗漏 / 机选）
├── data/lottery.json       # 开奖数据（由 Actions 自动维护）
├── scripts/fetch.js        # 抓取脚本（多源容错：gudaoxuri 两路 CDN 取并集 + apiplus 兜底 → 去重合并）
└── .github/workflows/update.yml  # 每日自动更新工作流
```

## 🚀 部署到 GitHub Pages（三步）

1. **推送到 GitHub**
   - 新建仓库（如 `lottery`），将本项目文件推送上去；或 Fork 后改为自己的仓库。
2. **开启 GitHub Pages**
   - 仓库 `Settings → Pages → Build and deployment → Source` 选择 **Deploy from a branch**。
   - Branch 选择 `main`（或你的默认分支），目录选 `/ (root)`，保存。
   - 几分钟后访问 `https://<你的用户名>.github.io/<仓库名>/`。
3. **开启自动更新**
   - 进入仓库 `Settings → Actions → General → Workflow permissions`，勾选 **Read and write permissions**（脚本需要提交数据）。
   - 进入 `Actions → 更新彩票开奖数据`，点击 **Run workflow** 立即抓取一次；之后每天北京时间 22:30 自动运行。

> 提示：首次部署后页面已有近期真实种子数据；点一次 `Run workflow` 即可拉取最新开奖并写回仓库。

## 💻 本地预览 / 开发

直接双击 `index.html` 在部分浏览器中可能因 `file://` 限制无法读取数据文件，建议用静态服务器：

```bash
# 在项目根目录执行
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000
```

手动运行数据抓取（需联网）：

```bash
node scripts/fetch.js
```

## ⚠️ 免责声明

本工具数据来源于公开接口，仅供娱乐与研究参考，**不构成任何购彩建议**。彩票开奖随机，请理性投注、量力而行。请以官方公布结果为准。
