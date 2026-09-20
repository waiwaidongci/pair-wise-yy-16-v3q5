# 林澜摄影 · 作品集与策展合集发布台

在摄影师作品集（React + TypeScript + Vite）之上扩展的**策展合集发布台**：
合集按「系列 + 版本」唯一，校样版本受控，发布需校验，失效需换人复核，全部状态持久化。

## 快速开始

```bash
npm install
npm run dev        # 同时启动 API(3001) 与前端(5173)，打开 http://localhost:5173
```

```bash
npm run build      # 构建前端到 dist/
npm start          # 生产模式：Express 托管 dist/ + API（默认 3000 端口可用 PORT 覆盖）
```

## 验证

```bash
npm run verify     # 后端规则端到端验证（49 项断言，独立临时库，自动起停服务）
npm run verify:ui  # 浏览器端验证（36 项断言；需先 npm run dev，且已 npx playwright install chromium）
npm run typecheck
```

## 架构：规则 / 版本存储 / 展示状态 三层分离

```
server/
├── store.js       版本存储层：校样、合集、发布快照、幂等记录的持久化（原子写 db.json）
├── rules.js       合集规则层：唯一性、409 冲突、发布校验、失效、复核、幂等发布
├── readModel.js   展示状态层：首页推荐 + 列表/筛选投影（db.display，独立重建）
├── app.js         HTTP 层：REST 路由、统一错误格式（{ error: { code, message, details } }）
└── index.js       装配入口；生产模式托管前端构建产物
```

前端（`src/`）：`pages/` 8 个页面，`context/` 全局用户与灯箱，`api/` 客户端，
`data/photos.ts` 全站共享的内容数据模型（由 `mock-data/photos.json` 同步，禁止另写副本）。

## 需求 → 实现映射

| 需求 | 实现 | 验证 |
|---|---|---|
| 合集按系列和版本唯一 | `rules.createCollection` 查重 → 409 `DUPLICATE_COLLECTION_VERSION` | e2e【1】 |
| 只能选当前有效校样 | `addItem` 拒绝过期校样（409 `STALE_PROOF`）；发布时物化当前有效校样 | e2e【2】 |
| 未结束合集中照片唯一；跨合集 409 不落库 | `addItem` 在任何写操作前检查其他未结束合集 → 409 `PHOTO_LOCKED`，直接抛错不落盘 | e2e【3】（含磁盘核对） |
| 发布前覆盖全部必选照片 + 说明/署名校验 | `validatePublishable` → 422 逐项错误 | e2e【4】 |
| 撤换/更正 → 已发布合集立即失效转待复核 | `createProofVersion` 同事务内置 `pending_review` 并标记快照失效 | e2e【7】 |
| 旧快照可查但不计入首页推荐 | 快照永久保留（`GET /api/snapshots/:id`）；推荐投影只取 `status=published` | e2e【6】【7】【10】 |
| 复核需换人 | 触发人不能自审（403 `REVIEWER_MUST_DIFFER`）；连续确认不能同人（403 `CONSECUTIVE_SAME_REVIEWER`） | e2e【8】 |
| 连续两次指纹一致才可重新发布 | `confirmReview` 记录指纹；`publish` 要求末两次确认指纹等于当前指纹且非同人 | e2e【8】 |
| 重复/并发发布沿用首次结果 | 幂等键回放 + inflight Promise 合并 + 内容未变返回首次快照 | e2e【5】 |
| 规则/存储/展示分开实现 | `rules.js` / `store.js` / `readModel.js`；`db.display` 独立投影 | e2e【10】 |
| 列表、筛选与刷新后一致 | 服务端持久化 + 前端筛选入 URL；重启服务后列表/筛选逐字节一致 | e2e【11】+ UI |

## 主要 API

```
GET    /api/home                          首页推荐（展示层投影）
GET    /api/collections?status=&seriesId= 合集列表/筛选（展示层投影）
POST   /api/collections                   创建草稿 { seriesId, version, title }（409 重复）
GET    /api/collections/:id               详情（物化条目 + 校验状态 + 指纹 + 复核进度）
POST   /api/collections/:id/items         加入照片 { photoId, proofId? }（409 冲突/校样过期）
DELETE /api/collections/:id/items/:photoId
POST   /api/collections/:id/publish       发布/重新发布（Idempotency-Key 头；409 复核不足；422 校验失败）
POST   /api/collections/:id/confirm       复核确认（403 需换人）
POST   /api/collections/:id/close         结束合集（释放照片占用）
GET    /api/collections/:id/snapshots     全部快照（旧快照可查）
GET    /api/snapshots/:id                 快照详情
POST   /api/photos/:photoId/proofs        撤换/更正说明 → 新校样版本 + 已发布合集立即失效
GET    /api/photos                        照片 + 当前有效校样
GET    /api/proofs?photoId=               校样版本历史
```

身份通过 `X-User-Id` 头传递（演示环境无鉴权），前端右上角可切换身份以演示换人复核。

## 数据与资产

- `mock-data/photos.json` 是唯一内容数据源（只读），`scripts/sync-assets.mjs` 负责把
  照片与本地字体拷入 `public/`、把元数据拷入 `src/data/`（`predev`/`prebuild` 自动执行）。
- 字体全部本地 `@font-face`（`public/fonts/`），无任何外部字体 CDN 请求。
- 运行时状态仅存 `server/data/db.json`（可用 `DB_FILE` 环境变量覆盖）。
