/**
 * /work 页面的筛选状态：放在全局 store 而非 /work 组件内部，
 * 这样进入系列详情页再返回时筛选条件保持（task.md 约束 1），
 * 同时灯箱作为全局共享组件也能拿到「当前筛选结果」作为导航范围（约束 2）。
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { photosByCategory, type Photo } from '../data/content'

export type CategoryFilter = 'all' | string

interface GalleryState {
  filter: CategoryFilter
  setFilter: (f: CategoryFilter) => void
  /** 当前筛选结果 —— 灯箱导航严格限定在此集合内 */
  visiblePhotos: Photo[]
  /** 灯箱当前打开的照片（来自 visiblePhotos） */
  lightboxPhoto: Photo | null
  openLightbox: (photo: Photo) => void
  closeLightbox: () => void
  /** 在当前筛选结果内步进（循环） */
  stepLightbox: (delta: 1 | -1) => void
}

const GalleryContext = createContext<GalleryState | null>(null)

export function GalleryProvider({ children }: { children: ReactNode }) {
  const [filter, setFilter] = useState<CategoryFilter>('all')
  const [lightboxPhoto, setLightboxPhoto] = useState<Photo | null>(null)

  const visiblePhotos = useMemo(() => photosByCategory(filter), [filter])

  const openLightbox = useCallback((photo: Photo) => setLightboxPhoto(photo), [])
  const closeLightbox = useCallback(() => setLightboxPhoto(null), [])

  const stepLightbox = useCallback(
    (delta: 1 | -1) => {
      setLightboxPhoto((current) => {
        if (!current) return current
        const idx = visiblePhotos.findIndex((p) => p.id === current.id)
        if (idx === -1) return current
        const next = (idx + delta + visiblePhotos.length) % visiblePhotos.length
        return visiblePhotos[next]
      })
    },
    [visiblePhotos],
  )

  const value = useMemo(
    () => ({ filter, setFilter, visiblePhotos, lightboxPhoto, openLightbox, closeLightbox, stepLightbox }),
    [filter, visiblePhotos, lightboxPhoto, openLightbox, closeLightbox, stepLightbox],
  )

  return <GalleryContext.Provider value={value}>{children}</GalleryContext.Provider>
}

export function useGallery(): GalleryState {
  const ctx = useContext(GalleryContext)
  if (!ctx) throw new Error('useGallery 必须在 GalleryProvider 内使用')
  return ctx
}
