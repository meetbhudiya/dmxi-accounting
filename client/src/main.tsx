import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initCurrency } from './lib/currency'
import { initPaperSize } from './lib/paperSize'

initCurrency()
initPaperSize()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
