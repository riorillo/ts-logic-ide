import type { FunctionResult, VerifyResult } from '../ir/types'

export function normalizeVerifyResult(raw: Partial<VerifyResult> | null | undefined): VerifyResult {
  const functionResults: FunctionResult[] = (raw?.functionResults ?? []).map((fn) => ({
    name: fn.name ?? '',
    line: fn.line ?? 0,
    param: fn.param ?? '',
    validInputs: fn.validInputs ?? [],
    paramRange: fn.paramRange ?? { min: 0, max: 0 },
    assertResults: fn.assertResults ?? [],
  }))

  return {
    assertResults: raw?.assertResults ?? [],
    domainResults: raw?.domainResults ?? [],
    functionResults,
    finalModel: raw?.finalModel,
    debugConstraints: raw?.debugConstraints ?? [],
    loopTrace: raw?.loopTrace ?? [],
  }
}
