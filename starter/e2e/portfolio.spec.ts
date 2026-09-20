import { test, expect, type Page } from '@playwright/test'

// task.md 原 7 条耦合约束的浏览器实测。
async function resetState(page: Page) {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.clear()
  })
}

test.describe('原摄影作品集 7 条约束', () => {
  test.beforeEach(async ({ page }) => {
    await resetState(page)
  })

  test('约束1：筛选状态在进入系列页再返回后保持', async ({ page }) => {
    await page.goto('/work', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: '牧野' }).click()
    await expect(page.locator('.photo-button')).toHaveCount(4)

    await page.getByRole('link', { name: '高原牧歌' }).click()
    await page.waitForURL(/highland-pastoral/)
    await page.goBack()
    await page.waitForURL(/\/work$/)

    await expect(page.getByRole('button', { name: '牧野' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.photo-button')).toHaveCount(4)
  })

  test('约束2：灯箱上一张/下一张只在当前筛选结果内循环', async ({ page }) => {
    await page.goto('/work', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: '牧野' }).click()
    await expect(page.locator('.photo-button')).toHaveCount(4)

    await page.locator('.photo-button').nth(1).click()
    await expect(page.locator('.lightbox[role="dialog"]')).toBeVisible()
    const counter = async () => {
      const t = (await page.locator('.lightbox-info .eyebrow').textContent()) ?? ''
      const m = t.match(/(\d+)\s*\/\s*(\d+)/)!
      return { i: +m[1], n: +m[2] }
    }
    expect(await counter()).toEqual({ i: 2, n: 4 })

    const titles: string[] = [(await page.locator('.lightbox-info h2').textContent())!.trim()]
    for (let k = 0; k < 3; k++) {
      await page.getByRole('button', { name: '下一张' }).click()
      titles.push((await page.locator('.lightbox-info h2').textContent())!.trim())
    }
    await page.getByRole('button', { name: '下一张' }).click()
    const wrapTitle = (await page.locator('.lightbox-info h2').textContent())!.trim()
    expect(wrapTitle).toBe(titles[0])
    expect(new Set(titles).size).toBe(4)
  })

  test('约束3：图片加载前按真实宽高预留比例，加载完成不发生位移（CLS）', async ({ page }) => {
    await page.route('**/*.jpg', async (route) => {
      await new Promise((r) => setTimeout(r, 900))
      await route.continue()
    })
    await page.goto('/work', { waitUntil: 'domcontentloaded' })

    const box = await page.locator('.photo-button .ratio-box').first().boundingBox()
    expect(box).not.toBeNull()
    // portrait-01 4067x6000
    expect(Math.abs(box!.width / box!.height - 4067 / 6000)).toBeLessThan(0.02)

    const before = await page.locator('.photo-button').nth(1).boundingBox()
    await page.waitForLoadState('networkidle')
    const after = await page.locator('.photo-button').nth(1).boundingBox()
    expect(Math.abs(before!.y - after!.y)).toBeLessThan(1)
  })

  test('约束4：系列详情页与作品集共享数据模型，按 order 渲染', async ({ page }) => {
    await page.goto('/work/highland-pastoral', { waitUntil: 'networkidle' })
    const titles = await page.locator('.story article h2').allTextContents()
    expect(titles).toEqual(['独牛与木屋', '坡地牛群', '雪山下的歇息', '新疆牧场'])
  })

  test('约束5：移动端单列网格 + 灯箱说明底部条', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/work', { waitUntil: 'networkidle' })
    const first = await page.locator('.photo-button').first().boundingBox()
    const second = await page.locator('.photo-button').nth(1).boundingBox()
    expect(second!.y).toBeGreaterThan(first!.y + first!.height - 2)
    await expect(page.locator('.menu')).toBeVisible()

    await page.locator('.photo-button').first().click()
    await expect(page.locator('.lightbox[role="dialog"]')).toBeVisible()
    const img = await page.locator('.lightbox-image').boundingBox()
    const info = await page.locator('.lightbox-info').boundingBox()
    expect(info!.y).toBeGreaterThanOrEqual(img!.y + img!.height - 2)
  })

  test('约束6：无外部字体 CDN 请求，字体本地 woff2', async ({ page }) => {
    const urls: string[] = []
    page.on('request', (r) => urls.push(r.url()))
    for (const path of ['/', '/work', '/about', '/contact']) {
      await page.goto(path, { waitUntil: 'networkidle' })
    }
    expect(urls.filter((u) => /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(u))).toHaveLength(0)
    expect(new Set(urls.filter((u) => u.endsWith('.woff2'))).size).toBeGreaterThanOrEqual(2)
  })

  test('约束7：联系表单行内校验、禁用提交、成功反馈', async ({ page }) => {
    await page.goto('/contact', { waitUntil: 'networkidle' })
    const submit = page.getByRole('button', { name: '发送消息' })
    await expect(submit).toBeDisabled()

    await page.getByLabel('邮箱').fill('bad')
    await page.getByLabel('邮箱').blur()
    await expect(page.getByText('请输入有效的邮箱地址')).toBeVisible()

    await page.getByLabel('姓名').fill('访客')
    await page.getByLabel('邮箱').fill('hello@example.com')
    await page.getByLabel('留言').fill('想了解一项完整的摄影合作计划，谢谢。')
    await expect(submit).toBeEnabled()
    await submit.click()
    await expect(page.getByText('谢谢你的来信')).toBeVisible()
  })

  test('5 个路由正常渲染，控制台无 error；首页/系列页复用同一个灯箱', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(String(e)))
    for (const path of ['/', '/work', '/work/gaze', '/about', '/contact']) {
      await page.goto(path, { waitUntil: 'networkidle' })
      await expect(page.locator('main')).toBeVisible()
    }
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.locator('.series-card').first().click()
    await expect(page.locator('.lightbox[role="dialog"]')).toBeVisible()
    expect(errors).toHaveLength(0)
  })
})
