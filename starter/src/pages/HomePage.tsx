import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { photos, photosOfSeries, seriesList, categoryLabel } from '../data/photos'
import { useLightbox } from '../context/LightboxContext'
import { RatioImage } from '../components/RatioImage'
import { api } from '../api/client'
import type { Recommendation } from '../api/types'

const heroPhoto = photos.find((p) => p.id === 'landscape-02') ?? photos[0]

export function HomePage() {
  const { open } = useLightbox()
  const [reco, setReco] = useState<Recommendation[] | null>(null)

  useEffect(() => {
    api
      .get<{ recommendations: Recommendation[] }>('/api/home')
      .then((d) => setReco(d.recommendations))
      .catch(() => setReco([]))
  }, [])

  return (
    <div>
      <section className="hero">
        <img className="hero-img" src={`/${heroPhoto.file}`} alt={heroPhoto.altText} />
        <div className="hero-text">
          <div className="container">
            <h1>林澜</h1>
            <p className="tagline">
              独立摄影师。拍摄黑白人像的凝视，也拍摄高原无人之境与牧场日常——在光线退去的地方，等待事物自己开口。
            </p>
          </div>
        </div>
      </section>

      <div className="container">
        <div className="section-head">
          <h2>精选系列</h2>
          <span className="rule" />
          <Link to="/work" className="muted">
            全部作品 →
          </Link>
        </div>
        <div className="series-cards">
          {seriesList.map((s) => {
            const seriesPhotos = photosOfSeries(s.id)
            const cover = seriesPhotos[0]
            return (
              <article className="series-card" key={s.id}>
                <div
                  className="thumb"
                  role="button"
                  tabIndex={0}
                  aria-label={`打开《${s.title}》灯箱`}
                  onClick={() => open(seriesPhotos, 0)}
                  onKeyDown={(e) => e.key === 'Enter' && open(seriesPhotos, 0)}
                >
                  <RatioImage photo={cover} alt={cover.altText} />
                </div>
                <div className="meta">
                  <span className="cat">{categoryLabel(s.category)}</span>
                  <h3>
                    <Link to={`/work/${s.id}`}>《{s.title}》</Link>
                  </h3>
                  <p>{s.summary}</p>
                  <Link to={`/work/${s.id}`} className="muted">
                    进入系列 →
                  </Link>
                </div>
              </article>
            )
          })}
        </div>

        <div className="section-head">
          <h2>策展合集推荐</h2>
          <span className="rule" />
          <Link to="/collections" className="muted">
            合集发布台 →
          </Link>
        </div>
        {reco === null ? (
          <div className="empty-state">加载中…</div>
        ) : reco.length === 0 ? (
          <div className="empty-state" data-testid="reco-empty">
            暂无发布中的策展合集。合集发布并通过复核后会出现在这里；待复核合集与历史快照不计入推荐。
          </div>
        ) : (
          <div className="reco-grid" data-testid="reco-grid">
            {reco.map((r) => (
              <Link className="reco-card" to={`/collections/${r.collectionId}`} key={r.collectionId}>
                {r.cover && (
                  <div
                    className="ratio-box"
                    style={{ aspectRatio: '3 / 2', background: '#101010' }}
                  >
                    <img src={`/${r.cover.file}`} alt={r.cover.title} loading="lazy" />
                  </div>
                )}
                <div className="meta">
                  <span className="cat muted">
                    {r.seriesTitle} · v{r.version}
                  </span>
                  <h3>{r.title}</h3>
                  <p className="muted" style={{ margin: 0 }}>
                    {r.itemCount} 张照片 · 发布于 {new Date(r.publishedAt).toLocaleDateString('zh-CN')}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
