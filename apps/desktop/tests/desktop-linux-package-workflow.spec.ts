/** The Linux packaging workflow: both architectures build natively and release together on a tag. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import * as yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '..', '..', '..')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function loadWorkflow(path: string): Record<string, unknown> {
  const workflow: unknown = yaml.load(readFileSync(resolve(repositoryRoot, path), 'utf8'))
  if (!isRecord(workflow)) throw new TypeError(`${path} must define a workflow`)
  return workflow
}

function workflowJob(workflow: Record<string, unknown>, job: string): Record<string, unknown> {
  if (!isRecord(workflow.jobs) || !isRecord(workflow.jobs[job])) {
    throw new TypeError('linux-package.yml must define the job ' + job)
  }
  return workflow.jobs[job]
}

function runStep(job: Record<string, unknown>, name: string): Record<string, unknown> {
  if (!Array.isArray(job.steps)) throw new TypeError(`${name} job must define steps`)
  const step: unknown = job.steps.find(value => isRecord(value) && value.name === name)
  if (!isRecord(step)) throw new TypeError(`${name} job must define the named step`)
  return step
}

function usesStep(job: Record<string, unknown>, uses: string): Record<string, unknown> {
  if (!Array.isArray(job.steps)) throw new TypeError(`${uses} job must define steps`)
  const step: unknown = job.steps.find(value => isRecord(value) && value.uses === uses)
  if (!isRecord(step)) throw new TypeError(`job must use ${uses}`)
  return step
}

function manifestScript(path: string, name: string): string {
  const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8')) as { scripts?: unknown }
  if (!isRecord(manifest.scripts)) throw new TypeError(`${path} must define scripts`)
  const source: unknown = manifest.scripts[name]
  if (typeof source !== 'string') throw new TypeError(`${path} must define the ${name} script`)
  return source
}

/**
 * Evaluate a `runs-on` GitHub expression against one matrix leg.
 * @param expression - Raw `${{ ... }}` selector the workflow carries.
 * @param context - Matrix values one leg would provide.
 * @returns The runner name the expression selects.
 */
function evaluateRunsOn(expression: string, context: Record<string, unknown>): unknown {
  return runInNewContext(expression.trim().slice(3, -2), context, { timeout: 1000 })
}

describe('Linux desktop package workflow', () => {
  it('builds both architectures natively on their own runners and uploads one artifact per arch', () => {
    const workflow = loadWorkflow('.github/workflows/linux-package.yml')
    const job = workflowJob(workflow, 'package')
    const strategy = job.strategy
    if (!isRecord(strategy) || !isRecord(strategy.matrix) || !Array.isArray(strategy.matrix.include)) {
      throw new TypeError('package job must define a matrix')
    }
    expect(strategy).toMatchObject({ 'fail-fast': false })
    expect(strategy.matrix.include).toEqual([
      { arch: 'x64', runner: 'ubuntu-24.04' },
      { arch: 'arm64', runner: 'ubuntu-24.04-arm' },
    ])
    expect(job['runs-on']).toBe('${{ matrix.runner }}')
    // The packaging command names the arch-specific script, so a matrix entry
    // without a matching package.json script would fail at run time.
    for (const leg of strategy.matrix.include) {
      if (!isRecord(leg) || typeof leg.arch !== 'string') throw new TypeError('package matrix legs must name an arch')
      expect(manifestScript('package.json', `package:desktop:linux:${leg.arch}`)).toBe(
        `pnpm --filter @deepseek-ai/dsh-desktop run package:linux:${leg.arch}`)
      expect(manifestScript('apps/desktop/package.json', `package:linux:${leg.arch}`))
        .toBe(`tsx scripts/package-target.ts linux-${leg.arch}`)
    }
    // Each architecture collects from its own isolated target directory.
    const collect = runStep(job, 'Collect the artifacts')
    if (typeof collect.run !== 'string') throw new TypeError('Collect the artifacts must run a script')
    expect(collect.run).toContain('apps/desktop/.desktop-build/targets/linux-${{ matrix.arch }}/unsigned-artifacts/')
    expect(collect.run).toContain('mkdir -p dist')
    expect(usesStep(job, 'actions/upload-artifact@v4')).toMatchObject({
      with: { name: 'linux-desktop-package-${{ matrix.arch }}', 'if-no-files-found': 'error' },
    })
  })

  it('verifies both architectures on every supported Ubuntu release', () => {
    const job = workflowJob(loadWorkflow('.github/workflows/linux-package.yml'), 'verify')
    const strategy = job.strategy
    if (!isRecord(strategy) || !isRecord(strategy.matrix)) throw new TypeError('verify job must define a matrix')
    expect(strategy).toMatchObject({
      'fail-fast': false,
      matrix: { release: ['20.04', '22.04', '24.04'], arch: ['x64', 'arm64'] },
    })
    expect(job.needs).toBe('package')
    const runsOn = job['runs-on']
    if (typeof runsOn !== 'string') throw new TypeError('verify job must select its runner by expression')
    expect(evaluateRunsOn(runsOn, { matrix: { arch: 'arm64' } })).toBe('ubuntu-24.04-arm')
    expect(evaluateRunsOn(runsOn, { matrix: { arch: 'x64' } })).toBe('ubuntu-24.04')
    expect(job.container).toMatchObject({ image: 'ubuntu:${{ matrix.release }}' })
    expect(usesStep(job, 'actions/download-artifact@v4')).toMatchObject({
      with: { name: 'linux-desktop-package-${{ matrix.arch }}', path: 'dist' },
    })
    expect(runStep(job, 'Install the package').run).toBe('apt-get install -yq ./dist/*.deb')
  })

  it('attaches every architecture package to the tag release from merged artifacts', () => {
    const workflow = loadWorkflow('.github/workflows/linux-package.yml')
    const job = workflowJob(workflow, 'release')
    expect(job).toMatchObject({
      needs: ['package', 'verify'],
      if: "startsWith(github.ref, 'refs/tags/dsh-v')",
      permissions: { contents: 'write' },
    })
    expect(usesStep(job, 'actions/download-artifact@v4')).toMatchObject({
      with: { pattern: 'linux-desktop-package-*', 'merge-multiple': true, path: 'dist' },
    })
    const attach = runStep(job, 'Attach the packages to the release')
    if (typeof attach.run !== 'string') throw new TypeError('Attach the packages must run a script')
    expect(attach.run).toContain('gh release upload --clobber "$RELEASE_TAG" dist/*.deb dist/*.AppImage')
    expect(attach.env).toMatchObject({ GH_TOKEN: '${{ github.token }}', GH_REPO: '${{ github.repository }}' })
  })
})
