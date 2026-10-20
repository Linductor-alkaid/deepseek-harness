/** Client-owned observation of the desktop shell's window state. */
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { DesktopWindowApi } from '../types.ts'

/**
 * Owns one preload subscription and publishes the maximized state to the
 * caption controls. The shell reports the state; the controls read it.
 */
class LinuxWindowStateSource {
  private readonly listeners = new Set<() => void>()
  private maximized: boolean
  private unsubscribe: (() => void) | undefined

  /** @param bridge - Optional isolated Electron API, absent in ordinary browsers. */
  constructor(private readonly bridge: DesktopWindowApi | undefined) {
    this.maximized = document.documentElement.hasAttribute('data-window-maximized')
  }

  /** Start following the shell's state; the effect that owns it calls this. */
  connect(): void {
    this.unsubscribe = this.bridge?.subscribe((maximized) => {
      if (this.maximized === maximized) return
      this.maximized = maximized
      this.listeners.forEach((listener) => { listener() })
    })
  }

  /** @returns the current maximized state. */
  getSnapshot = (): boolean => this.maximized

  /**
   * Follow the maximized state.
   * @param listener - Called after the state changes.
   * @returns a callback that stops the subscription.
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Detach the carrier and ignore any pending state. */
  dispose(): void { this.unsubscribe?.() }
}

/**
 * Read the maximized state the desktop shell reports for the window.
 * @param bridge - Optional isolated Electron API, absent in ordinary browsers.
 * @returns whether the window is maximized.
 */
export function useLinuxMaximized(bridge: DesktopWindowApi | undefined): boolean {
  const source = useMemo(() => new LinuxWindowStateSource(bridge), [bridge])
  useEffect(() => {
    source.connect()
    return () => { source.dispose() }
  }, [source])
  return useSyncExternalStore(source.subscribe, source.getSnapshot)
}
