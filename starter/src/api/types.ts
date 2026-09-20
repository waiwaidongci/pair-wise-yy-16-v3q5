// 与后端交互的共享类型
export interface Proof {
  id: string
  photoId: string
  version: number
  file: string
  caption: string
  attribution: string
  status: 'valid' | 'superseded'
  kind: 'initial' | 'replace' | 'caption-fix'
  changeNote: string
  createdAt: string
  createdBy: string
  supersedes: string | null
  supersededBy: string | null
}

export type CollectionStatus = 'draft' | 'published' | 'pending_review' | 'closed'

export interface CollectionItem {
  photoId: string
  proofId: string
  addedAt: string
  addedBy: string
}

export interface ReviewConfirmation {
  reviewer: string
  fingerprint: string
  confirmedAt: string
}

export interface MaterializedItem {
  photoId: string
  proofId: string
  proofVersion: number
  title: string
  file: string
  caption: string
  attribution: string
  width: number
  height: number
  order: number
}

export interface PublishError {
  field: string
  code: string
  photoId?: string
  message: string
}

export interface Collection {
  id: string
  seriesId: string
  version: number
  title: string
  status: CollectionStatus
  items: CollectionItem[]
  createdBy: string
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  publishedSnapshotId: string | null
  invalidatedAt: string | null
  invalidatedBy: string | null
  invalidationReason: string | null
  reviewConfirmations: ReviewConfirmation[]
  closedAt: string | null
}

export interface CollectionView extends Collection {
  fingerprint: string
  materializedItems: MaterializedItem[]
  publishErrors: PublishError[]
  consecutiveMatches: number
  reviewRequired: number
}

export interface CollectionListRow {
  id: string
  title: string
  seriesId: string
  seriesTitle: string
  version: number
  status: CollectionStatus
  statusLabel: string
  itemCount: number
  isRecommended: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
  publishedAt: string | null
}

export interface Snapshot {
  id: string
  collectionId: string
  seriesId: string
  version: number
  fingerprint: string
  items: MaterializedItem[]
  publishedAt: string
  publishedBy: string
  status: 'active' | 'superseded' | 'invalidated'
  supersededAt: string | null
  invalidatedAt: string | null
}

export interface Recommendation {
  collectionId: string
  title: string
  seriesId: string
  seriesTitle: string
  version: number
  publishedAt: string
  fingerprint: string | null
  itemCount: number
  cover: { photoId: string; file: string; title: string; caption: string } | null
}

export interface PhotoWithProof {
  id: string
  category: string
  seriesId: string
  file: string
  title: string
  altText: string
  caption: string
  width: number
  height: number
  order: number
  currentProof: Proof | null
}
