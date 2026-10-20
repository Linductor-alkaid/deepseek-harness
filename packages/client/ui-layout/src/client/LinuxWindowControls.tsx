/** Window controls for the Linux caption strip the frame paints. */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopWindowApi } from '../types.ts'
import { useLinuxMaximized } from './linux-window-state.ts'
import css from './LinuxWindowControls.module.css'

/** Props of the Linux caption controls. */
export type LinuxWindowControlsProps = PropsLocale<'common'>

/**
 * Minimize, maximize-restore and close controls for a frameless Linux window.
 * Linux draws no native caption, so the window has no other way to move, resize
 * or close itself; the shell answers the requests over its private channel.
 * @param props - The common locale seat.
 * @returns the three window controls, or nothing outside the desktop shell.
 */
export function LinuxWindowControls({ t }: LinuxWindowControlsProps) {
  const api = (globalThis as typeof globalThis & {
    readonly dshDesktop?: { readonly protocolVersion: number; readonly window?: DesktopWindowApi }
  }).dshDesktop?.window
  const maximized = useLinuxMaximized(api)
  if (api === undefined) return null
  return (
    <div className={css.controls}>
      <button
        type="button"
        className={css.button}
        aria-label={t('window.minimize')}
        onClick={() => { api.minimize() }}
      >
        <span className={css.minimize} />
      </button>
      <button
        type="button"
        className={css.button}
        aria-label={maximized ? t('window.restore') : t('window.maximize')}
        onClick={() => { api.toggleMaximize() }}
      >
        <span className={maximized ? css.restore : css.maximize} />
      </button>
      <button
        type="button"
        className={css.close}
        aria-label={t('close')}
        onClick={() => { api.close() }}
      >
        <span className={css.cross} />
      </button>
    </div>
  )
}
