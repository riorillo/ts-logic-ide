import { MAX_DOMAIN_VALUES } from '../constraints/constraint-builder'
import type {
  IndexedAssertQuery,
  SExpr,
  VerifyResult,
  WorkerVerifyPayload,
} from '../ir/types'
import type { Z3HighLevel } from 'z3-solver'

type Z3Any = unknown

type SolverLike = {
  add: (e: Z3Any) => void
  check: () => Promise<string>
  push: () => void
  pop: (n?: number) => void
  model: () => { eval: (sym: Z3Any, modelCompletion: boolean) => Z3Any }
}

let solverChecks = 0

async function yieldToEventLoop() {
  solverChecks++
  if (solverChecks % 48 === 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}

async function solverCheck(solver: SolverLike): Promise<string> {
  const status = await solverCheck(solver)
  await yieldToEventLoop()
  return status
}

class Z3Env {
  readonly ctx: Z3Any
  readonly Int: { const: (n: string) => Z3Any; val: (v: number) => Z3Any }
  readonly Bool: { const: (n: string) => Z3Any; val: (v: boolean) => Z3Any }
  readonly If: (c: Z3Any, t: Z3Any, e: Z3Any) => Z3Any
  readonly Solver: new () => SolverLike

  private readonly pool: SExpr[]
  private readonly boolCache = new Map<number, Z3Any>()
  private readonly arithCache = new Map<number, Z3Any>()
  private readonly intSymbols = new Map<string, Z3Any>()
  private readonly boolSymbols = new Map<string, Z3Any>()

  constructor(z3: Z3HighLevel, pool: SExpr[]) {
    this.pool = pool
    this.ctx = new z3.Context('main') as Z3Any
    const ctx = this.ctx as {
      Int: Z3Env['Int']
      Bool: Z3Env['Bool']
      If: Z3Env['If']
      Solver: new () => SolverLike
    }
    this.Int = ctx.Int
    this.Bool = ctx.Bool
    this.If = ctx.If
    this.Solver = ctx.Solver

    for (const expr of pool) this.visit(expr)
  }

  buildBoolAt(index: number): Z3Any {
    const cached = this.boolCache.get(index)
    if (cached !== undefined) return cached
    const built = this.buildBool(this.pool[index])
    this.boolCache.set(index, built)
    return built
  }

  buildArithAt(index: number): Z3Any {
    const cached = this.arithCache.get(index)
    if (cached !== undefined) return cached
    const built = this.buildArith(this.pool[index])
    this.arithCache.set(index, built)
    return built
  }

  buildBoolList(indices: number[]): Z3Any[] {
    return indices.map((i) => this.buildBoolAt(i))
  }

  modelValues(model: { eval: (sym: Z3Any, modelCompletion: boolean) => Z3Any }) {
    const values: Record<string, string> = {}
    for (const [name, sym] of this.intSymbols) values[name] = String(model.eval(sym, true))
    for (const [name, sym] of this.boolSymbols) values[name] = String(model.eval(sym, true))
    return values
  }

  intConst(name: string): Z3Any {
    if (!this.intSymbols.has(name)) this.intSymbols.set(name, this.Int.const(name))
    return this.intSymbols.get(name)!
  }

  private boolConst(name: string): Z3Any {
    if (!this.boolSymbols.has(name)) this.boolSymbols.set(name, this.Bool.const(name))
    return this.boolSymbols.get(name)!
  }

  private visit(expr: SExpr) {
    if (expr.op === 'const') {
      if (expr.sort === 'int') this.intConst(expr.name)
      else this.boolConst(expr.name)
      return
    }
    switch (expr.op) {
      case 'not':
        this.visit(expr.arg)
        break
      case 'and':
      case 'or':
      case 'add':
      case 'mul':
        expr.args.forEach((a) => this.visit(a))
        break
      case 'eq':
      case 'sub':
      case 'div':
      case 'gt':
      case 'lt':
      case 'gte':
      case 'lte':
        this.visit(expr.left)
        this.visit(expr.right)
        break
      case 'ite':
        this.visit(expr.cond)
        this.visit(expr.then)
        this.visit(expr.else)
        break
    }
  }

  private buildArith(expr: SExpr): Z3Any {
    const ar = (e: Z3Any) =>
      e as { add: (o: Z3Any) => Z3Any; sub: (o: Z3Any) => Z3Any; mul: (o: Z3Any) => Z3Any; div: (o: Z3Any) => Z3Any }
    switch (expr.op) {
      case 'const':
        if (expr.sort !== 'int') throw new Error(`Expected int symbol ${expr.name}`)
        return this.intConst(expr.name)
      case 'int':
        return this.Int.val(expr.value)
      case 'add':
        return expr.args.map((a) => this.buildArith(a)).reduce((a, b) => ar(a).add(b))
      case 'sub':
        return ar(this.buildArith(expr.left)).sub(this.buildArith(expr.right))
      case 'mul':
        return expr.args.map((a) => this.buildArith(a)).reduce((a, b) => ar(a).mul(b))
      case 'div':
        return ar(this.buildArith(expr.left)).div(this.buildArith(expr.right))
      case 'ite':
        return this.If(this.buildBool(expr.cond), this.buildArith(expr.then), this.buildArith(expr.else))
      default:
        throw new Error(`Not an arithmetic expression: ${expr.op}`)
    }
  }

  private buildBool(expr: SExpr): Z3Any {
    const bl = (e: Z3Any) => e as { not: () => Z3Any; and: (o: Z3Any) => Z3Any; or: (o: Z3Any) => Z3Any; eq: (o: Z3Any) => Z3Any }
    const ar = (e: Z3Any) => e as { eq: (o: Z3Any) => Z3Any; gt: (o: Z3Any) => Z3Any; lt: (o: Z3Any) => Z3Any; ge: (o: Z3Any) => Z3Any; le: (o: Z3Any) => Z3Any }
    switch (expr.op) {
      case 'const':
        if (expr.sort !== 'bool') throw new Error(`Expected bool symbol ${expr.name}`)
        return this.boolConst(expr.name)
      case 'bool':
        return this.Bool.val(expr.value)
      case 'not':
        return bl(this.buildBool(expr.arg)).not()
      case 'and':
        return expr.args.map((a) => this.buildBool(a)).reduce((a, b) => bl(a).and(b))
      case 'or':
        return expr.args.map((a) => this.buildBool(a)).reduce((a, b) => bl(a).or(b))
      case 'eq':
        if (isIntExpr(expr.left) && isIntExpr(expr.right)) {
          return ar(this.buildArith(expr.left)).eq(this.buildArith(expr.right))
        }
        return bl(this.buildBool(expr.left)).eq(this.buildBool(expr.right))
      case 'gt':
        return ar(this.buildArith(expr.left)).gt(this.buildArith(expr.right))
      case 'lt':
        return ar(this.buildArith(expr.left)).lt(this.buildArith(expr.right))
      case 'gte':
        return ar(this.buildArith(expr.left)).ge(this.buildArith(expr.right))
      case 'lte':
        return ar(this.buildArith(expr.left)).le(this.buildArith(expr.right))
      case 'ite':
        return this.If(this.buildBool(expr.cond), this.buildBool(expr.then), this.buildBool(expr.else))
      default:
        throw new Error(`Not a boolean expression: ${expr.op}`)
    }
  }
}

function addToSolver(solver: SolverLike, exprs: Z3Any[]) {
  for (const e of exprs) solver.add(e)
}

async function checkAssertQuery(
  env: Z3Env,
  query: IndexedAssertQuery,
  extra: Z3Any[] = [],
): Promise<{ valid: boolean; status: 'valid' | 'invalid' | 'unknown'; counterexample?: Record<string, string> }> {
  const solver = new env.Solver()
  addToSolver(solver, env.buildBoolList(query.assumptionIndices))
  addToSolver(solver, env.buildBoolList(query.constraintIndices))
  addToSolver(solver, extra)
  const notAssert = (env.buildBoolAt(query.assertionIndex) as { not: () => Z3Any }).not()
  solver.add(notAssert)
  const status = await solverCheck(solver)
  if (status === 'unsat') return { valid: true, status: 'valid' }
  if (status === 'sat') return { valid: false, status: 'invalid', counterexample: env.modelValues(solver.model()) }
  return { valid: false, status: 'unknown' }
}

export async function solveVerification(z3: Z3HighLevel, payload: WorkerVerifyPayload): Promise<VerifyResult> {
  solverChecks = 0
  const env = new Z3Env(z3, payload.pool ?? [])
  const queries = payload.queries ?? []
  const domainQueries = payload.domainQueries ?? []
  const functionQueries = payload.functionQueries ?? []

  const assertResults: VerifyResult['assertResults'] = []

  for (const query of queries) {
    const outcome = await checkAssertQuery(env, query)
    assertResults.push({
      line: query.line,
      valid: outcome.valid,
      status: outcome.status,
      counterexample: outcome.counterexample,
      label: query.label,
    })
  }

  const domainResults: VerifyResult['domainResults'] = []

  for (const query of domainQueries) {
    const sym = env.intConst(query.ssaName)
    const symAr = sym as { neq: (o: Z3Any) => Z3Any }
    const values: string[] = []
    const solver = new env.Solver()
    addToSolver(solver, env.buildBoolList(query.assumptionIndices))
    addToSolver(solver, env.buildBoolList(query.constraintIndices))
    solver.add(env.buildBoolAt(query.conditionIndex))

    let truncated = false
    for (let i = 0; i < MAX_DOMAIN_VALUES; i++) {
      const status = await solverCheck(solver)
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
    const paramSym = env.intConst(fq.paramSsaName)
    const paramAr = paramSym as { eq: (o: Z3Any) => Z3Any }
    const validInputs: string[] = []

    const baseAssumes = env.buildBoolList(fq.assumptionIndices)
    const baseConstraints = env.buildBoolList(fq.constraintIndices)

    const fnAssertResults: VerifyResult['assertResults'] = []
    for (const aq of assertQueries) {
      const outcome = await checkAssertQuery(env, aq)
      fnAssertResults.push({
        line: aq.line,
        valid: outcome.valid,
        status: outcome.status,
        label: `[${fq.name}] ${aq.label}`,
      })
    }

    const baseSolver = new env.Solver()
    addToSolver(baseSolver, baseAssumes)
    addToSolver(baseSolver, baseConstraints)

    for (let v = fq.paramMin; v <= fq.paramMax; v++) {
      const pin = paramAr.eq(env.Int.val(v))
      baseSolver.push()
      baseSolver.add(pin)

      if ((await solverCheck(baseSolver)) === 'unsat') {
        baseSolver.pop()
        continue
      }

      let allValid = assertQueries.length === 0
      if (!allValid) {
        for (const aq of assertQueries) {
          const outcome = await checkAssertQuery(env, aq, [pin])
          if (!outcome.valid) {
            allValid = false
            break
          }
        }
      }

      baseSolver.pop()
      if (allValid) validInputs.push(String(v))
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
    const last = queries[queries.length - 1]
    const solver = new env.Solver()
    addToSolver(solver, env.buildBoolList(last.assumptionIndices))
    addToSolver(solver, env.buildBoolList(last.constraintIndices))
    const status = await solverCheck(solver)
    if (status === 'sat') finalModel = env.modelValues(solver.model())
  }

  return {
    assertResults,
    domainResults,
    functionResults,
    finalModel,
    debugConstraints: [],
    loopTrace: [],
  }
}

function isIntExpr(expr: SExpr): boolean {
  if (expr.op === 'const') return expr.sort === 'int'
  return ['int', 'add', 'sub', 'mul', 'div', 'ite'].includes(expr.op)
}
