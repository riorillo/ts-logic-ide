import { createEffect, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { isZ3Supported } from '@sigmasd/vite-plugin-z3/runtime'
import { parseProgram } from '../core/parser/parse-program'
import { buildVerificationPayload } from '../core/constraints/constraint-builder'
import { normalizeVerifyResult } from '../core/solver/normalize-result'
import type { AssertResult, LoopStep, ParseError, VerifyResult } from '../core/ir/types'
import { DEFAULT_PROGRAM } from '../examples/default-program'
import { z3Worker } from '../z3-workers'

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
    const raw = await z3Worker.run(payload)
    setState({ status: 'done', result: normalizeVerifyResult(raw as Partial<VerifyResult>) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Z3 verification failed'
    setState({ status: 'error', buildError: message })
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
