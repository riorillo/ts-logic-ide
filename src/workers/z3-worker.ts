import type { Z3HighLevel } from 'z3-solver'
import type { VerifyPayload, VerifyResult } from '../core/ir/types'
import { solveVerification } from '../core/solver/encode'

export async function solve(z3: Z3HighLevel, data: VerifyPayload): Promise<VerifyResult> {
  return solveVerification(z3, data)
}
