/** The packaging-run stage name each target platform records. */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'

const observed = vi.hoisted(() => ({ stages: [] as string[], root: '' }))
vi.mock('../scripts/desktop-package-environment.mjs', () => ({
  loadDesktopPackageEnvironment: () => ({ DSH_DESKTOP_APP_ID: 'com.deepseek.harness' }),
  localMacOSPackageEnvironment: () => ({ DSH_DESKTOP_APP_ID: 'com.deepseek.harness' }),
  validateDesktopPackageEnvironment: () => {},
}))
vi.mock('../scripts/macos-signing-keychain.mjs', () => ({
  withMacOSSigningKeychain: async (_environment: object, action: (environment: object) => Promise<unknown>) => action({}),
}))
// The host probes are not the subject of this suite.
vi.mock('../scripts/desktop-toolchain-preflight.ts', () => ({ requireDesktopToolchain: async () => {} }))
vi.mock('../scripts/packaging-step.mjs', () => ({
  // The stage name is the subject; the package stage must not run a build.
  packagingStep: vi.fn(async (_directory: string, stage: string, operation: () => Promise<void>) => {
    observed.stages.push(stage)
    if (stage.endsWith('-package')) throw new Error('stage refused')
    await operation()
  }),
  packagingErrorDetails: () => 'stage refused',
}))
vi.mock('../scripts/packaging-run.mjs', async (importOriginal) => {
  const original = await importOriginal<typeof import('../scripts/packaging-run.mjs')>()
  return { ...original, createPackagingRun: (...args: Parameters<typeof original.createPackagingRun>) => (
    original.createPackagingRun(observed.root, args[1], args[2])) }
})

const roots: string[] = []
afterEach(async () => {
  observed.stages.length = 0
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function stageNamesFor(platform: 'win32' | 'darwin' | 'linux', target: string): Promise<string[]> {
  observed.stages.length = 0
  observed.root = await mkdtemp(join(tmpdir(), 'package-stage-'))
  roots.push(observed.root)
  const savedPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
  const savedArch = Object.getOwnPropertyDescriptor(process, 'arch')!
  const savedArgv = process.argv
  const savedExit = process.exitCode
  try {
    Object.defineProperty(process, 'platform', { ...savedPlatform, value: platform })
    Object.defineProperty(process, 'arch', { ...savedArch, value: 'x64' })
    process.argv = [process.execPath, fileURLToPath(new URL('../scripts/package-target.ts', import.meta.url)), target]
    vi.resetModules()
    await import('../scripts/package-target.ts')
    expect(process.exitCode).toBe(1)
    return [...observed.stages]
  } finally {
    Object.defineProperty(process, 'platform', savedPlatform)
    Object.defineProperty(process, 'arch', savedArch)
    process.argv = savedArgv
    process.exitCode = savedExit
  }
}

it('records the packaging stage each platform is named by', async () => {
  expect(await stageNamesFor('win32', 'win-x64')).toEqual(['configuration', 'toolchain', 'windows-package'])
  expect(await stageNamesFor('darwin', 'mac-x64')).toEqual(['configuration', 'toolchain', 'macos-package'])
  expect(await stageNamesFor('linux', 'linux-x64')).toEqual(['configuration', 'toolchain', 'linux-package'])
})
