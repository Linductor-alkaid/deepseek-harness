/** Linux packaging surface: an unsigned Debian package and AppImage with no signature, feed or policy. */

import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { DesktopElectronBuilderConfig } from '../electron-builder.config.mjs'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'
import { prepareDesktopCli } from '../scripts/prepare-cli.ts'

/**
 * The Debian block electron-builder reads. The hand-written configuration
 * declaration names only the Linux section, so the Debian fields are reached
 * through this narrow view of the runtime object.
 */
interface LinuxDebBlock {
  readonly maintainer: string
  readonly depends: readonly string[]
}

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function linuxEnvironment(): NodeJS.ProcessEnv {
  return {
    DSH_DESKTOP_APP_ID: 'com.deepseek.harness',
    DSH_DESKTOP_TARGET_PLATFORM: 'linux',
    DSH_DESKTOP_TARGET_ARCH: 'x64',
    DSH_DESKTOP_UNSIGNED: '1',
  }
}

function linuxConfig(environment: NodeJS.ProcessEnv = linuxEnvironment()): DesktopElectronBuilderConfig {
  return createElectronBuilderConfig(environment, 'linux', 'x64')
}

function debBlock(config: DesktopElectronBuilderConfig): LinuxDebBlock {
  return (config as DesktopElectronBuilderConfig & { readonly deb: LinuxDebBlock }).deb
}

describe('Linux desktop packaging', () => {
  it('builds an unsigned Debian package and AppImage named for the application, without an update feed', () => {
    const config = linuxConfig()
    expect(config).toMatchObject({
      linux: {
        category: 'Development',
        // A slash or a space makes update-alternatives reject the alternative and
        // makes gtk-update-icon-cache call the hicolor cache invalid.
        executableName: 'deepseek-harness',
        icon: fileURLToPath(new URL('../resources/icons', import.meta.url)),
        // Chromium capitalizes the executable name's first letter into the X11
        // WM_CLASS; the entry must carry that exact class for the dock to
        // associate the running window with this launcher.
        desktop: { entry: { StartupWMClass: 'Deepseek-harness' } },
        syncDesktopName: true,
        target: ['deb', 'AppImage'],
      },
      artifactName: 'deepseek-harness-${version}-${os}-${arch}-unsigned.${ext}',
      publish: null,
    })
  })

  it('ships the launcher icon set in the standard hicolor size directories', () => {
    const iconDirectory = fileURLToPath(new URL('../resources/icons', import.meta.url))
    // A desktop entry resolves Icon= only through the size directories hicolor's
    // index.theme declares; a single PNG at the artwork's native size installs
    // under a directory no GTK3 desktop reads.
    expect(readdirSync(iconDirectory).sort()).toEqual([
      '128x128.png',
      '16x16.png',
      '24x24.png',
      '256x256.png',
      '32x32.png',
      '48x48.png',
      '512x512.png',
      '64x64.png',
    ])
  })

  it('declares the Debian maintainer and the runtime libraries the package needs', () => {
    const deb = debBlock(linuxConfig())
    expect(deb.maintainer).toBe('DeepSeek Harness')
    // The 64-bit time_t transition renamed the GTK, AT-SPI and ALSA packages, so
    // each entry offers the t64 name first and the original name as the alternative.
    // bubblewrap is the confined-shell runner; older releases ship nothing that pulls it in.
    expect(deb.depends).toEqual([
      'libgtk-3-0t64 | libgtk-3-0',
      'libnotify4',
      'libnss3',
      'libxss1',
      'libxtst6',
      'xdg-utils',
      'bubblewrap',
      'libatspi2.0-0t64 | libatspi2.0-0',
      'libuuid1',
      'libsecret-1-0',
      'libasound2t64 | libasound2',
      'libgbm1',
      'libdrm2',
      'libxkbcommon0',
    ])
  })

  it('takes the Debian maintainer from the packaging environment', () => {
    const deb = debBlock(linuxConfig({ ...linuxEnvironment(), DSH_DESKTOP_DEB_MAINTAINER: 'Packaging Team <pack@example.com>' }))
    expect(deb.maintainer).toBe('Packaging Team <pack@example.com>')
  })

  it('carries no mandatory-update policy on an unsigned Linux target', () => {
    const config = linuxConfig()
    expect(config.extraMetadata).not.toHaveProperty('dshMandatoryUpdatePolicy')
    expect(config.extraMetadata).toMatchObject({ dshDesktopAppId: 'com.deepseek.harness' })
  })

  it('prepares an executable POSIX launcher for Linux', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-linux-cli-'))
    roots.push(root)
    const destination = join(root, 'cli')
    prepareDesktopCli(destination, 'linux')
    const command = join(destination, 'bin', 'dsh')
    // libuv reports 0o666 for every Windows file, so the executable bit the
    // launcher carries is only representable — and only assertable — on a
    // POSIX host, where the chmod in prepareDesktopCli takes effect.
    if (process.platform !== 'win32') expect(statSync(command).mode & 0o777).toBe(0o755)
  })
})
