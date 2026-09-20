/**
 * 展示状态层（React Context）。
 *
 * 与「规则（domain/rules）」「版本存储（store/repository）」分离：
 * 本层只负责把仓储状态投影成页面需要的视图模型、处理加载态/错误、
 * 以及列表筛选等 UI 状态（持久化到 localStorage，刷新后一致）。
 * 所有写动作委托 api/curation.ts，不在组件里直接操作 localStorage。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Collection, CurationStoreData, PhotoProof, PublishedSnapshot } from '../domain/types'
import { CurationRepository } from './repository'
import { CurationApi, getCurationApi, type CurationApi as CurationApiType } from '../api/curation'
import { CurationError } from '../domain/rules'
import { seriesById } from '../data/content'

const FILTER_KEY = 'curation-list-filter-v1'

export type StatusFilter = 'all' | 'draft' | 'published' | 'pending_review'
export interface ListFilter {
  seriesId: string | 'all'
  status: StatusFilter
}

export const DEFAULT_FILTER: ListFilter = { seriesId: 'all', status: 'all' }

/** 首页推荐：仅「当前仍线上」的发布快照（superseded=false），按发布时间倒序 */
export function selectRecommendedSnapshots(data: CurationStoreData): PublishedSnapshot[] {
  return data.snapshots
    .filter((s) => !s.superseded)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}

/** 旧快照（可查但不推荐） */
export function selectArchivedSnapshots(data: CurationStoreData): PublishedSnapshot[] {
  return data.snapshots
    .filter((s) => s.superseded)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}

export function applyListFilter(collections: Collection[], f: ListFilter): Collection[] {
  return collections.filter(
    (c) =>
      (f.seriesId === 'all' || c.seriesId === f.seriesId) &&
      (f.status === 'all' || c.status === f.status),
  )
}

interface CurationContextValue {
  data: CurationStoreData
  api: CurationApiType
  /** 列表筛选（刷新后一致） */
  filter: ListFilter
  setFilter: (patch: Partial<ListFilter>) => void
  /** 当前登录策展人标识（简化：本地设置，用于换人复核判定演示） */
  actingCurator: string
  setActingCurator: (name: string) => void
  resetDemo: () => void
  /** 视图 helper */
  getCollection: (id: string) => Collection | undefined
  getProof: (photoId: string) => PhotoProof | undefined
  seriesTitle: (id: string) => string
}

const CurationContext = createContext<CurationContextValue | null>(null)

const ACTOR_KEY = 'curation-acting-curator'

export function CurationProvider({ children }: { children: ReactNode }) {
  const repoRef = useRef<CurationRepository | null>(null)
  if (!repoRef.current) {
    repoRef.current = CurationRepository.load()
    getCurationApi(repoRef.current)
  }
  const repo = repoRef.current

  const [data, setData] = useState<CurationStoreData>(() => repo.getState())

  useEffect(() => repo.subscribe(() => setData(repo.getState())), [repo])

  const [filter, setFilterState] = useState<ListFilter>(() => {
    try {
      const raw = localStorage.getItem(FILTER_KEY)
      return raw ? { ...DEFAULT_FILTER, ...(JSON.parse(raw) as ListFilter) } : DEFAULT_FILTER
    } catch {
      return DEFAULT_FILTER
    }
  })

  const setFilter = useCallback((patch: Partial<ListFilter>) => {
    setFilterState((prev) => {
      const next = { ...prev, ...patch }
      localStorage.setItem(FILTER_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const [actingCurator, setActingState] = useState<string>(
    () => localStorage.getItem(ACTOR_KEY) ?? 'lin-ce',
  )
  const setActingCurator = useCallback((name: string) => {
    const v = name.trim()
    setActingState(v)
    localStorage.setItem(ACTOR_KEY, v)
  }, [])

  const resetDemo = useCallback(() => {
    repo.reset()
    CurationApi.__resetIdempotency()
  }, [repo])

  const value = useMemo<CurationContextValue>(
    () => ({
      data,
      api: getCurationApi(),
      filter,
      setFilter,
      actingCurator,
      setActingCurator,
      resetDemo,
      getCollection: (id) => data.collections[id],
      getProof: (photoId) => data.proofs[photoId],
      seriesTitle: (id) => seriesById(id).title,
    }),
    [data, filter, setFilter, actingCurator, setActingCurator, resetDemo],
  )

  return <CurationContext.Provider value={value}>{children}</CurationContext.Provider>
}

export function useCuration(): CurationContextValue {
  const ctx = useContext(CurationContext)
  if (!ctx) throw new Error('useCuration 必须在 CurationProvider 内使用')
  return ctx
}

/** 把 API 抛出的错误格式化为 UI 文案 */
export function errorMessage(err: unknown): { code: number; message: string; details?: string[] } {
  if (err instanceof CurationError) return { code: err.code, message: err.message, details: err.details }
  return { code: 500, message: err instanceof Error ? err.message : String(err) }
}
