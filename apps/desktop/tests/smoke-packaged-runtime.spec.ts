/** The unpacked application directory the packaged-runtime smoke validates for each target. */

import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { desktopTargetBuildPaths } from '../scripts/desktop-build-paths.mjs'

const smoke = vi.hoisted(() => ({ prepared: [] as Array<{ dsh: string; executable: string; runtime: string }> }))
// The smoke launches the built runtime, which this suite never builds; the unpacked-directory
// selection under test runs before it, and the capture observes what it selected.
vi.mock('../scripts/smoke-prepared-runtime.ts', () => ({
  smokePreparedRuntime: async (dsh: string, executable: string, runtime: string) => {
    smoke.prepared.push({ dsh, executable, runtime })
  },
}))
// The runtime tree and the Windows signature live in build outputs this suite never produces.
vi.mock('../src/runtime-tree.ts', () => ({
  readDesktopRuntime: () => ({ release: { version: '0.0.0-fixture' } }),
  verifyDesktopRuntime: async () => undefined,
}))
vi.mock('../scripts/windows-runtime-signature.mjs', () => ({ verifyWindowsCode: async () => {} }))

afterEach(() => {
  smoke.prepared.length = 0
  vi.unstubAllEnvs()
})

/**
 * Run the smoke script against one Linux target and capture the paths it validates.
 * @param target - Linux build target selected through the packaging environment.
 * @param extraArguments - Extra smoke arguments, such as the unsigned Linux build mode CI uses.
 * @returns The bundled module, executable, and runtime directory the smoke received.
 */
async function smokedPathsFor(target: 'linux-x64' | 'linux-arm64', extraArguments: readonly string[] = []): Promise<{ dsh: string; executable: string; runtime: string }> {
  const savedArgv = process.argv
  // The target validation checks the build host, so the import must see the machine the target names.
  const savedPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
  const savedArch = Object.getOwnPropertyDescriptor(process, 'arch')!
  try {
    vi.stubEnv('DSH_DESKTOP_TARGET_PLATFORM', 'linux')
    vi.stubEnv('DSH_DESKTOP_TARGET_ARCH', target === 'linux-arm64' ? 'arm64' : 'x64')
    Object.defineProperty(process, 'platform', { ...savedPlatform, value: 'linux' })
    Object.defineProperty(process, 'arch', { ...savedArch, value: target === 'linux-arm64' ? 'arm64' : 'x64' })
    process.argv = [process.execPath, 'smoke-packaged-runtime.ts', ...extraArguments]
    vi.resetModules()
    await import('../scripts/smoke-packaged-runtime.ts')
  } finally {
    Object.defineProperty(process, 'platform', savedPlatform)
    Object.defineProperty(process, 'arch', savedArch)
    process.argv = savedArgv
  }
  expect(smoke.prepared).toHaveLength(1)
  return smoke.prepared[0]!
}

it.each([
  ['linux-x64', 'linux-unpacked'],
  ['linux-arm64', 'linux-arm64-unpacked'],
] as const)('smokes the %s package from the unpacked directory electron-builder names %s', async (target, unpacked) => {
  const application = join(desktopTargetBuildPaths(target).artifacts, unpacked)
  await expect(smokedPathsFor(target)).resolves.toEqual({
    dsh: join(application, 'resources', 'app.asar', 'dsh'),
    executable: join(application, 'deepseek-harness'),
    runtime: join(application, 'resources', 'runtime'),
  })
})

it('smokes the unsigned arm64 package CI builds from the unsigned output directory', async () => {
  const application = join(desktopTargetBuildPaths('linux-arm64').unsignedArtifacts, 'linux-arm64-unpacked')
  await expect(smokedPathsFor('linux-arm64', ['--unsigned'])).resolves.toEqual({
    dsh: join(application, 'resources', 'app.asar', 'dsh'),
    executable: join(application, 'deepseek-harness'),
    runtime: join(application, 'resources', 'runtime'),
  })
})
