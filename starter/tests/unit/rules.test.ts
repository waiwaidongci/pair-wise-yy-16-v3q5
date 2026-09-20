import { describe, it, expect } from 'vitest'
import {
  CurationError,
  activeProof,
  applyReviewConfirmation,
  assertPhotoCanEnter,
  assertPublishable,
  assertReadyToRepublish,
  assertSeriesVersionUnique,
  assertSelectableProof,
  fingerprintOf,
  isPublishedStale,
  validateForPublish,
} from '../../src/domain/rules'
import type { Collection, PhotoProof } from '../../src/domain/types'

const now = '2026-09-20T00:00:00.000Z'

function proof(id: string, activeVersion = 1): PhotoProof {
  return {
    photoId: id,
    activeVersion,
    versions: [
      { version: 1, fingerprint: `fp-${id}-1`, note: 'v1', createdAt: now },
      { version: 2, fingerprint: `fp-${id}-2`, note: 'v2', createdAt: now },
    ],
  }
}

function baseCollection(over: Partial<Collection> = {}): Collection {
  return {
    id: 'c1',
    seriesId: 'gaze',
    versionNo: 1,
    title: 't',
    description: '足够长的合集说明文字',
    byline: '策展：某人',
    curator: 'curator-a',
    entries: [],
    status: 'draft',
    reviewConfirmations: [],
    updatedAt: now,
    ...over,
  }
}

describe('规则：系列+版本唯一', () => {
  it('同系列同版本已存在时抛 409', () => {
    const existing = [baseCollection({ seriesId: 'gaze', versionNo: 1 })]
    expect(() => assertSeriesVersionUnique(existing, 'gaze', 1)).toThrow(CurationError)
    try {
      assertSeriesVersionUnique(existing, 'gaze', 1)
    } catch (e) {
      expect((e as CurationError).code).toBe(409)
    }
  })
  it('不同版本不冲突；self 不算冲突', () => {
    const existing = [baseCollection({ id: 'c1', seriesId: 'gaze', versionNo: 1 })]
    expect(() => assertSeriesVersionUnique(existing, 'gaze', 2)).not.toThrow()
    expect(() => assertSeriesVersionUnique(existing, 'gaze', 1, 'c1')).not.toThrow()
  })
})

describe('规则：只能选当前有效校样', () => {
  it('无有效校样 → 422；选错版本 → 422；当前版本通过', () => {
    expect(() => assertSelectableProof(undefined, { photoId: 'x', proofVersion: 1 })).toThrow(CurationError)
    expect(() => assertSelectableProof(proof('x', 2), { photoId: 'x', proofVersion: 1 })).toThrow(CurationError)
    expect(() => assertSelectableProof(proof('x', 2), { photoId: 'x', proofVersion: 2 })).not.toThrow()
    expect(activeProof(proof('x', 2))?.version).toBe(2)
  })
})

describe('规则：照片在未结束合集中唯一 / 跨合集 409', () => {
  const other = baseCollection({
    id: 'c2',
    status: 'draft',
    entries: [
      { photoId: 'p1', proofVersion: 1, proofFingerprint: 'fp', caption: '说明文字内容', addedAt: now },
    ],
  })
  it('本合集内重复 → 409', () => {
    const self = baseCollection({
      entries: [
        { photoId: 'p1', proofVersion: 1, proofFingerprint: 'fp', caption: '说明文字内容', addedAt: now },
      ],
    })
    expect(() => assertPhotoCanEnter([other], self, 'p1')).toThrow(/本合集/)
  })
  it('被其它未结束合集占用 → 409', () => {
    const self = baseCollection({ id: 'c1' })
    try {
      assertPhotoCanEnter([other], self, 'p1')
      throw new Error('应冲突')
    } catch (e) {
      expect((e as CurationError).code).toBe(409)
    }
  })
  it('已发布合集不阻止占用（它已结束；调用方只传入未结束合集列表）', () => {
    const self = baseCollection({ id: 'c1' })
    expect(() => assertPhotoCanEnter([], self, 'p1')).not.toThrow()
  })
})

describe('规则：发布前必选照片 + 说明署名 + 校样有效', () => {
  const proofs = { a: proof('a', 1), b: proof('b', 1) }
  const mkEntry = (id: string) => ({
    photoId: id,
    proofVersion: 1,
    proofFingerprint: `fp-${id}-1`,
    caption: `照片 ${id} 的策展说明`,
    addedAt: now,
  })

  it('缺必选照片/空说明署名 → 多条 422 错误', () => {
    const c = baseCollection({ entries: [mkEntry('a')], description: '', byline: '' })
    const errors = validateForPublish({
      collection: c,
      seriesRequiredPhotoIds: ['a', 'b'],
      proofs,
    })
    expect(errors.join('|')).toMatch(/必选照片/)
    expect(errors.some((e) => e.includes('合集说明'))).toBe(true)
    expect(errors.some((e) => e.includes('署名'))).toBe(true)
  })

  it('校样已撤换（entry 指向旧版本）→ 校验失败', () => {
    const c = baseCollection({ entries: [mkEntry('a'), mkEntry('b')] })
    const rotated = { ...proofs, a: proof('a', 2) }
    const errors = validateForPublish({ collection: c, seriesRequiredPhotoIds: ['a', 'b'], proofs: rotated })
    expect(errors.some((e) => e.includes('校样已失效'))).toBe(true)
    expect(() => assertPublishable({ collection: c, seriesRequiredPhotoIds: ['a', 'b'], proofs: rotated })).toThrow(CurationError)
  })

  it('完整有效 → 可发布', () => {
    const c = baseCollection({ entries: [mkEntry('a'), mkEntry('b')] })
    expect(
      validateForPublish({ collection: c, seriesRequiredPhotoIds: ['a', 'b'], proofs }),
    ).toEqual([])
  })
})

