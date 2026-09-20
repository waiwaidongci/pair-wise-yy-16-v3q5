import { test, expect } from '@playwright/test'
import { resetDemo, createCollection, selectAllPhotos, fillMetadataAndSave } from './helpers'

const DESC = '覆盖系列全部必选照片的完整策展说明，描述创作线索与编排逻辑，满足发布校验。'

test.describe('策展合集发布台', () => {
  test.beforeEach(async ({ page }) => {
    await resetDemo(page)
  })

  test('跨未结束合集选同一张照片返回 409 且不落库', async ({ page }) => {
    // 种子草稿「凝视 · 工作底稿」已占用全部肖像照片
    await page.goto('/collections', { waitUntil: 'networkidle' })
    await createCollection(page, '凝视（5 张必选）', '凝视 · 第二版', 'other-curator')
    expect(page.url()).toContain('/collections/col-gaze-v2')

    const before = await page.locator('.pick-card.selected').count()
    await page.getByRole('button', { name: '选入当前有效校样' }).first().click()

    const alert = page.locator('.action-notice')
    await expect(alert).toContainText('409 冲突')
    await expect(alert).toContainText('凝视 · 工作底稿')

    // 刷新后仍然没有落库（仍为 0 入选）
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.locator('.pick-card.selected')).toHaveCount(before)
  })

  test('发布前校验：缺必选照片/说明署名 → 422 阻止发布；补齐后发布成功并出现快照', async ({ page }) => {
    await createCollection(page, '无人之境（5 张必选）', '无人之境 · 首展')

    // 直接发布 → 422，列出缺失项
    await page.getByRole('button', { name: '发布合集' }).click()
    const alert = page.locator('.action-notice')
    await expect(alert).toContainText('还需覆盖系列必选照片')
    await expect(alert).toContainText('合集说明')
    await expect(alert).toContainText('署名')
    expect(page.url()).toContain('/collections/col-wilderness-v1')

    // 补齐
    await selectAllPhotos(page.locator('.collection-detail'))
    await fillMetadataAndSave(page, DESC, '策展：林策')

    await page.getByRole('button', { name: '发布合集' }).click()
    await expect(page.locator('.badge.published').first()).toBeVisible()
    await expect(page.locator('.action-notice.ok')).toContainText('发布成功')
    // 第 1 代快照
    await expect(page.getByText(/第 1 代/)).toBeVisible()
  })

  test('重复/并发发布沿用首次结果，不产生新一代快照', async ({ page }) => {
    await createCollection(page, '无人之境（5 张必选）', '无人之境 · 首展')
    await selectAllPhotos(page.locator('.collection-detail'))
    await fillMetadataAndSave(page, DESC, '策展：林策')

    await page.getByRole('button', { name: '发布合集' }).click()
    await expect(page.getByText(/第 1 代/)).toBeVisible()
    const firstTime = await page.locator('.mono', { hasText: '首次发布' }).textContent()

    // 重复发布（幂等）
    await page.getByRole('button', { name: '重复发布（幂等，沿用首次结果）' }).click()
    await expect(page.locator('.action-notice.ok')).toBeVisible()
    // 并发双发
    await page.getByRole('button', { name: '模拟并发双发' }).click()
    await expect(page.locator('.action-notice.ok')).toContainText('并发')

    expect(await page.getByText(/第 2 代/).count()).toBe(0)
    expect(await page.locator('details.snapshot-item')).toHaveCount(1)
    const afterTime = await page.locator('.mono', { hasText: '首次发布' }).textContent()
    expect(afterTime).toBe(firstTime)
  })

  test('校样撤换：已发布合集立即失效转待复核；旧快照可查不推荐；换人双确认指纹一致后重新发布为第 2 代', async ({ page }) => {
    // 种子已发布「高原牧歌 · 首展」，先确认它在首页推荐中
    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: '高原牧歌 · 首展' })).toBeVisible()

    // 去校样登记台撤换 pastoral-02
    await page.goto('/proofs', { waitUntil: 'networkidle' })
    const card = page.locator('.proof-card', { hasText: 'pastoral-02' })
    await card.locator('input[placeholder*="新校样备注"]').fill('二次调色：压低高光、提亮暗部')
    await card.getByRole('button', { name: /撤换为 v2/ }).click()
    await expect(page.locator('.alert.ok')).toContainText('已转待复核')

    // 首页不再推荐
    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: '高原牧歌 · 首展' })).toHaveCount(0)
    await expect(page.getByText('当前没有线上推荐合集')).toBeVisible()

    // 工作台显示待复核；旧快照仍可查
    await page.goto('/collections/col-pastoral-v1', { waitUntil: 'networkidle' })
    await expect(page.locator('.badge.pending_review').first()).toBeVisible()
    await expect(page.locator('.alert').first()).toContainText('校样被撤换')
    const oldSnap = page.locator('details.snapshot-item', { hasText: '第 1 代' })
    await expect(oldSnap).toContainText('已失效（仅存档）')

    // 原策展人不能复核
    await page.locator('.review-form input').fill('lin-ce')
    await page.getByRole('button', { name: /确认版本指纹一致/ }).click()
    await expect(page.locator('.action-notice')).toContainText('409')
    await expect(page.locator('.action-notice')).toContainText('换人')

    // 第一位复核人
    await page.locator('.review-form input').fill('reviewer-ma')
    await page.getByRole('button', { name: /确认版本指纹一致（0\/2）/ }).click()
    await expect(page.locator('.action-notice.ok')).toBeVisible()
    // 此时重新发布按钮仍禁用
    await expect(page.getByRole('button', { name: '重新发布（生成新一代快照）' })).toBeDisabled()

    // 同一复核人再确认仍不足
    await page.locator('.review-form input').fill('reviewer-ma')
    await page.getByRole('button', { name: /确认版本指纹一致（1\/2）/ }).click()
    await expect(page.getByRole('button', { name: '重新发布（生成新一代快照）' })).toBeDisabled()

    // 第二位不同复核人
    await page.locator('.review-form input').fill('reviewer-qiao')
    await page.getByRole('button', { name: /确认版本指纹一致（1\/2）/ }).click()
    await expect(page.getByRole('button', { name: /重新发布（生成新一代快照）/ })).toBeEnabled()

    // 重新发布
    await page.getByRole('button', { name: '重新发布（生成新一代快照）' }).click()
    await expect(page.locator('.badge.published').first()).toBeVisible()
    await expect(page.locator('details.snapshot-item', { hasText: '第 2 代' })).toContainText('当前线上')
    const snaps = page.locator('details.snapshot-item')
    await expect(snaps).toHaveCount(2)
    await expect(page.locator('details.snapshot-item', { hasText: '第 2 代' })).toContainText('校样 v2')

    // 首页恢复推荐
    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: '高原牧歌 · 首展' })).toBeVisible()
  })

  test('说明更正同样使已发布合集立即失效；复核期间再次更正使确认进度清零', async ({ page }) => {
    await page.goto('/collections/col-pastoral-v1', { waitUntil: 'networkidle' })
    // 第一张已选照片的说明更正
    const firstPick = page.locator('.pick-card.selected').first()
    await firstPick.locator('textarea').fill('更正后的策展说明：牛群与雪山之间的距离比想象更近。')
    await firstPick.getByRole('button', { name: '更正说明' }).click()
    await expect(page.locator('.badge.pending_review').first()).toBeVisible()
    await expect(page.locator('.action-notice.ok')).toContainText('立即失效')

    // 一位复核人确认
    await page.locator('.review-form input').fill('reviewer-ma')
    await page.getByRole('button', { name: /确认版本指纹一致（0\/2）/ }).click()
    await expect(page.getByRole('button', { name: /确认版本指纹一致（1\/2）/ })).toBeVisible()

    // 再次更正 → 清零
    const firstPick2 = page.locator('.pick-card.selected').first()
    await firstPick2.locator('textarea').fill('第二次更正的策展说明，措辞与之前完全不同。')
    await firstPick2.getByRole('button', { name: '更正说明' }).click()
    await expect(page.getByRole('button', { name: /确认版本指纹一致（0\/2）/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /重新发布（生成新一代快照）/ })).toBeDisabled()
  })

  test('列表筛选与刷新一致', async ({ page }) => {
    await page.goto('/collections', { waitUntil: 'networkidle' })
    // 初始两个合集
    await expect(page.locator('.collection-card')).toHaveCount(2)

    await page.getByRole('button', { name: '草稿' }).click()
    await expect(page.locator('.collection-card')).toHaveCount(1)
    await expect(page.locator('.collection-card')).toContainText('凝视 · 工作底稿')

    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByRole('button', { name: '草稿' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.collection-card')).toHaveCount(1)

    // 系列筛选（先恢复全部状态，再按系列；草稿中只有凝视 v1）
    await page.getByRole('button', { name: '全部状态' }).click()
    await page.getByRole('button', { name: '高原牧歌' }).click()
    await expect(page.locator('.collection-card')).toHaveCount(1)
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.locator('.collection-card')).toContainText('高原牧歌 · 首展')
  })

  test('合集按系列+版本唯一：同系列新建自动递增为 v2，标识唯一', async ({ page }) => {
    await createCollection(page, '高原牧歌（4 张必选）', '高原牧歌 · 另一个版本')
    await expect(page.locator('.mono', { hasText: 'highland-pastoral@v2' })).toBeVisible()
    await page.goto('/collections', { waitUntil: 'networkidle' })
    const cards = page.locator('.collection-card')
    await expect(cards.filter({ hasText: 'v1' })).toHaveCount(2)
  })
})
