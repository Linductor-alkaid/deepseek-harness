/** The common vocabulary names the window controls in every shipped language. */
import { describe, expect, it } from 'vitest'
import { en, zh } from '../src/locales/index.ts'

/** The window-control labels the desktop caption strip draws. */
const WINDOW_KEYS = ['window.minimize', 'window.maximize', 'window.restore', 'close'] as const

describe('common window labels', () => {
  it('names every window control in the Chinese dictionary', () => {
    expect(zh['window.minimize']).toBe('最小化')
    expect(zh['window.maximize']).toBe('最大化')
    expect(zh['window.restore']).toBe('向下还原')
    expect(zh.close).toBe('关闭')
  })

  it('names every window control in the English dictionary', () => {
    expect(en['window.minimize']).toBe('Minimize')
    expect(en['window.maximize']).toBe('Maximize')
    expect(en['window.restore']).toBe('Restore')
    expect(en.close).toBe('Close')
  })

  it('carries the same window keys in both dictionaries', () => {
    for (const key of WINDOW_KEYS) {
      expect(Object.keys(zh), key).toContain(key)
      expect(Object.keys(en), key).toContain(key)
    }
  })
})
