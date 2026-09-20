import { useEffect } from 'react'
import { useLightbox } from '../context/LightboxContext'
import { categoryLabel, photoSrc } from '../data/photos'

/**
 * 全局共享灯箱：全站唯一的灯箱实例，任何页面通过 useLightbox().open() 打开。
 * 导航范围 = 打开时传入的照片数组（调用方负责传入当前筛选/系列子集）。
 */
export function Lightbox() {
  const { state, close, next, prev } = useLightbox()

  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [state, close, next, prev])

  if (!state) return null
  const photo = state.photos[state.index]

  return (
    <div className="lightbox-overlay" data-testid="lightbox" role="dialog" aria-modal="true" aria-label={photo.title}>
      <button className="lightbox-btn lightbox-close" data-testid="lightbox-close" onClick={close} aria-label="关闭">
        ×
      </button>
      <button
        className="lightbox-btn lightbox-prev"
        data-testid="lightbox-prev"
        onClick={prev}
        aria-label="上一张"
      >
        ‹
      </button>
      <figure className="lightbox-stage" style={{ margin: 0 }}>
        <img
          key={photo.id}
          src={photoSrc(photo)}
          alt={photo.altText}
          width={photo.width}
          height={photo.height}
          data-testid="lightbox-image"
          data-photo-id={photo.id}
        />
        <figcaption className="lightbox-caption" data-testid="lightbox-caption">
          <span className="lb-title">{photo.title}</span>
          <span className="lb-cat">{categoryLabel(photo.category)}</span>
          <span className="lb-caption">{photo.caption}</span>
          <span className="lb-counter" data-testid="lightbox-counter">
            {state.index + 1} / {state.photos.length}
          </span>
        </figcaption>
      </figure>
      <button
        className="lightbox-btn lightbox-next"
        data-testid="lightbox-next"
        onClick={next}
        aria-label="下一张"
      >
        ›
      </button>
    </div>
  )
}
