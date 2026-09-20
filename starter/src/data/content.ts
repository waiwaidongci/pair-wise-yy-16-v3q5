/** 权威内容数据（mock-data/photos.json）的只读访问 helper */
import raw from '../data/photos.json'

export interface Photo {
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
}

export interface Series {
  id: string
  title: string
  category: string
  summary: string
  photoIds: string[]
}

export const categories = raw.categories as { id: string; label: string }[]
export const series = raw.series as Series[]
export const photos = raw.photos as Photo[]

const byId = new Map(photos.map((p) => [p.id, p]))

export function photoById(id: string): Photo {
  const p = byId.get(id)
  if (!p) throw new Error(`unknown photo: ${id}`)
  return p
}

export function seriesById(id: string): Series {
  const s = series.find((x) => x.id === id)
  if (!s) throw new Error(`unknown series: ${id}`)
  return s
}

export function photosByCategory(category: string): Photo[] {
  // "全部"保持 photos.json 的原始顺序（权威数据顺序）
  return category === 'all' ? photos : photos.filter((p) => p.category === category)
}

export function photosBySeries(seriesId: string): Photo[] {
  return photos
    .filter((p) => p.seriesId === seriesId)
    .sort((a, b) => a.order - b.order)
}

export function categoryLabel(id: string): string {
  return categories.find((c) => c.id === id)?.label ?? id
}
