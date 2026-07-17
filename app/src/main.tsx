import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import DataProbe from './DataProbe.tsx'

const isProbe = import.meta.env.DEV && window.location.hash === '#probe'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isProbe ? <DataProbe /> : (
      <>
        <App />
        {/* Slice 5.6: reserved ad zones, present on every screen without
            each screen needing to know about them -- see index.css. */}
        <div className="ad-rail ad-rail-left" aria-hidden="true" />
        <div className="ad-rail ad-rail-right" aria-hidden="true" />
        <div className="ad-banner-bottom" aria-hidden="true" />
      </>
    )}
  </StrictMode>,
)
