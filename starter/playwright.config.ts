import { defineConfig } from '@playwright/test'

// 沙箱环境中浏览器系统库以非 root 方式解压到 /tmp/browser-libs，
// 需在 Playwright 启动子进程前注入 LD_LIBRARY_PATH。
const extraLib = '/tmp/browser-libs/usr/lib/aarch64-linux-gnu:/tmp/browser-libs/lib/aarch64-linux-gnu'
process.env.LD_LIBRARY_PATH = `${extraLib}:${process.env.LD_LIBRARY_PATH ?? ''}`

// 端到端验证：覆盖 task.md 原 7 条约束与策展合集发布台业务流程。
// 运行：cd starter && npm run e2e
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5180',
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: 'npm run dev -- --port 5180 --host 127.0.0.1 --strictPort',
    url: 'http://127.0.0.1:5180',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
