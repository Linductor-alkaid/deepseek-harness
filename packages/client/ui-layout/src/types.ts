/** Window operations the desktop shell offers to the renderer. */

/** One window operation the renderer's caption controls request. */
export type DesktopWindowAction = 'minimize' | 'maximize' | 'close'

/** Window operations the desktop shell exposes to the renderer. */
export interface DesktopWindowApi {
  /** Minimize the window. */
  minimize(): void
  /** Maximize the window, or restore it when it is already maximized. */
  toggleMaximize(): void
  /**
   * Close the window. A platform without a Dock or a tray has no way back to a
   * hidden window, so the shell quits the application instead of hiding it.
   */
  close(): void
  /**
   * Follow the maximized state the shell reports.
   * @param listener - Receives the new maximized state.
   * @returns a callback that stops the subscription.
   */
  subscribe(listener: (maximized: boolean) => void): () => void
}
