import { useParams, Link } from 'react-router-dom'
import { photosBySeries, seriesById } from '../data/content'
import { useGallery } from '../store/gallery'
import { RatioBox } from '../components/RatioBox'

/** 系列详情：叙事式长图文，图文交替 + 引用摘要；数据与 /work 同源（约束 4） */
export function SeriesDetailPage() {
  const { seriesId = '' } = useParams()
  const { openLightbox } = useGallery()
  const series = seriesById(seriesId)
  const list = photosBySeries(seriesId)
  const cover = list[0]

  return (
    <div className="series-page">
      <section className="series-hero">
        <RatioBox width={cover.width} height={Math.round(cover.height * 0.52)}>
          <img
            src={`/${cover.file}`}
            alt={cover.altText}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <h1 className="series-hero-title">{series.title}</h1>
        </RatioBox>
      </section>

      <div className="container story">
        <p className="pull-quote">{series.summary}</p>
        <hr className="gold-rule" />

        {list.map((p, i) => {
          const reverse = i % 2 === 1
          return (
            <article className={`story-row ${reverse ? 'reverse' : ''}`} key={p.id}>
              <button
                type="button"
                className="photo-button story-photo"
                onClick={() => openLightbox(p)}
                aria-label={`查看照片：${p.title}`}
                style={{ padding: 0, border: 'none', background: 'none', color: 'inherit' }}
              >
                <RatioBox width={p.width} height={p.height}>
                  <img
                    src={`/${p.file}`}
                    alt={p.altText}
                    loading="lazy"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </RatioBox>
              </button>
              <div className="story-text">
                <p className="eyebrow">{String(i + 1).padStart(2, '0')}</p>
                <h2>{p.title}</h2>
                <p>{p.caption}</p>
                {i === 1 && (
                  <blockquote className="pull-quote small">
                    “镜头前的坦露与防备，往往同时发生。”
                  </blockquote>
                )}
              </div>
            </article>
          )
        })}

        <div className="series-back">
          <Link to="/work" className="btn btn-ghost">← 返回作品集</Link>
          <Link to={`/collections/new?seriesId=${series.id}`} className="btn">
            以此系列策展
          </Link>
        </div>
      </div>
    </div>
  )
}
