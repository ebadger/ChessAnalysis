import { useEffect, useLayoutEffect, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ColorTheme = 'light' | 'dark'
export interface ThemeSettings {
  preference: ThemePreference
  warning: string | null
}

export const THEME_STORAGE_KEY = 'badger-flores-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

export function readThemePreference(): ThemeSettings {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (saved === null || saved === 'system') return { preference: 'system', warning: null }
    if (saved === 'light' || saved === 'dark') return { preference: saved, warning: null }
    return { preference: 'system', warning: 'The saved theme preference was not recognized. Using your device theme instead.' }
  } catch {
    return { preference: 'system', warning: 'Your browser could not read the theme preference. Appearance changes will apply to this visit.' }
  }
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ColorTheme {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference
}

export function applyTheme(theme: ColorTheme): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#181b22' : '#f8f7f3')
}

export function initializeTheme(): ThemeSettings {
  const settings = readThemePreference()
  applyTheme(resolveTheme(settings.preference, window.matchMedia(DARK_QUERY).matches))
  return settings
}

export function useTheme(initial: ThemeSettings) {
  const [preference, setPreferenceState] = useState(initial.preference)
  const [warning, setWarning] = useState(initial.warning)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(DARK_QUERY).matches)
  const theme = resolveTheme(preference, systemDark)

  useLayoutEffect(() => applyTheme(theme), [theme])
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY)
    const updateSystem = () => setSystemDark(media.matches)
    const updateSaved = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return
      const settings = readThemePreference()
      setPreferenceState(settings.preference)
      setWarning(settings.warning)
    }
    media.addEventListener('change', updateSystem)
    window.addEventListener('storage', updateSaved)
    updateSystem()
    return () => {
      media.removeEventListener('change', updateSystem)
      window.removeEventListener('storage', updateSaved)
    }
  }, [])

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
      setWarning(null)
    } catch {
      setWarning('The theme changed for this visit, but your browser could not save the preference.')
    }
  }

  return { theme, preference, warning, setPreference, toggle: () => setPreference(theme === 'dark' ? 'light' : 'dark') }
}
