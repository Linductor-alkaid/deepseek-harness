// @vitest-environment jsdom
/** The Linux caption controls: their labels come from the locale seat, their actions from the shell. */
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { LinuxWindowControls } from '../src/client/LinuxWindowControls.tsx'
import type { DesktopWindowApi } from '../src/types.ts'

/** The desktop shell's global, as the component reads it. */
interface DesktopGlobal {
  dshDesktop?: { protocolVersion: number; window?: DesktopWindowApi }
}

const scope = globalThis as DesktopGlobal

const minimize = vi.fn()
const toggleMaximize = vi.fn()
const close = vi.fn()
const listeners = new Set<(maximized: boolean) => void>()
const subscribe = vi.fn((listener: (maximized: boolean) => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
})
const bridge: DesktopWindowApi = { minimize, toggleMaximize, close, subscribe }

/** A locale seat that echoes the key it was asked for. */
const t = (key: string): string => `t:${key}`

/** Report a maximized state the way the desktop shell does. */
function reportMaximized(maximized: boolean): void {
  act(() => { for (const listener of [...listeners]) listener(maximized) })
}

afterEach(() => {
  cleanup()
  delete scope.dshDesktop
  document.documentElement.removeAttribute('data-window-maximized')
  listeners.clear()
  vi.clearAllMocks()
})

it('labels the three controls from the locale seat', () => {
  scope.dshDesktop = { protocolVersion: 1, window: bridge }
  render(<LinuxWindowControls t={t} />)
  expect(screen.getByLabelText('t:window.minimize')).toBeTruthy()
  expect(screen.getByLabelText('t:window.maximize')).toBeTruthy()
  expect(screen.getByLabelText('t:close')).toBeTruthy()
})

it('renders no controls outside the desktop shell', () => {
  const { container } = render(<LinuxWindowControls t={t} />)
  expect(container.firstChild).toBeNull()
})

it('requests the window operation each control names', () => {
  scope.dshDesktop = { protocolVersion: 1, window: bridge }
  render(<LinuxWindowControls t={t} />)
  screen.getByLabelText('t:window.minimize').click()
  screen.getByLabelText('t:window.maximize').click()
  screen.getByLabelText('t:close').click()
  expect(minimize).toHaveBeenCalledOnce()
  expect(toggleMaximize).toHaveBeenCalledOnce()
  expect(close).toHaveBeenCalledOnce()
})

it('opens on the maximized state the shell already reported', () => {
  scope.dshDesktop = { protocolVersion: 1, window: bridge }
  // The preload mirrors the reported state onto the document element.
  document.documentElement.setAttribute('data-window-maximized', '')
  render(<LinuxWindowControls t={t} />)
  expect(screen.getByLabelText('t:window.restore')).toBeTruthy()
  expect(screen.queryByLabelText('t:window.maximize')).toBeNull()
})

it('follows the maximized state the shell reports, without an unrelated re-render', () => {
  scope.dshDesktop = { protocolVersion: 1, window: bridge }
  render(<LinuxWindowControls t={t} />)
  expect(screen.getByLabelText('t:window.maximize')).toBeTruthy()
  // The shell reports the state over its private channel; the control must
  // follow it on its own, with no layout change to re-render the frame.
  expect(subscribe).toHaveBeenCalledOnce()
  reportMaximized(true)
  expect(screen.getByLabelText('t:window.restore')).toBeTruthy()
  expect(screen.queryByLabelText('t:window.maximize')).toBeNull()
  reportMaximized(false)
  expect(screen.getByLabelText('t:window.maximize')).toBeTruthy()
  expect(screen.queryByLabelText('t:window.restore')).toBeNull()
  // A repeated report of the same state changes nothing.
  reportMaximized(false)
  expect(screen.getByLabelText('t:window.maximize')).toBeTruthy()
})

it('stops following the state once it leaves the document', () => {
  scope.dshDesktop = { protocolVersion: 1, window: bridge }
  const { unmount } = render(<LinuxWindowControls t={t} />)
  expect(listeners.size).toBe(1)
  unmount()
  expect(listeners.size).toBe(0)
})
