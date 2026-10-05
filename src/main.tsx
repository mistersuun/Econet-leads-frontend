import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App'

async function bootstrap() {
  // Statically replaced by Vite: when false the mock chunk is never emitted.
  if (import.meta.env.VITE_USE_MOCKS === 'true') {
    const { installMocks } = await import('./mocks')
    installMocks()
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