describe('规则：撤换/更正 → 已发布合集 stale', () => {
  const mkEntry = (id: string, fp = `fp-${id}-1`, caption = `照片 ${id} 的策展说明`) => ({
    photoId: id,
    proofVersion: 1,
    proofFingerprint: fp,
    caption,
    addedAt: now,
  })
  const snapshot = {
    snapshotId: 's1',
    collectionId: 'c1',
    seriesId: 'gaze',
    versionNo: 1,
    title: 't',
    description: '足够长的合集说明文字',
    byline: '策展：某人',
    curator: 'curator-a',
    entries: [mkEntry('a'), mkEntry('b')],
    contentFingerprint: 'x',
    publishedAt: now,
    generation: 1,
    superseded: false,
  }

  it('内容与快照一致 → 不 stale', () => {
    const c = baseCollection({ status: 'published', entries: [mkEntry('a'), mkEntry('b')] })
    expect(isPublishedStale(c, { a: proof('a', 1), b: proof('b', 1) }, snapshot)).toBe(false)
  })
  it('校样撤换 → stale', () => {
    const c = baseCollection({
      status: 'published',
      entries: [{ ...mkEntry('a'), proofVersion: 2, proofFingerprint: 'fp-a-2' }, mkEntry('b')],
    })
    expect(isPublishedStale(c, { a: proof('a', 2), b: proof('b', 1) }, snapshot)).toBe(true)
  })
  it('说明更正 → stale；整体说明更正 → stale', () => {
    const c = baseCollection({ status: 'published', entries: [mkEntry('a'), mkEntry('b', '新的说明文字')] })
    expect(isPublishedStale(c, { a: proof('a', 1), b: proof('b', 1) }, snapshot)).toBe(true)
    const c2 = baseCollection({ status: 'published', description: '被更正后的合集说明文字', entries: [mkEntry('a'), mkEntry('b')] })
    expect(isPublishedStale(c2, { a: proof('a', 1), b: proof('b', 1) }, snapshot)).toBe(true)
  })
})

describe('规则：复核换人 + 连续两次指纹一致', () => {
  const mk = (): Collection =>
    baseCollection({ status: 'pending_review', curator: 'curator-a' })

  it('原策展人不能复核 → 409', () => {
    expect(() => applyReviewConfirmation(mk(), 'curator-a', 'fp', now)).toThrow(CurationError)
  })
  it('需要两位不同复核人；同一人两次不算', () => {
    let r = applyReviewConfirmation(mk(), 'r1', 'fp', now)
    expect(r.readyToRepublish).toBe(false)
    r = applyReviewConfirmation(r.collection, 'r1', 'fp', now)
    expect(r.readyToRepublish).toBe(false)
    r = applyReviewConfirmation(r.collection, 'r2', 'fp', now)
    expect(r.readyToRepublish).toBe(true)
  })
  it('指纹变化（内容又被更正）→ 确认清零重来', () => {
    let r = applyReviewConfirmation(mk(), 'r1', 'fp1', now)
    r = applyReviewConfirmation(r.collection, 'r2', 'fp2', now)
    expect(r.readyToRepublish).toBe(false)
    expect(r.collection.reviewConfirmations).toHaveLength(1)
  })
  it('重新发布前强校验', () => {
    let r = applyReviewConfirmation(mk(), 'r1', 'fp', now)
    r = applyReviewConfirmation(r.collection, 'r2', 'fp', now)
    expect(() => assertReadyToRepublish(r.collection, 'fp')).not.toThrow()
    expect(() => assertReadyToRepublish(r.collection, 'other')).toThrow(CurationError)
  })
  it('指纹对内容变化敏感', () => {
    const c1 = baseCollection({
      entries: [
        { photoId: 'a', proofVersion: 1, proofFingerprint: 'f1', caption: '甲', addedAt: now },
      ],
    })
    const c2 = baseCollection({
      entries: [
        { photoId: 'a', proofVersion: 2, proofFingerprint: 'f2', caption: '甲', addedAt: now },
      ],
    })
    const c3 = baseCollection({
      entries: [
        { photoId: 'a', proofVersion: 1, proofFingerprint: 'f1', caption: '乙', addedAt: now },
      ],
    })
    expect(fingerprintOf(c2)).not.toBe(fingerprintOf(c1))
    expect(fingerprintOf(c3)).not.toBe(fingerprintOf(c1))
  })
})
