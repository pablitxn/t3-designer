import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import { i18n } from './i18n/instance'
import { listenForLanguageChanges } from './i18n/preferences'
import { initializeTheme } from './lib/theme'
import { loadSiteConfig } from './lib/site-config'
import './index.css'
import './theme.css'
import './private/tailwind.css'

initializeTheme()
// Language events can arrive while the optional public profile is still loading.
const stopLanguageChanges = listenForLanguageChanges()
if (import.meta.hot) import.meta.hot.dispose(stopLanguageChanges)

async function mount() {
  await loadSiteConfig({ origin: window.location.origin, baseUrl: import.meta.env.BASE_URL })
  // Analytics and policy capture the validated profile only after it is available.
  const { default: App } = await import('./App')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}><App /></I18nextProvider>
    </StrictMode>,
  )
}
void mount()
