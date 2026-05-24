import type {
  DomainQuery,
  Expr,
  FunctionCheckQuery,
  FunctionDef,
  Program,
  SExpr,
  Sort,
  Stmt,
  VerifyPayload,
} from '../ir/types'
import { FunctionRegistry, substituteExpr, substituteParams } from '../functions/registry'
import { SSAContext, extractForBound } from '../unrolling/ssa-context'

const MAX_DOMAIN_VALUES = 32

function implies(condition: SExpr, consequence: SExpr): SExpr {
  return { op: 'or', args: [{ op: 'not', arg: condition }, consequence] }
}

function sexprToString(expr: SExpr): string {
  switch (expr.op) {
    case 'const':
      return expr.name
    case 'int':
      return String(expr.value)
    case 'bool':
      return String(expr.value)
    case 'not':
      return `(not ${sexprToString(expr.arg)})`
    case 'and':
      return `(and ${expr.args.map(sexprToString).join(' ')})`
    case 'or':
      return `(or ${expr.args.map(sexprToString).join(' ')})`
    case 'eq':
      return `(= ${sexprToString(expr.left)} ${sexprToString(expr.right)})`
    case 'add':
      return `(+ ${expr.args.map(sexprToString).join(' ')})`
    case 'sub':
      return `(- ${sexprToString(expr.left)} ${sexprToString(expr.right)})`
    case 'mul':
      return `(* ${expr.args.map(sexprToString).join(' ')})`
    case 'div':
      return `(/ ${sexprToString(expr.left)} ${sexprToString(expr.right)})`
    case 'gt':
      return `(> ${sexprToString(expr.left)} ${sexprToString(expr.right)})`
    case 'lt':
      return `(< ${sexprToString(expr.left)} ${sexprToString(expr.right)})`
    case 'gte':
      return `(>= ${sexprToString(expr.left)} ${sexprToString(expr.right)})`
    case 'lte':
      return `(<= ${sexprToString(expr.left)} ${sexprToString(expr.right)})`
    case 'ite':
      return `(ite ${sexprToString(expr.cond)} ${sexprToString(expr.then)} ${sexprToString(expr.else)})`
    default:
      return '?'
  }
}

class ExecutionState {
  private tempCounter = 0

  ctx = new SSAContext()
  constraints: SExpr[] = []
  assumes: SExpr[] = []
  queries: VerifyPayload['queries'] = []
  domainQueries: DomainQuery[] = []
  debugConstraints: string[] = []
  loopTrace: import('../ir/types').LoopStep[] = []

  private readonly functions: FunctionRegistry

  constructor(functions: FunctionRegistry) {
    this.functions = functions
  }

  clone(): ExecutionState {
    const copy = new ExecutionState(this.functions)
    copy.tempCounter = this.tempCounter
    copy.ctx = this.ctx.clone()
    copy.constraints = [...this.constraints]
    copy.assumes = [...this.assumes]
    copy.debugConstraints = [...this.debugConstraints]
    copy.loopTrace = [...this.loopTrace]
    return copy
  }

  recordAssert(line: number, expr: Expr) {
    const assertion = this.evalExpr(expr)
    this.queries.push({
      line,
      assumptions: [...this.assumes],
      constraints: [...this.constraints],
      assertion,
      label: `assert at line ${line}`,
    })
  }

  recordDomain(line: number, variable: string, expr: Expr) {
    if (!this.ctx.has(variable)) {
      throw new Error(`domain(): variable "${variable}" is not defined at line ${line}`)
    }
    const sort = this.ctx.sortOf(variable)
    if (sort !== 'int') {
      throw new Error(`domain() supports number variables only (got boolean "${variable}" at line ${line})`)
    }
    const condition = this.evalExpr(expr)
    this.domainQueries.push({
      line,
      variable,
      ssaName: this.ctx.current(variable),
      sort,
      assumptions: [...this.assumes],
      constraints: [...this.constraints],
      condition,
      label: `domain(${variable}, …) at line ${line}`,
    })
  }

  mergeQueriesFrom(other: ExecutionState) {
    this.queries.push(...other.queries)
    this.domainQueries.push(...other.domainQueries)
  }

  addConstraint(expr: SExpr, label?: string) {
    this.constraints.push(expr)
    if (label) this.debugConstraints.push(`${label}: ${sexprToString(expr)}`)
  }

  varRef(name: string): SExpr {
    return { op: 'const', name: this.ctx.current(name), sort: this.ctx.sortOf(name) }
  }

