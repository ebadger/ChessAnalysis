import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initializeTheme } from './hooks/useTheme'
import './styles.css'
import './themes.css'

const initialTheme = initializeTheme()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App initialTheme={initialTheme} />
  </StrictMode>,
)
