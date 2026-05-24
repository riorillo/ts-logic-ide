import type { Z3WorkerHandle } from '@sigmasd/vite-plugin-z3/runtime'
import { createZ3Worker } from '@sigmasd/vite-plugin-z3/runtime'
import type { WorkerVerifyPayload } from '../ir/types'
import { z3Worker } from '../../z3-workers'

let workerHandle: Promise<Z3WorkerHandle> | null = null

function workerError(err: unknown): Error {
  if (err instanceof Error) return err
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return new Error(String((err as { message: unknown }).message))
  }
  return new Error('Z3 worker failed')
}

export async function runZ3Solve(payload: WorkerVerifyPayload): Promise<unknown> {
  if (!workerHandle) {
    workerHandle = createZ3Worker(z3Worker.url).catch((err) => {
      workerHandle = null
      throw workerError(err)
    })
  }

  try {
    const handle = await workerHandle
    return await handle.run(payload)
  } catch (err) {
    const message = workerError(err).message
    if (/terminated|aborted|out of memory|memory/i.test(message)) {
      workerHandle = null
    }
    throw new Error(message)
  }
}

export function resetZ3Worker() {
  workerHandle?.then((h) => h.terminate()).catch(() => {})
  workerHandle = null
}
