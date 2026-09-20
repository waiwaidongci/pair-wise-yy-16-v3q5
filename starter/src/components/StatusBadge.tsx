import type { CollectionStatus } from '../api/types'

const LABELS: Record<CollectionStatus, string> = {
  draft: '草稿',
  published: '已发布',
  pending_review: '待复核',
  closed: '已结束',
}

export function StatusBadge({ status }: { status: CollectionStatus }) {
  return <span className={`badge status-${status}`}>{LABELS[status] ?? status}</span>
}
