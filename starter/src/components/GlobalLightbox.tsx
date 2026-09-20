/** 把 gallery store 接到全局 Lightbox：任意页面打开的都是同一个灯箱实例 */
import { useGallery } from '../store/gallery'
import { Lightbox } from './Lightbox'

export function GlobalLightbox() {
  const { visiblePhotos, lightboxPhoto, closeLightbox, stepLightbox } = useGallery()
  if (!lightboxPhoto) return null
  const idx = visiblePhotos.findIndex((p) => p.id === lightboxPhoto.id)
  return (
    <Lightbox
      photo={lightboxPhoto}
      index={idx < 0 ? 0 : idx}
      total={visiblePhotos.length}
      onPrev={() => stepLightbox(-1)}
      onNext={() => stepLightbox(1)}
      onClose={closeLightbox}
    />
  )
}
