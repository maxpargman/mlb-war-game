import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import DataProbe from './DataProbe.tsx'

const isProbe = window.location.hash === '#probe'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isProbe ? <DataProbe /> : <App />}
  </StrictMode>,
)
