/**
 * 全局共享灯箱组件（不是独立路由）。
 * 导航范围由 store/gallery 传入的 visiblePhotos 决定（筛选后只在子集内循环）。
 * 桌面端说明为侧边浮层；移动端（≤760px）切换为底部信息条（约束 5）。
 */
import { useEffect } from 'react'
import type { Photo } from '../data/content'
import { categoryLabel } from '../data/content'
import { RatioBox } from './RatioBox'

export function Lightbox({
  photo,
  index,
  total,
  onPrev,
  onNext,
  onClose,
}: {
  photo: Photo
  index: number
  total: number
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onPrev, onNext, onClose])

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`照片灯箱：${photo.title}`}
      onClick={onClose}
    >
      <button type="button" className="lightbox-close" aria-label="关闭" onClick={onClose}>
        ✕
      </button>
      <button type="button" className="lightbox-nav prev" aria-label="上一张" onClick={(e) => { e.stopPropagation(); onPrev() }}>
        ‹
      </button>
      <button type="button" className="lightbox-nav next" aria-label="下一张" onClick={(e) => { e.stopPropagation(); onNext() }}>
        ›
      </button>

      <figure className="lightbox-figure" onClick={(e) => e.stopPropagation()}>
        <RatioBox width={photo.width} height={photo.height} className="lightbox-image-wrap">
          <img
            className="lightbox-image"
            src={`/${photo.file}`}
            alt={photo.altText}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </RatioBox>
        <figcaption className="lightbox-info">
          <p className="eyebrow">
            {categoryLabel(photo.category)} · {index + 1} / {total}
          </p>
          <h2>{photo.title}</h2>
          <p className="lightbox-caption">{photo.caption}</p>
        </figcaption>
      </figure>
    </div>
  )
}
