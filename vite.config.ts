import { existsSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import solid from 'vite-plugin-solid'
import { z3Plugin } from '@sigmasd/vite-plugin-z3'

/** vite-plugin-z3 only compares the worker entry mtime; invalidate when solver deps change. */
function z3WorkerDependencyPlugin(): Plugin {
  const workerEntry = 'src/workers/z3-worker.ts'
  const workerDeps = [
    'src/core/solver/encode.ts',
    'src/core/solver/compact-payload.ts',
    'src/core/constraints/constraint-builder.ts',
  ]
  const workerOut = 'public/z3-worker.js'

  return {
    name: 'z3-worker-dependency-invalidate',
    enforce: 'pre',
    buildStart() {
      const root = process.cwd()
      const outPath = join(root, workerOut)
      if (!existsSync(outPath)) return

      const entryMtime = statSync(join(root, workerEntry)).mtimeMs
      const depMtime = Math.max(
        ...workerDeps.map((f) => statSync(join(root, f)).mtimeMs),
      )
      const outMtime = statSync(outPath).mtimeMs
      if (depMtime > entryMtime || depMtime > outMtime) {
        unlinkSync(outPath)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    z3WorkerDependencyPlugin(),
    solid(),
    z3Plugin({
      workers: ['src/workers/z3-worker.ts'],
      generateExample: false,
    }),
  ],
})
