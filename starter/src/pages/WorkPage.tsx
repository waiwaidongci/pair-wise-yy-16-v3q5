import { Link } from 'react-router-dom'
import { useGallery } from '../store/gallery'
import { categories, series } from '../data/content'
import { PhotoCard } from '../components/PhotoCard'

const FILTERS = [{ id: 'all', label: '全部' }, ...categories.map((c) => ({ id: c.id, label: c.label }))]

export function WorkPage() {
  const { filter, setFilter, visiblePhotos, openLightbox } = useGallery()

  return (
    <div className="container work-page">
      <div className="filters" role="group" aria-label="按分类筛选">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className="chip"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <nav className="series-links" aria-label="系列入口">
        {series.map((s) => (
          <Link key={s.id} to={`/work/${s.id}`} className="series-link">
            {s.title}
          </Link>
        ))}
      </nav>

      <p className="filter-count" aria-live="polite">
        共 {visiblePhotos.length} 张照片
      </p>

      <div className="masonry">
        {visiblePhotos.map((p) => (
          <div className="masonry-item" key={p.id}>
            <PhotoCard photo={p} onOpen={openLightbox} />
          </div>
        ))}
      </div>
    </div>
  )
}
