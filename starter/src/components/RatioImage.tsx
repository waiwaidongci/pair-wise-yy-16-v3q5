import { photoSrc, type Photo } from '../data/photos'

/**
 * CLS 防护图片：加载完成前，容器按数据中的真实宽高比预留空间。
 * width/height 属性 + CSS aspect-ratio 双保险，布局不会因图片加载而位移。
 */
export function RatioImage({
  photo,
  src,
  alt,
  className,
  eager,
}: {
  photo: Pick<Photo, 'width' | 'height'>
  src?: string
  alt: string
  className?: string
  eager?: boolean
}) {
  return (
    <div
      className={`ratio-box${className ? ` ${className}` : ''}`}
      style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
    >
      <img
        src={src ?? photoSrc(photo as Photo)}
        alt={alt}
        width={photo.width}
        height={photo.height}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
      />
    </div>
  )
}
