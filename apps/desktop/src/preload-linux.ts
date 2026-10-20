/** Linux window chrome: the caption strip the renderer draws, and the state it mirrors. */

import { ipcRenderer } from 'electron'
import { DESKTOP_IPC } from './ipc.ts'
import { LINUX_TITLEBAR_HEIGHT } from './linux-layout.ts'

/**
 * Mark the document as a Linux desktop window and mirror the maximized state the
 * caption strip draws. The mark tells the renderer that the window has no native
 * frame, so the shell's own controls are the only way to move or close it.
 */
export function syncLinuxAppearance(): void {
  if (process.platform !== 'linux') return
  const mark = (): void => {
    const root = document.documentElement as HTMLElement | null
    if (root === null) return
    root.dataset.linuxTitlebar = ''
    root.style.setProperty('--dsh-linux-titlebar-height', `${LINUX_TITLEBAR_HEIGHT}px`)
  }
  // A preload runs before the document root exists on the first load.
  const root = document.documentElement as HTMLElement | null
  if (root === null) window.addEventListener('DOMContentLoaded', mark)
  else mark()
  ipcRenderer.on(DESKTOP_IPC.windowState, (_event, state: { maximized: boolean }) => {
    const element = document.documentElement as HTMLElement | null
    if (element === null) return
    element.toggleAttribute('data-window-maximized', state.maximized)
  })
}
