// 权威内容数据（mock-data/photos.json 的同步拷贝，由 scripts/sync-assets.mjs 生成）
// 全站所有页面共享这一份数据模型，禁止在组件里另写重复的照片列表。
import data from './photos.json'

export interface Category {
  id: string
  label: string
}

export interface Series {
  id: string
  title: string
  category: string
  summary: string
  photoIds: string[]
}

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

export const categories = data.categories as Category[]
export const seriesList = data.series as Series[]
export const photos = data.photos as Photo[]

const photoIndex = new Map(photos.map((p) => [p.id, p]))

export function photoById(id: string): Photo | undefined {
  return photoIndex.get(id)
}

export function seriesById(id: string): Series | undefined {
  return seriesList.find((s) => s.id === id)
}

export function categoryLabel(id: string): string {
  return categories.find((c) => c.id === id)?.label ?? id
}

/** 系列照片：从同一份数据模型按 seriesId 派生，按 order 排序 */
export function photosOfSeries(seriesId: string): Photo[] {
  return photos.filter((p) => p.seriesId === seriesId).sort((a, b) => a.order - b.order)
}

export function photoSrc(photo: Pick<Photo, 'file'>): string {
  return `/${photo.file}`
}
