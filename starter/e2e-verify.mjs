#!/usr/bin/env node
/**
 * 浏览器验证入口（任务包约定）：
 *   node e2e-verify.mjs
 * 等价于 `npx playwright test`（先单测由 `npm test` 覆盖）。
 *
 * 覆盖：
 *  - e2e/portfolio.spec.ts  原摄影作品集 7 条耦合约束
 *  - e2e/curation.spec.ts   策展合集发布台业务流程（唯一键/当前有效校样/409 不落库/
 *                            发布校验/失效转待复核/旧快照不推荐/换人双指纹复核/幂等并发）
 *
 * 沙箱中若以非 root 方式把浏览器依赖解压到了 /tmp/browser-libs，
 * playwright.config.ts 会自动注入 LD_LIBRARY_PATH。
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)))
const result = spawnSync('npx', ['playwright', 'test', ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
process.exit(result.status ?? 1)
