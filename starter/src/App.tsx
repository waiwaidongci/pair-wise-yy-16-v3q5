import { Routes, Route, Navigate } from 'react-router-dom'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { GlobalLightbox } from './components/GlobalLightbox'
import { HomePage } from './pages/HomePage'
import { WorkPage } from './pages/WorkPage'
import { SeriesDetailPage } from './pages/SeriesDetailPage'
import { AboutPage } from './pages/AboutPage'
import { ContactPage } from './pages/ContactPage'
import { CollectionsListPage } from './pages/CollectionsListPage'
import { NewCollectionPage } from './pages/NewCollectionPage'
import { CollectionDetailPage } from './pages/CollectionDetailPage'
import { ProofRegistryPage } from './pages/ProofRegistryPage'

export default function App() {
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/work" element={<WorkPage />} />
          <Route path="/work/:seriesId" element={<SeriesDetailPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/collections" element={<CollectionsListPage />} />
          <Route path="/collections/new" element={<NewCollectionPage />} />
          <Route path="/collections/:id" element={<CollectionDetailPage />} />
          <Route path="/proofs" element={<ProofRegistryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <GlobalLightbox />
      <Footer />
    </>
  )
}
