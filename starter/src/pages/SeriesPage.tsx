import { Navigate, useParams } from 'react-router-dom'
import { categoryLabel, photosOfSeries, seriesById } from '../data/photos'
import { useLightbox } from '../context/LightboxContext'
import { RatioImage } from '../components/RatioImage'

/**
 * 系列详情页：叙事式长图文排版。
 * 照片集合、顺序与说明文字全部从共享数据模型（mock-data/photos.json）
 * 按 seriesId 派生，不单独硬编码任何照片列表。
 */
export function SeriesPage() {
  const { seriesId } = useParams<{ seriesId: string }>()
  const { open } = useLightbox()
  const series = seriesId ? seriesById(seriesId) : undefined

  if (!series) return <Navigate to="/work" replace />

  const seriesPhotos = photosOfSeries(series.id)
  const hero = seriesPhotos[0]
  const midQuoteAt = Math.ceil(seriesPhotos.length / 2)

  return (
    <div>
      <section className="series-hero">
        <img src={`/${hero.file}`} alt={hero.altText} />
        <div className="overlay">
          <h1>《{series.title}》</h1>
        </div>
      </section>

      <div className="container">
        <blockquote className="pull-quote" data-testid="series-summary">
          “{series.summary}”
        </blockquote>

        {seriesPhotos.map((photo, i) => (
          <div key={photo.id}>
            {i === midQuoteAt && (
              <blockquote className="pull-quote">“{photo.caption}”</blockquote>
            )}
            <section
              className={`narrative-block${i % 2 === 1 ? ' flip' : ''}`}
              data-photo-id={photo.id}
            >
              <div
                className="block-media"
                role="button"
                tabIndex={0}
                aria-label={`打开 ${photo.title} 灯箱`}
                onClick={() => open(seriesPhotos, i)}
                onKeyDown={(e) => e.key === 'Enter' && open(seriesPhotos, i)}
              >
                <RatioImage photo={photo} alt={photo.altText} />
              </div>
              <div className="block-text">
                <span className="seq">
                  {String(photo.order).padStart(2, '0')} · {categoryLabel(photo.category)}
                </span>
                <h3>{photo.title}</h3>
                <p>{photo.caption}</p>
                <p className="faint">{photo.altText}</p>
              </div>
            </section>
          </div>
        ))}
      </div>
    </div>
  )
}
