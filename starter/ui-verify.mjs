// ============================================================
// 浏览器端验证（Playwright）：真实交互下验证耦合约束
// 运行前先启动 dev 服务：npm run dev（或分别起 server + vite）
//   node ui-verify.mjs
// ============================================================
import { chromium } from 'playwright'

const BASE = process.env.UI_BASE || 'http://localhost:5173'
const API = process.env.API_BASE || 'http://localhost:3001/api'

let passed = 0
let failed = 0
const failures = []
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; failures.push(name); console.log(`  ✗ ${name} ${extra}`) }
}

async function apiReq(method, path, { body, user = 'curator-1' } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-User-Id': user },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

async function resetDb() {
  // 通过 API 清理：结束所有未结束合集（测试环境专用流程）
  const list = await apiReq('GET', '/collections')
  for (const c of list.body.collections) {
    if (c.status !== 'closed') await apiReq('POST', `/collections/${c.id}/close`)
  }
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await ctx.newPage()
const consoleErrors = []
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
page.on('pageerror', (e) => consoleErrors.push(String(e)))

const fontCdnRequests = []
page.on('request', (r) => {
  const u = r.url()
  if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) fontCdnRequests.push(u)
})

try {
  // ---------- 路由渲染 ----------
  console.log('【路由渲染】')
  for (const [path, sel] of [
    ['/', '.hero'],
    ['/work', '[data-testid="work-grid"]'],
    ['/work/highland-pastoral', '[data-testid="series-summary"]'],
    ['/about', '.timeline'],
    ['/contact', '[data-testid="contact-form"]'],
    ['/collections', '.toolbar'],
    ['/proofs', '[data-testid="proofs-table"]'],
  ]) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' })
    check(`${path} 渲染`, (await page.locator(sel).count()) > 0)
  }

  // ---------- 离线字体 ----------
  console.log('【离线字体】')
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.goto(BASE + '/work', { waitUntil: 'networkidle' })
  check('无任何 googleapis/gstatic 字体请求', fontCdnRequests.length === 0, fontCdnRequests.join(','))
  const localFonts = await page.evaluate(() =>
    [...document.fonts].map((f) => ({ family: f.family, status: f.status })),
  )
  check('Playfair Display / Inter 已加载', localFonts.some((f) => f.family.includes('Playfair')) && localFonts.some((f) => f.family === 'Inter'))

  // ---------- CLS：图片加载前容器已按比例占位 ----------
  console.log('【CLS 防护】')
  const ratios = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="work-grid"] .ratio-box')].slice(0, 5).map((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 ? r.width / r.height : null
    }),
  )
  check('网格图片容器均有非零占位比例', ratios.every((r) => r && r > 0.3 && r < 3))

  // ---------- 筛选状态保持 ----------
  console.log('【筛选状态保持】')
  await page.goto(BASE + '/work', { waitUntil: 'networkidle' })
  await page.locator('[data-filter="pastoral"]').click()
  let count = await page.locator('[data-testid="work-grid"] .photo-card').count()
  check('筛选牧野 → 4 张', count === 4, `实际 ${count}`)
  await page.goto(BASE + '/work/highland-pastoral', { waitUntil: 'networkidle' })
  await page.goBack()
  await page.waitForSelector('[data-testid="work-grid"]')
  const pressed = await page.locator('[data-filter="pastoral"]').getAttribute('aria-pressed')
  count = await page.locator('[data-testid="work-grid"] .photo-card').count()
  check('进入系列页返回后筛选保持「牧野」', pressed === 'true' && count === 4, `pressed=${pressed} count=${count}`)

  // ---------- 灯箱限定在筛选结果内循环 ----------
  console.log('【灯箱范围导航】')
  const seen = []
  await page.locator('[data-testid="work-grid"] .photo-card .thumb').first().click()
  await page.waitForSelector('[data-testid="lightbox"]')
  for (let i = 0; i < 4; i++) {
    seen.push(await page.locator('[data-testid="lightbox-image"]').getAttribute('data-photo-id'))
    await page.locator('[data-testid="lightbox-next"]').click()
  }
  const fifth = await page.locator('[data-testid="lightbox-image"]').getAttribute('data-photo-id')
  check('4 次「下一张」均在牧野子集内', seen.every((id) => id?.startsWith('pastoral-')), seen.join(','))
  check('循环回到起点', fifth === seen[0], `${fifth} vs ${seen[0]}`)
  const counter = await page.locator('[data-testid="lightbox-counter"]').textContent()
  check('计数器显示 x / 4（而非 /14）', counter?.includes('/ 4'), counter ?? '')
  await page.locator('[data-testid="lightbox-close"]').click()
  check('关闭灯箱', (await page.locator('[data-testid="lightbox"]').count()) === 0)

  // 首页与系列页打开的是同一个灯箱组件
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.locator('.series-card .thumb').first().click()
  check('首页精选打开同一灯箱组件', (await page.locator('[data-testid="lightbox"]').count()) === 1)
  await page.keyboard.press('Escape')

  // ---------- 移动端形态切换 ----------
  console.log('【移动端响应式】')
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const mp = await mob.newPage()
  await mp.goto(BASE + '/work', { waitUntil: 'networkidle' })
  const xs = await mp.evaluate(() =>
    [...document.querySelectorAll('[data-testid="work-grid"] .masonry-item')]
      .slice(0, 4)
      .map((el) => Math.round(el.getBoundingClientRect().x)),
  )
  check('移动端网格单列排布', new Set(xs).size === 1, xs.join(','))
  await mp.locator('[data-testid="work-grid"] .photo-card .thumb').first().click()
  await mp.waitForSelector('[data-testid="lightbox"]')
  const capBox = await mp.locator('.lightbox-caption').boundingBox()
  const vh = 844
  check('灯箱说明在移动端为底部信息条', capBox !== null && capBox.y + capBox.height > vh - 40, JSON.stringify(capBox))
  await mob.close()

  // ---------- 联系表单 ----------
  console.log('【联系表单】')
  await page.goto(BASE + '/contact', { waitUntil: 'networkidle' })
  check('空表单提交按钮禁用', await page.locator('[data-testid="contact-submit"]').isDisabled())
  await page.fill('#cf-name', '测试')
  await page.fill('#cf-email', 'not-an-email')
  await page.fill('#cf-message', '你好，想聊聊展览合作。')
  await page.locator('#cf-email').blur()
  check('非法邮箱行内报错', (await page.locator('.field.invalid .error-text').count()) > 0)
  await page.fill('#cf-email', 'hi@example.com')
  await page.locator('[data-testid="contact-submit"]').click()
  await page.waitForSelector('[data-testid="contact-success"]')
  check('提交后出现成功态', true)

  // ---------- 策展合集 UI 全流程 ----------
  console.log('【策展合集 UI 流程】')
  await resetDb()
  // (系列, 版本) 全局唯一且对已结束合集也生效，每轮用唯一版本号保证可重复执行
  const ver = Math.floor(Date.now() / 1000) % 100000
  await page.goto(BASE + '/collections', { waitUntil: 'networkidle' })
  await page.locator('[data-testid="new-collection"]').click()
  await page.selectOption('#nc-series', 'highland-pastoral')
  await page.fill('#nc-version', String(ver))
  await page.fill('#nc-title', '高原牧歌 · 2026 春')
  await page.locator('.modal .btn-primary').click()
  await page.waitForURL(/\/collections\/col-/)
  const colUrl = page.url()
  check('创建合集并跳转详情页', true)

  // 添加全部 4 张必选照片
  for (let i = 0; i < 4; i++) {
    await page.locator('[data-testid="add-item-select"]').selectOption({ index: 1 })
    await page.locator('[data-testid="add-item-btn"]').click()
    await page.waitForTimeout(500)
  }
  const itemCount = await page.locator('[data-testid="items-grid"] .item-card').count()
  check('加入 4 张照片', itemCount === 4, `实际 ${itemCount}`)

  // 重复创建同系列同版本 → 409 行内提示
  await page.goto(BASE + '/collections', { waitUntil: 'networkidle' })
  await page.locator('[data-testid="new-collection"]').click()
  await page.selectOption('#nc-series', 'highland-pastoral')
  await page.fill('#nc-version', String(ver))
  await page.fill('#nc-title', '重复版本')
  await page.locator('.modal .btn-primary').click()
  await page.waitForSelector('[data-testid="new-collection-error"]')
  const errText = await page.locator('[data-testid="new-collection-error"]').textContent()
  check('重复版本创建 → 409 行内提示', errText?.includes('409'), errText ?? '')
  await page.locator('.modal .btn').first().click()

  // 发布
  await page.goto(colUrl, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="publish-btn"]')
  await page.locator('[data-testid="publish-btn"]').click()
  await page.waitForSelector('[data-testid="detail-notice"]')
  check('UI 发布成功', (await page.locator('[data-testid="detail-notice"]').textContent())?.includes('发布成功') ?? false)

  // 首页推荐出现该合集
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  check('首页推荐出现已发布合集', (await page.locator('[data-testid="reco-grid"] .reco-card').count()) >= 1)

  // 撤换照片 → 合集立即待复核
  await page.goto(BASE + '/proofs', { waitUntil: 'networkidle' })
  await page.locator('[data-testid="replace-pastoral-01"]').click()
  await page.fill('#pe-note', '重新冲洗')
  await page.locator('[data-testid="proof-submit"]').click()
  await page.waitForSelector('[data-testid="proof-notice"]')
  check('撤换后提示合集失效', (await page.locator('[data-testid="proof-notice"]').textContent())?.includes('失效') ?? false)

  // 首页推荐消失
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  check('失效后首页推荐移除该合集', (await page.locator('[data-testid="reco-empty"]').count()) === 1)

  // 复核：触发人（curator-1 撤换）需换人
  await page.goto(colUrl, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="review-panel"]')
  check('详情页显示待复核面板', true)
  check('触发人确认按钮被禁用', await page.locator('[data-testid="confirm-btn"]').isDisabled())
  // 换人复核两次
  await page.selectOption('[data-testid="user-select"]', 'reviewer-1')
  await page.locator('[data-testid="confirm-btn"]').click()
  await page.waitForTimeout(400)
  await page.selectOption('[data-testid="user-select"]', 'reviewer-2')
  await page.locator('[data-testid="confirm-btn"]').click()
  await page.waitForTimeout(400)
  const confirmText = await page.locator('[data-testid="confirm-btn"]').textContent()
  check('两次换人确认完成（2/2）', confirmText?.includes('2/2') ?? false, confirmText ?? '')
  // 重新发布
  await page.locator('[data-testid="publish-btn"]').click()
  await page.waitForSelector('[data-testid="detail-notice"]')
  check('复核通过后重新发布成功', (await page.locator('[data-testid="detail-notice"]').textContent())?.includes('发布成功') ?? false)
  // 快照历史：旧快照仍可展开查看
  const snapRows = await page.locator('[data-testid="snapshots-table"] tbody tr[data-snapshot-id]').count()
  check('存在 2 个历史快照（旧快照可查）', snapRows === 2, `实际 ${snapRows}`)

  // 列表筛选 + 刷新一致
  await page.goto(BASE + '/collections?status=published', { waitUntil: 'networkidle' })
  const before = await page.locator('[data-testid="collections-table"] tbody tr').count()
  await page.reload({ waitUntil: 'networkidle' })
  const after = await page.locator('[data-testid="collections-table"] tbody tr').count()
  const filterVal = await page.locator('[data-testid="filter-status"]').inputValue()
  check('刷新后筛选与列表一致', before === after && filterVal === 'published', `${before}/${after}/${filterVal}`)

  // ---------- 控制台错误 ----------
  console.log('【控制台健康】')
  // 409/422/403 是规范要求的 API 语义，浏览器会把非 2xx 记为资源加载错误，予以排除
  const realErrors = consoleErrors.filter(
    (e) => !/Failed to load resource: the server responded with a status of (409|422|403|404)/.test(e),
  )
  check('全程无 console.error（预期内的 4xx 业务响应除外）', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))
} finally {
  await resetDb()
  await browser.close()
}

console.log(`\n结果：${passed} 通过，${failed} 失败`)
if (failed > 0) {
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
