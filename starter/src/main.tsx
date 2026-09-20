import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { GalleryProvider } from './store/gallery'
import { CurationProvider } from './store/curation'
import './styles/global.css'
import './styles/pages.css'
import './styles/lightbox.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <CurationProvider>
        <GalleryProvider>
          <App />
        </GalleryProvider>
      </CurationProvider>
    </BrowserRouter>
  </StrictMode>,
)
