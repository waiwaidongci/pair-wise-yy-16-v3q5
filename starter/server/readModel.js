// ============================================================
// 展示状态层（Display Projection）
// 负责：把存储层的数据投影成前端展示所需的读模型 ——
//       首页推荐、合集列表/筛选视图。
// 只读取 rules 层产出的状态，不反向修改；每次写操作后由 rules 层触发重建。
// 关键约束：只有当前 status === 'published' 的合集才进入首页推荐；
//           待复核合集与历史快照一律不计入推荐，但快照本身仍可查询。
// ============================================================

export const COLLECTION_STATUS_LABELS = {
  draft: '草稿',
  published: '已发布',
  pending_review: '待复核',
  closed: '已结束',
}

// 重建整个展示投影，结果写回 db.display（与业务数据分开存放）
export function rebuildDisplay(store) {
  const { db } = store
  const now = new Date().toISOString()

  const published = db.collections
    .filter((c) => c.status === 'published')
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))

  // 首页推荐：仅当前有效发布中的合集；待复核 / 已结束 / 历史快照均不出现
  const recommendations = published.slice(0, 6).map((c) => {
    const snap = db.snapshots.find((s) => s.id === c.publishedSnapshotId)
    const series = store.seriesById(c.seriesId)
    const cover = snap?.items?.[0] || null
    return {
      collectionId: c.id,
      title: c.title,
      seriesId: c.seriesId,
      seriesTitle: series?.title ?? c.seriesId,
      version: c.version,
      publishedAt: c.publishedAt,
      fingerprint: snap?.fingerprint ?? null,
      itemCount: snap?.items?.length ?? 0,
      cover: cover
        ? { photoId: cover.photoId, file: cover.file, title: cover.title, caption: cover.caption }
        : null,
    }
  })

  // 列表投影：列表/筛选接口直接读这里，保证与首页推荐同源、刷新后一致
  const collectionList = db.collections
    .map((c) => ({
      id: c.id,
      title: c.title,
      seriesId: c.seriesId,
      seriesTitle: store.seriesById(c.seriesId)?.title ?? c.seriesId,
      version: c.version,
      status: c.status,
      statusLabel: COLLECTION_STATUS_LABELS[c.status] ?? c.status,
      itemCount: c.items.length,
      isRecommended: recommendations.some((r) => r.collectionId === c.id),
      createdBy: c.createdBy,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      publishedAt: c.publishedAt ?? null,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  db.display = { updatedAt: now, recommendations, collectionList }
}

// 列表 + 筛选（status / seriesId），从投影读取
export function listCollections(store, { status, seriesId } = {}) {
  const list = store.db.display?.collectionList ?? []
  return list.filter(
    (row) => (!status || row.status === status) && (!seriesId || row.seriesId === seriesId),
  )
}

export function homeRecommendations(store) {
  return store.db.display?.recommendations ?? []
}
