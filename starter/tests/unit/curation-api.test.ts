import { describe, it, expect, beforeEach } from 'vitest'
import { CurationApi } from '../../src/api/curation'
import { CurationRepository, createSeededStore } from '../../src/store/repository'
import type { CurationStoreData } from '../../src/domain/types'
import { CurationError } from '../../src/domain/rules'

function harness() {
  const repo = CurationRepository.fromData(createSeededStore('2026-09-20T00:00:00.000Z'))
  const api = new CurationApi(repo)
  return { repo, api, data: () => repo.getState() }
}

beforeEach(() => CurationApi.__resetIdempotency())

describe('版本存储：409 冲突不落库（事务回滚）', () => {
  it('跨未结束合集选入同一张照片 → 409，双方条目不变', async () => {
    const { api, data } = harness()
    // 种子中 col-gaze-v1 草稿已占用全部 portrait 照片；新建一个同系列 v2 草稿
    const c = await api.createCollection({ seriesId: 'gaze', title: '凝视 v2', curator: 'lin-ce' })
    expect(c.versionNo).toBe(2)
    const before = JSON.stringify(data())
    await expect(api.addEntry(c.id, 'portrait-01', '新的策展说明内容')).rejects.toMatchObject({ code: 409 })
    // 冲突后存储与冲突前完全一致 —— 未落库
    expect(JSON.stringify(data())).toBe(before)
  })

  it('发布校验失败 → 422 且状态不变', async () => {
    const { api, data } = harness()
    const c = await api.createCollection({ seriesId: 'wilderness', title: '无人 v1', curator: 'lin-ce' })
    const before = JSON.stringify(data())
    await expect(api.publish(c.id)).rejects.toMatchObject({ code: 422 })
    expect(JSON.stringify(data())).toBe(before)
    expect(data().collections[c.id].status).toBe('draft')
  })
})

describe('发布：完整流程、幂等与并发', () => {
  async function publishableWilderness(api: CurationApi) {
    const c = await api.createCollection({ seriesId: 'wilderness', title: '无人之境 · 首展', curator: 'lin-ce' })
    await api.updateMetadata(c.id, {
      description: '覆盖五张必选照片的完整策展说明，描述高海拔无人区的四季地貌变化。',
      byline: '策展：林策',
    })
    for (const id of ['landscape-01', 'landscape-02', 'landscape-03', 'landscape-04', 'landscape-05']) {
      const p = (await import('../../src/data/content')).photoById(id)
      await api.addEntry(c.id, id, `策展札记：${p.caption}`)
    }
    return c.id
  }

  it('发布成功并生成第 1 代快照', async () => {
    const { api, data } = harness()
    const id = await publishableWilderness(api)
    const c = await api.publish(id)
    expect(c.status).toBe('published')
    const snaps = data().snapshots.filter((s) => s.collectionId === id)
    expect(snaps).toHaveLength(1)
    expect(snaps[0].generation).toBe(1)
    expect(snaps[0].superseded).toBe(false)
  })

  it('重复发布（同幂等键）沿用首次结果：不新增快照、firstPublishedAt 不变', async () => {
    const { api, data } = harness()
    const id = await publishableWilderness(api)
    const first = await api.publish(id, 'key-1')
    const second = await api.publish(id, 'key-1')
    expect(second.publishedAt).toBe(first.publishedAt)
    expect(second.firstPublishedAt).toBe(first.firstPublishedAt)
    expect(data().snapshots.filter((s) => s.collectionId === id)).toHaveLength(1)
  })

  it('并发双发只产生一次发布（共享在途 Promise）', async () => {
    const { api, data } = harness()
    const id = await publishableWilderness(api)
    const [a, b] = await Promise.all([api.publish(id, 'k'), api.publish(id, 'k')])
    expect(a.id).toBe(b.id)
    expect(data().snapshots.filter((s) => s.collectionId === id)).toHaveLength(1)
  })

  it('无幂等键、同内容重复发布天然幂等（不产生新一代）', async () => {
    const { api, data } = harness()
    const id = await publishableWilderness(api)
    await api.publish(id)
    await api.publish(id)
    expect(data().snapshots.filter((s) => s.collectionId === id)).toHaveLength(1)
  })
})

