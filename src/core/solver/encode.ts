import { MAX_DOMAIN_VALUES } from '../constraints/constraint-builder'
import type {
  AssertQuery,
  SExpr,
  VerifyPayload,
  VerifyResult,
} from '../ir/types'
import type { Z3HighLevel } from 'z3-solver'

// z3-solver generics (Context<"main"> vs Context<string>) fight TS; use unknown at boundaries.
type Z3Any = unknown

async function checkAssertValid(
  ctx: Z3Any,
  buildBool: (expr: SExpr) => Z3Any,
  query: AssertQuery,
  extra: Z3Any[] = [],
): Promise<boolean> {
  const Solver = (ctx as { Solver: new () => { add: (e: Z3Any) => void; check: () => Promise<string> } }).Solver
  const solver = new Solver()
  for (const assumption of query.assumptions) solver.add(buildBool(assumption))
  for (const constraint of query.constraints) solver.add(buildBool(constraint))
  for (const e of extra) solver.add(e)
  const notAssert = (buildBool(query.assertion) as { not: () => Z3Any }).not()
  solver.add(notAssert)
  return (await solver.check()) === 'unsat'
}

export async function solveVerification(z3: Z3HighLevel, payload: VerifyPayload): Promise<VerifyResult> {
  const queries = payload.queries ?? []
  const domainQueries = payload.domainQueries ?? []
  const functionQueries = payload.functionQueries ?? []

  const ctx = new z3.Context('main') as Z3Any
  const Int = (ctx as { Int: { const: (n: string) => Z3Any; val: (v: number) => Z3Any } }).Int
  const Bool = (ctx as { Bool: { const: (n: string) => Z3Any; val: (v: boolean) => Z3Any } }).Bool
  const If = (ctx as { If: (c: Z3Any, t: Z3Any, e: Z3Any) => Z3Any }).If
  const SolverCtor = (ctx as { Solver: new () => {
    add: (e: Z3Any) => void
    check: () => Promise<string>
    model: () => { eval: (sym: Z3Any, modelCompletion: boolean) => Z3Any }
  } }).Solver

  const intSymbols = new Map<string, Z3Any>()
  const boolSymbols = new Map<string, Z3Any>()

  const intConst = (name: string): Z3Any => {
    if (!intSymbols.has(name)) intSymbols.set(name, Int.const(name))
    return intSymbols.get(name)!
  }

  const boolConst = (name: string): Z3Any => {
    if (!boolSymbols.has(name)) boolSymbols.set(name, Bool.const(name))
    return boolSymbols.get(name)!
  }

  const buildArith = (expr: SExpr): Z3Any => {
    const ar = (e: Z3Any) => e as {
      add: (o: Z3Any) => Z3Any
      sub: (o: Z3Any) => Z3Any
      mul: (o: Z3Any) => Z3Any
      div: (o: Z3Any) => Z3Any
    }
    switch (expr.op) {
      case 'const':
        if (expr.sort !== 'int') throw new Error(`Expected int symbol ${expr.name}`)
        return intConst(expr.name)
      case 'int':
        return Int.val(expr.value)
      case 'add':
        return expr.args.map(buildArith).reduce((a, b) => ar(a).add(b))
      case 'sub':
        return ar(buildArith(expr.left)).sub(buildArith(expr.right))
      case 'mul':
        return expr.args.map(buildArith).reduce((a, b) => ar(a).mul(b))
      case 'div':
        return ar(buildArith(expr.left)).div(buildArith(expr.right))
      case 'ite':
        return If(buildBool(expr.cond), buildArith(expr.then), buildArith(expr.else))
      default:
        throw new Error(`Not an arithmetic expression: ${expr.op}`)
    }
  }

  const buildBool = (expr: SExpr): Z3Any => {
    const bl = (e: Z3Any) => e as {
      not: () => Z3Any
      and: (o: Z3Any) => Z3Any
      or: (o: Z3Any) => Z3Any
      eq: (o: Z3Any) => Z3Any
    }
    const ar = (e: Z3Any) => e as {
      eq: (o: Z3Any) => Z3Any
      gt: (o: Z3Any) => Z3Any
      lt: (o: Z3Any) => Z3Any
      ge: (o: Z3Any) => Z3Any
      le: (o: Z3Any) => Z3Any
    }
    switch (expr.op) {
      case 'const':
        if (expr.sort !== 'bool') throw new Error(`Expected bool symbol ${expr.name}`)
        return boolConst(expr.name)
      case 'bool':
        return Bool.val(expr.value)
      case 'not':
        return bl(buildBool(expr.arg)).not()
      case 'and':
        return expr.args.map(buildBool).reduce((a, b) => bl(a).and(b))
      case 'or':
        return expr.args.map(buildBool).reduce((a, b) => bl(a).or(b))
      case 'eq':
        if (isIntExpr(expr.left) && isIntExpr(expr.right)) {
          return ar(buildArith(expr.left)).eq(buildArith(expr.right))
        }
        return bl(buildBool(expr.left)).eq(buildBool(expr.right))
      case 'gt':
        return ar(buildArith(expr.left)).gt(buildArith(expr.right))
      case 'lt':
        return ar(buildArith(expr.left)).lt(buildArith(expr.right))
      case 'gte':
        return ar(buildArith(expr.left)).ge(buildArith(expr.right))
      case 'lte':
        return ar(buildArith(expr.left)).le(buildArith(expr.right))
      case 'ite':
        return If(buildBool(expr.cond), buildBool(expr.then), buildBool(expr.else))
      default:
        throw new Error(`Not a boolean expression: ${expr.op}`)
    }
  }

  const visit = (expr: SExpr) => {
    if (expr.op === 'const') {
      if (expr.sort === 'int') intConst(expr.name)
      else boolConst(expr.name)
      return
    }
    switch (expr.op) {
      case 'not':
        visit(expr.arg)
        break
      case 'and':
      case 'or':
      case 'add':
      case 'mul':
        expr.args.forEach(visit)
        break
      case 'eq':
      case 'sub':
      case 'div':
      case 'gt':
      case 'lt':
      case 'gte':
      case 'lte':
        visit(expr.left)
        visit(expr.right)
        break
      case 'ite':
        visit(expr.cond)
        visit(expr.then)
        visit(expr.else)
        break
    }
  }

  for (const query of queries) {
    query.assumptions.forEach(visit)
    query.constraints.forEach(visit)
    visit(query.assertion)
  }
  for (const query of domainQueries) {
    query.assumptions.forEach(visit)
    query.constraints.forEach(visit)
    visit(query.condition)
    intConst(query.ssaName)
  }
  for (const fq of functionQueries) {
    fq.assumptions.forEach(visit)
    fq.constraints.forEach(visit)
    fq.assertQueries.forEach((q) => {
      q.assumptions.forEach(visit)
      q.constraints.forEach(visit)
      visit(q.assertion)
    })
    intConst(fq.paramSsaName)
  }

  const modelValues = (model: { eval: (sym: Z3Any, modelCompletion: boolean) => Z3Any }) => {
    const values: Record<string, string> = {}
    for (const [name, sym] of intSymbols) values[name] = String(model.eval(sym, true))
    for (const [name, sym] of boolSymbols) values[name] = String(model.eval(sym, true))
    return values
  }

  const assertResults: VerifyResult['assertResults'] = []

  for (const query of queries) {
    const valid = await checkAssertValid(ctx, buildBool, query)
    if (valid) {
      assertResults.push({ line: query.line, valid: true, status: 'valid', label: query.label })
    } else {
      const solver = new SolverCtor()
      for (const assumption of query.assumptions) solver.add(buildBool(assumption))
      for (const constraint of query.constraints) solver.add(buildBool(constraint))
      solver.add((buildBool(query.assertion) as { not: () => Z3Any }).not())
      const status = await solver.check()
      if (status === 'sat') {
        assertResults.push({
          line: query.line,
          valid: false,
          status: 'invalid',
          counterexample: modelValues(solver.model()),
          label: query.label,
        })
      } else {
        assertResults.push({ line: query.line, valid: false, status: 'unknown', label: query.label })
      }
    }
  }

  const domainResults: VerifyResult['domainResults'] = []

  for (const query of domainQueries) {
    const sym = intConst(query.ssaName)
    const symAr = sym as { neq: (o: Z3Any) => Z3Any }
    const values: string[] = []
    const solver = new SolverCtor()
    for (const assumption of query.assumptions) solver.add(buildBool(assumption))
    for (const constraint of query.constraints) solver.add(buildBool(constraint))
    solver.add(buildBool(query.condition))

    let truncated = false
    for (let i = 0; i < MAX_DOMAIN_VALUES; i++) {
      const status = await solver.check()
      if (status !== 'sat') break
      const val = solver.model().eval(sym, true)
      values.push(String(val))
      solver.add(symAr.neq(val))
      if (i === MAX_DOMAIN_VALUES - 1) truncated = true
    }

    domainResults.push({
      line: query.line,
      variable: query.variable,
      values,
      truncated,
      label: query.label,
    })
  }

  const functionResults: VerifyResult['functionResults'] = []

  for (const fq of functionQueries) {
    const assertQueries = fq.assertQueries ?? []
    const paramSym = intConst(fq.paramSsaName)
    const paramAr = paramSym as { eq: (o: Z3Any) => Z3Any }
    const validInputs: string[] = []

    for (let v = fq.paramMin; v <= fq.paramMax; v++) {
      const pin = paramAr.eq(Int.val(v))
      const solver = new SolverCtor()
      for (const assumption of fq.assumptions) solver.add(buildBool(assumption))
      for (const constraint of fq.constraints) solver.add(buildBool(constraint))
      solver.add(pin)

      if ((await solver.check()) === 'unsat') continue

      let allValid = assertQueries.length === 0
      for (const aq of assertQueries) {
        if (!(await checkAssertValid(ctx, buildBool, aq, [pin]))) {
          allValid = false
          break
        }
      }
      if (allValid) validInputs.push(String(v))
    }

    const fnAssertResults: VerifyResult['assertResults'] = []
    for (const aq of assertQueries) {
      const valid = await checkAssertValid(ctx, buildBool, aq)
      fnAssertResults.push({
        line: aq.line,
        valid,
        status: valid ? 'valid' : 'invalid',
        label: `[${fq.name}] ${aq.label}`,
      })
    }

    functionResults.push({
      name: fq.name,
      line: fq.line,
      param: fq.param,
      validInputs,
      paramRange: { min: fq.paramMin, max: fq.paramMax },
      assertResults: fnAssertResults,
    })
  }

  let finalModel: Record<string, string> | undefined
  if (queries.length > 0) {
    const solver = new SolverCtor()
    const last = queries[queries.length - 1]
    for (const assumption of last.assumptions) solver.add(buildBool(assumption))
    for (const constraint of last.constraints) solver.add(buildBool(constraint))
    const status = await solver.check()
    if (status === 'sat') finalModel = modelValues(solver.model())
  }

  return {
    assertResults,
    domainResults,
    functionResults,
    finalModel,
    debugConstraints: payload.debugConstraints ?? [],
    loopTrace: payload.loopTrace ?? [],
  }
}

function isIntExpr(expr: SExpr): boolean {
  if (expr.op === 'const') return expr.sort === 'int'
  return ['int', 'add', 'sub', 'mul', 'div', 'ite'].includes(expr.op)
}
