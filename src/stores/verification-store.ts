import { createEffect, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { isZ3Supported } from '@sigmasd/vite-plugin-z3/runtime'
import { parseProgram } from '../core/parser/parse-program'
import { buildVerificationPayload } from '../core/constraints/constraint-builder'
import { compactForWorker } from '../core/solver/compact-payload'
import { normalizeVerifyResult } from '../core/solver/normalize-result'
import { runZ3Solve } from '../core/solver/z3-client'
import type { AssertResult, LoopStep, ParseError, VerifyResult } from '../core/ir/types'
import { DEFAULT_PROGRAM } from '../examples/default-program'

export type VerificationStatus = 'idle' | 'parsing' | 'solving' | 'done' | 'error'

export interface VerificationState {
  status: VerificationStatus
  parseErrors: ParseError[]
  buildError: string | null
  result: VerifyResult | null
  z3Ready: boolean
  z3Supported: boolean
}

const LOOP_K_KEY = 'ts-logic-ide-loop-k'

function readLoopK(): number {
  const stored = localStorage.getItem(LOOP_K_KEY)
  const parsed = stored ? Number(stored) : 10
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return 'Z3 verification failed'
}

const [source, setSource] = createSignal(DEFAULT_PROGRAM)
const [loopK, setLoopK] = createSignal(readLoopK())
const [state, setState] = createStore<VerificationState>({
  status: 'idle',
  parseErrors: [],
  buildError: null,
  result: null,
  z3Ready: isZ3Supported(),
  z3Supported: isZ3Supported(),
})

createEffect(() => {
  localStorage.setItem(LOOP_K_KEY, String(loopK()))
})

export async function verify() {
  setState({
    status: 'parsing',
    parseErrors: [],
    buildError: null,
    result: null,
  })

  const parsed = parseProgram(source())
  if (!parsed.ok) {
    setState({ status: 'error', parseErrors: parsed.errors })
    return
  }

  let payload
  try {
    payload = buildVerificationPayload(parsed.program, loopK(), loopK())
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build constraints'
    setState({ status: 'error', buildError: message })
    return
  }

  if (!isZ3Supported()) {
    setState({
      status: 'error',
      buildError: 'Z3 requires SharedArrayBuffer (COOP/COEP headers). Use the Vite dev server.',
    })
    return
  }

  setState('status', 'solving')

  try {
    const workerPayload = compactForWorker(payload)
    const raw = await runZ3Solve(workerPayload)
    const normalized = normalizeVerifyResult(raw as Partial<VerifyResult>)
    setState({
      status: 'done',
      result: {
        ...normalized,
        debugConstraints: payload.debugConstraints,
        loopTrace: payload.loopTrace,
      },
    })
  } catch (err) {
    setState({ status: 'error', buildError: extractErrorMessage(err) })
  }
}

export function invalidAssertLines(): number[] {
  const results = state.result?.assertResults ?? []
  return results.filter((r) => !r.valid).map((r) => r.line)
}

export {
  source,
  setSource,
  loopK,
  setLoopK,
  state,
}

export type { AssertResult, LoopStep, VerifyResult }