describe('撤换/更正 → 失效 → 换人双复核 → 重新发布', () => {
  it('校样撤换后已发布合集转 pending_review；旧快照保留但 superseded；双换人确认后重新发布为第 2 代', async () => {
    const { api, data } = harness()
    const id = 'col-pastoral-v1'
    expect(data().collections[id].status).toBe('published')

    // 撤换一张已入选照片的校样
    await api.rotateProof('pastoral-02', '二次调色校样：压低高光')
    let c = data().collections[id]
    expect(c.status).toBe('pending_review')
    expect(c.invalidReason).toMatch(/撤换/)
    const old = data().snapshots.find((s) => s.snapshotId === 'snap-pastoral-v1-g1')!
    expect(old.superseded).toBe(true)
    // 旧快照仍可查
    expect(old.entries.find((e) => e.photoId === 'pastoral-02')!.proofVersion).toBe(1)

    // 原策展人不能复核
    await expect(api.confirmReview(id, 'lin-ce')).rejects.toMatchObject({ code: 409 })
    // 仅一位复核人不能重新发布
    await api.confirmReview(id, 'reviewer-ma')
    c = data().collections[id]
    await expect(api.publish(id)).rejects.toMatchObject({ code: 409 })
    // 同一复核人再次确认仍不够（必须换人）
    await api.confirmReview(id, 'reviewer-ma')
    await expect(api.publish(id)).rejects.toMatchObject({ code: 409 })
    // 第二位不同复核人确认后可以重新发布
    await api.confirmReview(id, 'reviewer-qiao')
    c = await api.publish(id)
    expect(c.status).toBe('published')

    const snaps = data().snapshots.filter((s) => s.collectionId === id).sort((a, b) => a.generation - b.generation)
    expect(snaps).toHaveLength(2)
    expect(snaps[0].superseded).toBe(true)
    expect(snaps[1].generation).toBe(2)
    expect(snaps[1].superseded).toBe(false)
    expect(snaps[1].entries.find((e) => e.photoId === 'pastoral-02')!.proofVersion).toBe(2)
  })

  it('说明更正同样触发失效；复核期间再次更正会使确认清零', async () => {
    const { api, data } = harness()
    const id = 'col-pastoral-v1'
    await api.correctEntryCaption(id, 'pastoral-01', '全新的策展说明文字，与旧版完全不同。')
    expect(data().collections[id].status).toBe('pending_review')
    await api.confirmReview(id, 'reviewer-ma')
    // 再次更正：指纹变化，已有的 1 次确认失效
    await api.correctEntryCaption(id, 'pastoral-01', '第二次更正后的策展说明文字内容。')
    const c = data().collections[id]
    expect(c.reviewConfirmations.filter((r) => r.fingerprint === c.contentFingerprint)).toHaveLength(0)
    await expect(api.publish(id)).rejects.toMatchObject({ code: 409 })
  })
})

describe('首页推荐投影：只计当前线上快照', () => {
  it('撤换失效后旧快照不进入推荐', async () => {
    const { api, data } = harness()
    const { selectRecommendedSnapshots } = await import('../../src/store/curation')
    expect(selectRecommendedSnapshots(data()).map((s) => s.collectionId)).toContain('col-pastoral-v1')
    await api.rotateProof('pastoral-02', '新校样备注内容')
    const rec = selectRecommendedSnapshots(data())
    expect(rec.find((s) => s.collectionId === 'col-pastoral-v1')).toBeUndefined()
  })
})

describe('合集按系列+版本唯一', () => {
  it('同系列连续创建自动递增版本（种子 gaze 已有 v1）', async () => {
    const { api } = harness()
    const a = await api.createCollection({ seriesId: 'gaze', title: 'A', curator: 'u' })
    const b = await api.createCollection({ seriesId: 'gaze', title: 'B', curator: 'u' })
    expect([a.versionNo, b.versionNo].sort()).toEqual([2, 3])
  })
})

// 显式标注 CurationError 使用
export type _E = CurationError
export type _D = CurationStoreData
