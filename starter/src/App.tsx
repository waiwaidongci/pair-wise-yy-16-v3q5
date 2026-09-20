import { Route, Routes } from 'react-router-dom'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { Lightbox } from './components/Lightbox'
import { HomePage } from './pages/HomePage'
import { WorkPage } from './pages/WorkPage'
import { SeriesPage } from './pages/SeriesPage'
import { AboutPage } from './pages/AboutPage'
import { ContactPage } from './pages/ContactPage'
import { CollectionsPage } from './pages/CollectionsPage'
import { CollectionDetailPage } from './pages/CollectionDetailPage'
import { ProofsPage } from './pages/ProofsPage'

export function App() {
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/work" element={<WorkPage />} />
          <Route path="/work/:seriesId" element={<SeriesPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/collections" element={<CollectionsRoute />} />
          <Route path="/collections/:id" element={<CollectionDetailPage />} />
          <Route path="/proofs" element={<ProofsPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>
      <Footer />
      {/* 全局共享灯箱：任何页面打开的都是这同一个组件实例 */}
      <Lightbox />
    </>
  )
}

function CollectionsRoute() {
  return <CollectionsPage />
}
