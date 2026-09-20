import { expect, type Page, type Locator } from '@playwright/test'

/** 通过 UI「重置演示数据」清空 localStorage 并重新播种，保证用例隔离 */
export async function resetDemo(page: Page): Promise<void> {
  await page.goto('/collections', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '重置演示数据' }).click()
  await expect(page.getByText('高原牧歌 · 首展')).toBeVisible()
}

/** 新建一个指定系列的合集，进入工作台。series 传 <option> 完整文本 */
export async function createCollection(page: Page, seriesLabel: string, title: string, curator = 'lin-ce'): Promise<void> {
  await page.goto('/collections/new', { waitUntil: 'networkidle' })
  await page.getByLabel('系列').selectOption({ label: seriesLabel })
  await page.getByLabel('合集标题').fill(title)
  await page.getByLabel('策展人标识').fill(curator)
  await page.getByRole('button', { name: '创建并进入工作台' }).click()
  await page.waitForURL(/\/collections\/col-/)
}

/** 在合集工作台选入全部必选照片 */
export async function selectAllPhotos(workbench: Locator): Promise<void> {
  const addButtons = workbench.getByRole('button', { name: '选入当前有效校样' })
  const count = await addButtons.count()
  for (let i = 0; i < count; i++) {
    await workbench.getByRole('button', { name: '选入当前有效校样' }).first().click()
    await workbench.locator('.pick-card.selected').nth(i).waitFor()
  }
}

export async function fillMetadataAndSave(
  page: Page,
  description: string,
  byline: string,
): Promise<void> {
  await page.locator('#col-desc').fill(description)
  await page.locator('#col-byline').fill(byline)
  await page.getByRole('button', { name: '保存说明与署名' }).click()
  await expect(page.locator('.alert.ok')).toContainText('已保存')
}