  evalExpr(expr: Expr): SExpr {
    switch (expr.kind) {
      case 'lit':
        return typeof expr.value === 'boolean'
          ? { op: 'bool', value: expr.value }
          : { op: 'int', value: expr.value }
      case 'var':
        return this.varRef(expr.name)
      case 'unary':
        return { op: 'sub', left: { op: 'int', value: 0 }, right: this.evalExpr(expr.arg) }
      case 'call':
        return this.inlineCall(expr.name, expr.args)
      case 'binary': {
        const left = this.evalExpr(expr.left)
        const right = this.evalExpr(expr.right)
        switch (expr.op) {
          case '+':
            return { op: 'add', args: [left, right] }
          case '-':
            return { op: 'sub', left, right }
          case '*':
            return { op: 'mul', args: [left, right] }
          case '/':
            return { op: 'div', left, right }
          case '>':
            return { op: 'gt', left, right }
          case '<':
            return { op: 'lt', left, right }
          case '>=':
            return { op: 'gte', left, right }
          case '<=':
            return { op: 'lte', left, right }
          case '==':
            return { op: 'eq', left, right }
          case '&&':
            return { op: 'and', args: [left, right] }
          case '||':
            return { op: 'or', args: [left, right] }
        }
      }
    }
    throw new Error('Invalid expression')
  }

  inlineCall(name: string, args: Expr[]): SExpr {
    const fn = this.functions.get(name)
    if (fn.params.length !== args.length) {
      throw new Error(`Function "${name}" expects ${fn.params.length} argument(s), got ${args.length}`)
    }

    const rename = new Map(fn.params.map((p) => [p.name, `__arg_${p.name}`]))
    const inlinedBody = substituteParams(fn.body, fn.params, args)
    const returnExpr = substituteExpr(fn.returnExpr, rename)

    const scope = this.clone()
    scope.execStmts(inlinedBody)

    const temp = `__ret_${this.tempCounter++}`
    const sort: Sort = fn.returnType === 'boolean' ? 'bool' : 'int'
    scope.ctx.types.set(temp, sort)
    const ssa = scope.ctx.fresh(temp)
    scope.addConstraint(
      { op: 'eq', left: { op: 'const', name: ssa, sort }, right: scope.evalExpr(returnExpr) },
      `return ${name}`,
    )

    this.constraints.push(...scope.constraints)
    this.assumes.push(...scope.assumes)

    return { op: 'const', name: ssa, sort }
  }

  execStmts(stmts: Stmt[]) {
    for (const stmt of stmts) {
      this.execStmt(stmt)
    }
  }

  execStmt(stmt: Stmt) {
    switch (stmt.kind) {
      case 'decl':
        this.execDecl(stmt)
        break
      case 'assign':
        this.execAssign(stmt.name, stmt.expr, `line ${stmt.line}`)
        break
      case 'assume': {
        const value = this.evalExpr(stmt.expr)
        // Chiamate inlined: assume/ assert del corpo sono già in this.assumes
        if (stmt.expr.kind !== 'call') {
          this.assumes.push(value)
        }
        break
      }
      case 'assert':
        this.recordAssert(stmt.line, stmt.expr)
        break
      case 'domain':
        this.recordDomain(stmt.line, stmt.variable, stmt.expr)
        break
      case 'if':
        this.execIf(stmt)
        break
      case 'for':
        this.execFor(stmt)
        break
      case 'block':
        this.execStmts(stmt.stmts)
        break
    }
  }

  execDecl(stmt: Extract<Stmt, { kind: 'decl' }>) {
    const sort: Sort = stmt.type === 'boolean' ? 'bool' : 'int'
    this.ctx.declare(stmt.name, sort)
    if (stmt.init !== undefined) {
      const ssa = this.ctx.current(stmt.name)
      this.addConstraint(
        { op: 'eq', left: { op: 'const', name: ssa, sort }, right: this.evalExpr(stmt.init) },
        `decl ${stmt.name}@${stmt.line}`,
      )
    }
  }

  execParam(name: string, type: VarType) {
    const sort: Sort = type === 'boolean' ? 'bool' : 'int'
    this.ctx.declare(name, sort)
  }

  execAssign(name: string, expr: Expr, label: string) {
    const sort = this.ctx.sortOf(name)
    const value = this.evalExpr(expr)
    const ssa = this.ctx.fresh(name)
    this.addConstraint(
      { op: 'eq', left: { op: 'const', name: ssa, sort }, right: value },
      `assign ${name}@${label}`,
    )
  }

  execIf(stmt: Extract<Stmt, { kind: 'if' }>) {
    const cond = this.evalExpr(stmt.cond)
    const pre = this.ctx.snapshotVersions()

    const thenState = this.clone()
    thenState.assumes.push(cond)
    thenState.execStmts(stmt.then)
    const thenVersions = thenState.ctx.snapshotVersions()

    const elseState = this.clone()
    elseState.assumes.push({ op: 'not', arg: cond })
    if (stmt.else) {
      elseState.execStmts(stmt.else)
    }
    const elseVersions = elseState.ctx.snapshotVersions()

    this.mergeQueriesFrom(thenState)
    this.mergeQueriesFrom(elseState)

    for (const c of thenState.constraints.slice(this.constraints.length)) {
      this.addConstraint(implies(cond, c))
    }
    for (const c of elseState.constraints.slice(this.constraints.length)) {
      this.addConstraint(implies({ op: 'not', arg: cond }, c))
    }

    const vars = new Set([...pre.keys(), ...thenVersions.keys(), ...elseVersions.keys()])
    for (const name of vars) {
      const preVer = pre.get(name)
      const thenVer = thenVersions.get(name) ?? preVer
      const elseVer = elseVersions.get(name) ?? preVer
      if (thenVer !== elseVer) {
        const sort = this.ctx.sortOf(name)
        const merged = this.ctx.fresh(name)
        const thenRef = thenVer !== undefined ? { op: 'const' as const, name: this.ctx.ssaName(name, thenVer), sort } : this.evalExpr({ kind: 'var', name })
        const elseRef = elseVer !== undefined ? { op: 'const' as const, name: this.ctx.ssaName(name, elseVer), sort } : this.evalExpr({ kind: 'var', name })
        this.addConstraint({
          op: 'eq',
          left: { op: 'const', name: merged, sort },
          right: { op: 'ite', cond, then: thenRef, else: elseRef },
        })
      }
    }
  }

