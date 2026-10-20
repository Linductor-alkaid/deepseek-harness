// @vitest-environment jsdom
/** Linux window chrome: the caption marker the frame paints and the state it mirrors. */
import { afterEach, expect, it, vi } from 'vitest'
import { DESKTOP_IPC } from '../src/ipc.ts'
import { LINUX_TITLEBAR_HEIGHT } from '../src/linux-layout.ts'
import { syncLinuxAppearance } from '../src/preload-linux.ts'

const on = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ ipcRenderer: { on } }))

/** The document root, captured before a test hides it behind the getter. */
const root = document.documentElement

/** A document view whose root may be absent, as it is before the first parse completes. */
interface RootlessDocument {
  readonly documentElement: HTMLElement | null
}

afterEach(() => {
  root.removeAttribute('data-linux-titlebar')
  root.removeAttribute('data-window-maximized')
  root.style.removeProperty('--dsh-linux-titlebar-height')
  vi.restoreAllMocks()
  on.mockClear()
})

it.each(['darwin', 'win32'] as const)('marks no Linux caption row on %s', (platform) => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue(platform)
  syncLinuxAppearance()
  expect(root.hasAttribute('data-linux-titlebar')).toBe(false)
  expect(root.style.getPropertyValue('--dsh-linux-titlebar-height')).toBe('')
  expect(on).not.toHaveBeenCalled()
})

it('marks the Linux caption row and publishes its height', () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
  syncLinuxAppearance()
  expect(root.hasAttribute('data-linux-titlebar')).toBe(true)
  expect(root.style.getPropertyValue('--dsh-linux-titlebar-height')).toBe(`${LINUX_TITLEBAR_HEIGHT}px`)
  expect(on).toHaveBeenCalledExactlyOnceWith(DESKTOP_IPC.windowState, expect.any(Function))
})

it('defers the mark until the document root exists', () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
  // A preload runs before the document root on the first load.
  const getter = vi.spyOn(document as RootlessDocument, 'documentElement', 'get').mockReturnValue(null)
  syncLinuxAppearance()
  expect(root.hasAttribute('data-linux-titlebar')).toBe(false)
  getter.mockRestore()
  window.dispatchEvent(new Event('DOMContentLoaded'))
  expect(root.hasAttribute('data-linux-titlebar')).toBe(true)
  expect(root.style.getPropertyValue('--dsh-linux-titlebar-height')).toBe(`${LINUX_TITLEBAR_HEIGHT}px`)
})

it('mirrors the maximized state onto the document element', () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
  syncLinuxAppearance()
  const handler = on.mock.calls[0]?.[1] as (event: unknown, state: { maximized: boolean }) => void
  handler({}, { maximized: true })
  expect(root.hasAttribute('data-window-maximized')).toBe(true)
  handler({}, { maximized: false })
  expect(root.hasAttribute('data-window-maximized')).toBe(false)
})
