import { Link } from 'react-router-dom'
import { series, photosBySeries } from '../data/content'
import { useGallery } from '../store/gallery'
import { RatioBox } from '../components/RatioBox'
import { useCuration, selectRecommendedSnapshots } from '../store/curation'
import { photoById } from '../data/content'

export function HomePage() {
  const { openLightbox } = useGallery()
  const { data } = useCuration()
  const recommended = selectRecommendedSnapshots(data)

  return (
    <>
      <section className="hero container">
        <RatioBox width={16} height={9} className="hero-frame">
          <img
            src="/photos/landscape/landscape-05.jpg"
            alt="雾气笼罩的高原山谷，作为首页主视觉"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div className="hero-overlay">
            <h1>Remanina Holmson</h1>
            <p>独立摄影师，以极简而克制的影像记录肖像的坦露、无人区的地貌与高原牧场的日常。</p>
          </div>
        </RatioBox>
      </section>

      <div className="container">
        <hr className="gold-rule" />
      </div>

      <section className="container featured">
        <h2 className="section-heading">featured works</h2>
        <div className="series-grid">
          {series.map((s) => {
            const cover = photosBySeries(s.id)[0]
            return (
              <button
                type="button"
                key={s.id}
                className="series-card"
                onClick={() => openLightbox(cover)}
                aria-label={`预览 ${s.title} 系列封面`}
              >
                <RatioBox width={cover.width} height={cover.height}>
                  <img
                    src={`/${cover.file}`}
                    alt={cover.altText}
                    loading="lazy"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <span className="series-card-label">
                    <strong>{s.title}</strong>
                    <em>{s.summary.slice(0, 18)}…</em>
                  </span>
                </RatioBox>
              </button>
            )
          })}
        </div>
        <p className="featured-hint">点击封面预览照片，或进入 <Link to="/work">作品集</Link> 查看全部作品。</p>
      </section>

      <section className="container curation-rec">
        <div className="section-head-row">
          <h2 className="section-heading">策展合集推荐</h2>
          <Link to="/collections" className="btn btn-ghost">全部合集</Link>
        </div>
        {recommended.length === 0 ? (
          <p className="empty-hint">当前没有线上推荐合集。</p>
        ) : (
          <div className="rec-grid">
            {recommended.map((snap) => {
              const cover = photoById(snap.entries[0]?.photoId ?? '')
              return (
                <Link key={snap.snapshotId} to={`/collections/${snap.collectionId}`} className="rec-card">
                  <RatioBox width={cover.width} height={cover.height}>
                    <img
                      src={`/${cover.file}`}
                      alt={cover.altText}
                      loading="lazy"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </RatioBox>
                  <span className="badge published">已发布</span>
                  <h3>{snap.title}</h3>
                  <p className="mono">第 {snap.generation} 代 · 指纹 {snap.contentFingerprint}</p>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </>
  )
}