  execFor(stmt: Extract<Stmt, { kind: 'for' }>) {
    const bound = extractForBound(stmt.cond)
    if (bound === null) {
      throw new Error(`For loop at line ${stmt.line} must use a literal bound like i < N`)
    }

    this.execStmts(stmt.init)

    for (let iteration = 0; iteration < bound; iteration++) {
      this.loopTrace.push({
        loopLine: stmt.line,
        iteration,
        variables: { ...this.ctx.currentSnapshot() },
      })
      this.execStmts(stmt.body)
      this.execStmts(stmt.update)
    }
  }

  execWhile(stmt: Extract<Stmt, { kind: 'while' }>, maxK: number) {
    for (let iteration = 0; iteration < maxK; iteration++) {
      this.loopTrace.push({
        loopLine: stmt.line,
        iteration,
        variables: { ...this.ctx.currentSnapshot() },
      })

      const cond = this.evalExpr(stmt.cond)
      const pre = this.ctx.snapshotVersions()

      const bodyState = this.clone()
      bodyState.assumes.push(cond)
      bodyState.execStmts(stmt.body)
      const bodyVersions = bodyState.ctx.snapshotVersions()

      for (const c of bodyState.constraints.slice(this.constraints.length)) {
        this.addConstraint(implies(cond, c))
      }

      const vars = new Set([...pre.keys(), ...bodyVersions.keys()])
      for (const name of vars) {
        const preVer = pre.get(name)
        const bodyVer = bodyVersions.get(name) ?? preVer
        if (bodyVer !== preVer) {
          const sort = this.ctx.sortOf(name)
          const merged = this.ctx.fresh(name)
          const bodyRef =
            bodyVer !== undefined
              ? { op: 'const' as const, name: this.ctx.ssaName(name, bodyVer), sort }
              : this.evalExpr({ kind: 'var', name })
          const preRef =
            preVer !== undefined
              ? { op: 'const' as const, name: this.ctx.ssaName(name, preVer), sort }
              : this.evalExpr({ kind: 'var', name })
          this.addConstraint({
            op: 'eq',
            left: { op: 'const', name: merged, sort },
            right: { op: 'ite', cond, then: bodyRef, else: preRef },
          })
        }
      }
    }
  }
}

type VarType = import('../ir/types').VarType

function buildFunctionCheckQuery(fn: FunctionDef, functions: FunctionRegistry, domainK: number): FunctionCheckQuery {
  const state = new ExecutionState(functions)
  for (const param of fn.params) {
    state.execParam(param.name, param.type)
  }
  state.execStmts(fn.body)

  const numberParam = fn.params.find((p) => p.type === 'number')
  if (!numberParam) {
    throw new Error(`Function "${fn.name}" needs at least one number parameter for input analysis`)
  }

  return {
    name: fn.name,
    line: fn.line,
    param: numberParam.name,
    paramSsaName: state.ctx.ssaName(numberParam.name, 0),
    paramMin: -domainK,
    paramMax: domainK,
    assumptions: state.assumes,
    constraints: state.constraints,
    assertQueries: state.queries,
  }
}

export function buildVerificationPayload(program: Program, whileK: number, domainK: number): VerifyPayload {
  const functions = new FunctionRegistry(program.functions)
  const state = new ExecutionState(functions)

  for (const stmt of program.stmts) {
    if (stmt.kind === 'while') {
      state.execWhile(stmt, whileK)
      continue
    }
    state.execStmt(stmt)
  }

  state.queries.sort((a, b) => a.line - b.line)
  state.domainQueries.sort((a, b) => a.line - b.line)

  const functionQueries: FunctionCheckQuery[] = []
  for (const fn of program.functions) {
    functionQueries.push(buildFunctionCheckQuery(fn, functions, domainK))
  }

  return {
    queries: state.queries,
    domainQueries: state.domainQueries,
    functionQueries,
    debugConstraints: state.debugConstraints,
    loopTrace: state.loopTrace,
    finalVarNames: state.ctx.allCurrentNames(),
  }
}

export { MAX_DOMAIN_VALUES, sexprToString }
