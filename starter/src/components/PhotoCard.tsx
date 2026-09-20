import { useState } from 'react'
import type { Photo } from '../data/content'
import { RatioBox } from './RatioBox'

/** 网格中的照片卡片；点击打开全局灯箱 */
export function PhotoCard({
  photo,
  onOpen,
  indexLabel,
}: {
  photo: Photo
  onOpen: (p: Photo) => void
  indexLabel?: string
}) {
  const [loaded, setLoaded] = useState(false)
  return (
    <button
      type="button"
      className="photo-button"
      onClick={() => onOpen(photo)}
      style={{
        display: 'block',
        width: '100%',
        padding: 0,
        border: 'none',
        background: 'none',
        textAlign: 'left',
        color: 'inherit',
      }}
      aria-label={`查看照片：${photo.title}`}
    >
      <RatioBox width={photo.width} height={photo.height} className="photo-frame">
        <img
          src={`/${photo.file}`}
          alt={photo.altText}
          width={photo.width}
          height={photo.height}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 0.4s ease',
          }}
        />
      </RatioBox>
      <span className="photo-meta" style={{ display: 'block', padding: '10px 2px 4px' }}>
        <strong style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', fontWeight: 600 }}>
          {photo.title}
        </strong>
        {indexLabel ? <span className="visually-hidden">{indexLabel}</span> : null}
      </span>
    </button>
  )
}
