import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, initializeTheme, readThemePreference, resolveTheme, THEME_STORAGE_KEY } from './useTheme'

const getItem = vi.fn<(key: string) => string | null>()
const meta = { setAttribute: vi.fn() }
const root = { dataset: { theme: '' }, style: { colorScheme: '' } }

beforeEach(() => {
  getItem.mockReset().mockReturnValue(null)
  meta.setAttribute.mockReset()
  vi.stubGlobal('window', { localStorage: { getItem }, matchMedia: () => ({ matches: true }) })
  vi.stubGlobal('document', { documentElement: root, querySelector: () => meta })
})
afterEach(() => vi.unstubAllGlobals())

describe('appearance preference', () => {
  it('uses the device scheme unless a theme was explicitly selected', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
  it('applies the saved theme before rendering the application', () => {
    getItem.mockReturnValue('light')
    expect(initializeTheme()).toEqual({ preference: 'light', warning: null })
    expect(root.dataset.theme).toBe('light')
    expect(root.style.colorScheme).toBe('light')
    expect(meta.setAttribute).toHaveBeenCalledWith('content', '#f8f7f3')
    applyTheme('dark')
    expect(meta.setAttribute).toHaveBeenCalledWith('content', '#181b22')
  })
  it.each(['system', 'light', 'dark'] as const)('keeps an existing %s preference saved before the rename', (preference) => {
    getItem.mockImplementation((key) => key === 'badger-flores-theme' ? preference : null)
    expect(readThemePreference()).toEqual({ preference, warning: null })
    expect(getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY)
    expect(getItem).toHaveBeenCalledWith('badger-flores-theme')
  })
  it('prefers a new setting over an older tab writing the old preference', () => {
    getItem.mockImplementation((key) => key === THEME_STORAGE_KEY ? 'light' : 'dark')
    expect(readThemePreference()).toEqual({ preference: 'light', warning: null })
    expect(getItem).not.toHaveBeenCalledWith('badger-flores-theme')
  })
  it('surfaces invalid and inaccessible storage without breaking the theme control', () => {
    getItem.mockReturnValue('neon')
    expect(readThemePreference()).toMatchObject({ preference: 'system', warning: expect.stringContaining('not recognized') })
    getItem.mockImplementation(() => { throw new Error('storage denied') })
    expect(initializeTheme()).toMatchObject({ preference: 'system', warning: expect.stringContaining('could not read') })
    expect(root.dataset.theme).toBe('dark')
  })
})
