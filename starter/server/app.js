// ============================================================
// HTTP 层：把请求映射到规则层 / 展示层，统一错误格式。
// 用户身份通过 X-User-Id 头传递（演示环境，无真实鉴权）。
// ============================================================
import { Router } from 'express'
import {
  ApiError,
  createCollection,
  addItem,
  removeItem,
  publishCollection,
  createProofVersion,
  confirmReview,
  closeCollection,
  currentFingerprint,
  materializeItems,
  validatePublishable,
  consecutiveMatches,
} from './rules.js'
import { listCollections, homeRecommendations } from './readModel.js'

export function createApiRouter(store) {
  const router = Router()

  const user = (req) => req.get('X-User-Id') || 'curator-1'
  const ok = (res, data, status = 200) => res.status(status).json(data)

  // 合集详情的完整视图：条目物化 + 校验状态 + 指纹 + 复核进度
  const collectionView = (col) => {
    const fingerprint = currentFingerprint(store, col)
    return {
      ...col,
      fingerprint,
      materializedItems: materializeItems(store, col),
      publishErrors: validatePublishable(store, col),
      consecutiveMatches: consecutiveMatches(col, fingerprint),
      reviewRequired: 2,
    }
  }

  // ---------- 内容数据（只读，源自 mock-data/photos.json） ----------
  router.get('/photos', (req, res) => {
    const photos = store.photosData.photos.map((p) => ({
      ...p,
      currentProof: store.currentProof(p.id),
    }))
    ok(res, { categories: store.photosData.categories, series: store.photosData.series, photos })
  })

  router.get('/proofs', (req, res) => {
    const { photoId } = req.query
    const list = photoId ? store.proofsOf(photoId) : store.db.proofs
    ok(res, { proofs: list })
  })

  // ---------- 首页推荐（展示层投影；待复核与历史快照不计入） ----------
  router.get('/home', (req, res) => {
    ok(res, { recommendations: homeRecommendations(store), updatedAt: store.db.display?.updatedAt })
  })

  // ---------- 合集列表 + 筛选（展示层投影，刷新后一致） ----------
  router.get('/collections', (req, res) => {
    const { status, seriesId } = req.query
    ok(res, { collections: listCollections(store, { status, seriesId }) })
  })

  router.post('/collections', (req, res, next) => {
    try {
      const col = createCollection(store, req.body ?? {}, user(req))
      ok(res, { collection: collectionView(col) }, 201)
    } catch (e) { next(e) }
  })

  router.get('/collections/:id', (req, res, next) => {
    try {
      const col = store.collectionById(req.params.id)
      if (!col) throw new ApiError(404, 'COLLECTION_NOT_FOUND', `合集 ${req.params.id} 不存在`)
      ok(res, { collection: collectionView(col) })
    } catch (e) { next(e) }
  })

  router.post('/collections/:id/items', (req, res, next) => {
    try {
      const col = addItem(store, req.params.id, req.body ?? {}, user(req))
      ok(res, { collection: collectionView(col) }, 201)
    } catch (e) { next(e) }
  })

  router.delete('/collections/:id/items/:photoId', (req, res, next) => {
    try {
      const col = removeItem(store, req.params.id, req.params.photoId)
      ok(res, { collection: collectionView(col) })
    } catch (e) { next(e) }
  })

  router.post('/collections/:id/publish', async (req, res, next) => {
    try {
      const result = await publishCollection(store, req.params.id, {
        user: user(req),
        idempotencyKey: req.get('Idempotency-Key') || req.body?.idempotencyKey || null,
      })
      ok(res, result.body, result.status)
    } catch (e) { next(e) }
  })

  router.post('/collections/:id/confirm', (req, res, next) => {
    try {
      const result = confirmReview(store, req.params.id, { user: user(req) })
      ok(res, result)
    } catch (e) { next(e) }
  })

  router.post('/collections/:id/close', (req, res, next) => {
    try {
      const col = closeCollection(store, req.params.id)
      ok(res, { collection: collectionView(col) })
    } catch (e) { next(e) }
  })

  // ---------- 快照：旧快照永久可查，但不计入首页推荐 ----------
  router.get('/collections/:id/snapshots', (req, res, next) => {
    try {
      if (!store.collectionById(req.params.id)) {
        throw new ApiError(404, 'COLLECTION_NOT_FOUND', `合集 ${req.params.id} 不存在`)
      }
      ok(res, { snapshots: store.snapshotsOf(req.params.id) })
    } catch (e) { next(e) }
  })

  router.get('/snapshots/:snapshotId', (req, res, next) => {
    try {
      const snap = store.snapshotById(req.params.snapshotId)
      if (!snap) throw new ApiError(404, 'SNAPSHOT_NOT_FOUND', `快照 ${req.params.snapshotId} 不存在`)
      ok(res, { snapshot: snap })
    } catch (e) { next(e) }
  })

  // ---------- 校样：撤换 / 说明更正 → 新版本 + 已发布合集立即失效 ----------
  router.post('/photos/:photoId/proofs', (req, res, next) => {
    try {
      const result = createProofVersion(store, req.params.photoId, req.body ?? {}, user(req))
      ok(res, result, 201)
    } catch (e) { next(e) }
  })

  // 统一错误格式
  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, _next) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json({
        error: { code: err.code, message: err.message, details: err.details ?? null },
      })
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'BAD_JSON', message: '请求体不是合法 JSON' } })
    }
    console.error('[api] 未处理错误:', err)
    res.status(500).json({ error: { code: 'INTERNAL', message: '服务器内部错误' } })
  })

  return router
}
