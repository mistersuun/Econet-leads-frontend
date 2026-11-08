import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App'
import { API_URL_MISSING, MISSING_API_URL_MESSAGE } from './api/client'

function showConfigError() {
  const root = document.getElementById('root')!
  const box = document.createElement('div')
  box.setAttribute('role', 'alert')
  box.style.cssText =
    'max-width:640px;margin:15vh auto;padding:24px;border:2px solid #b00020;border-radius:8px;background:#fdecea;color:#5f0010;font-family:system-ui,sans-serif'
  const h = document.createElement('h1')
  h.style.cssText = 'margin:0 0 12px;font-size:20px'
  h.textContent = MISSING_API_URL_MESSAGE
  const p = document.createElement('p')
  p.style.margin = '0'
  p.textContent =
    "L'application ne sait pas où joindre le serveur. Dans Netlify : Site configuration > Environment variables, ajoutez VITE_API_URL (l'adresse du backend Render, sans « / » final), puis relancez un déploiement."
  box.append(h, p)
  root.replaceChildren(box)
}

async function bootstrap() {
  if (API_URL_MISSING) {
    showConfigError()
    return
  }
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
