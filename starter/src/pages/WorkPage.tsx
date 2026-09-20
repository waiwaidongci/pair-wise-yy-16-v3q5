import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { categories, photos, categoryLabel } from '../data/photos'
import { useLightbox } from '../context/LightboxContext'
import { RatioImage } from '../components/RatioImage'

const FILTER_KEY = 'work.filter'

/**
 * 作品集网格。
 * 筛选状态双保险：URL 查询参数（可分享、刷新后保留）+ sessionStorage
 * （进入系列详情页再返回时，即使不带参数也能恢复）。
 */
export function WorkPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { open } = useLightbox()

  const active =
    searchParams.get('cat') ?? sessionStorage.getItem(FILTER_KEY) ?? 'all'

  const setFilter = (cat: string) => {
    sessionStorage.setItem(FILTER_KEY, cat)
    setSearchParams(cat === 'all' ? {} : { cat }, { replace: false })
  }

  const visible = useMemo(
    () => (active === 'all' ? photos : photos.filter((p) => p.category === active)),
    [active],
  )

  return (
    <div className="container page">
      <h1 className="page-title">作品</h1>
      <p className="page-sub">全部 {photos.length} 张照片，按分类筛选。点击任意照片打开灯箱。</p>

      <div className="filter-bar" role="group" aria-label="按分类筛选">
        {[{ id: 'all', label: '全部' }, ...categories].map((c) => (
          <button
            key={c.id}
            className="chip"
            aria-pressed={active === c.id}
            data-filter={c.id}
            onClick={() => setFilter(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="masonry" data-testid="work-grid">
        {visible.map((photo, i) => (
          <div className="masonry-item" key={photo.id}>
            <article className="photo-card" data-photo-id={photo.id} data-category={photo.category}>
              <div
                className="thumb"
                role="button"
                tabIndex={0}
                aria-label={`打开 ${photo.title} 灯箱`}
                onClick={() => open(visible, i)}
                onKeyDown={(e) => e.key === 'Enter' && open(visible, i)}
              >
                <RatioImage photo={photo} alt={photo.altText} />
              </div>
              <div className="caption-row">
                <div className="t">{photo.title}</div>
                <div className="c">{categoryLabel(photo.category)}</div>
              </div>
            </article>
          </div>
        ))}
      </div>
    </div>
  )
}
