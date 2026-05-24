import type { Expr, FunctionDef, Stmt, VarType } from '../ir/types'

export class FunctionRegistry {
  private readonly defs = new Map<string, FunctionDef>()

  constructor(functions: FunctionDef[]) {
    for (const fn of functions) {
      if (this.defs.has(fn.name)) {
        throw new Error(`Duplicate function "${fn.name}" at line ${fn.line}`)
      }
      this.defs.set(fn.name, fn)
    }
  }

  get(name: string): FunctionDef {
    const fn = this.defs.get(name)
    if (!fn) throw new Error(`Unknown function "${name}"`)
    return fn
  }

  has(name: string): boolean {
    return this.defs.has(name)
  }

  all(): FunctionDef[] {
    return [...this.defs.values()]
  }
}

export function substituteParams(body: Stmt[], params: FunctionDef['params'], args: Expr[]): Stmt[] {
  const rename = new Map<string, string>()
  for (const p of params) {
    rename.set(p.name, `__arg_${p.name}`)
  }

  const rewriteExpr = (expr: Expr): Expr => substituteExpr(expr, rename)

  const rewriteStmt = (stmt: Stmt): Stmt => {
    switch (stmt.kind) {
      case 'decl':
        return stmt.init !== undefined ? { ...stmt, init: rewriteExpr(stmt.init) } : stmt
      case 'assign':
        return { ...stmt, expr: rewriteExpr(stmt.expr) }
      case 'assume':
        return { ...stmt, expr: rewriteExpr(stmt.expr) }
      case 'assert':
        return { ...stmt, expr: rewriteExpr(stmt.expr) }
      case 'domain':
        return { ...stmt, expr: rewriteExpr(stmt.expr) }
      case 'if':
        return {
          ...stmt,
          cond: rewriteExpr(stmt.cond),
          then: stmt.then.map(rewriteStmt),
          else: stmt.else?.map(rewriteStmt),
        }
      case 'for':
        return {
          ...stmt,
          cond: rewriteExpr(stmt.cond),
          init: stmt.init.map(rewriteStmt),
          update: stmt.update.map(rewriteStmt),
          body: stmt.body.map(rewriteStmt),
        }
      case 'while':
        return { ...stmt, cond: rewriteExpr(stmt.cond), body: stmt.body.map(rewriteStmt) }
      case 'block':
        return { ...stmt, stmts: stmt.stmts.map(rewriteStmt) }
    }
  }

  const prelude: Stmt[] = params.map((p, i) => ({
    kind: 'decl' as const,
    name: rename.get(p.name)!,
    type: p.type,
    init: args[i],
    line: 0,
  }))

  return [...prelude, ...body.map(rewriteStmt)]
}

export function substituteExpr(expr: Expr, rename: Map<string, string>): Expr {
  switch (expr.kind) {
    case 'lit':
      return expr
    case 'call':
      return { ...expr, args: expr.args.map((a) => substituteExpr(a, rename)) }
    case 'var':
      return rename.has(expr.name) ? { kind: 'var', name: rename.get(expr.name)! } : expr
    case 'unary':
      return { kind: 'unary', op: '-', arg: substituteExpr(expr.arg, rename) }
    case 'binary':
      return {
        kind: 'binary',
        op: expr.op,
        left: substituteExpr(expr.left, rename),
        right: substituteExpr(expr.right, rename),
      }
  }
}

export function parseType(text: string | undefined): VarType {
  if (text === 'boolean') return 'boolean'
  return 'number'
}
