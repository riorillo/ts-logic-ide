import { Project, SyntaxKind, type Expression, type Statement } from 'ts-morph'
import type { BinOp, Expr, FunctionDef, FunctionParam, ParseError, Program, Stmt } from '../ir/types'
import { parseType } from '../functions/registry'
import { validateSubset } from './subset-validator'

export type ParseResult =
  | { ok: true; program: Program }
  | { ok: false; errors: ParseError[] }

export function parseProgram(source: string): ParseResult {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile('program.ts', source, { overwrite: true })

  const errors = validateSubset(sourceFile)
  if (errors.length > 0) {
    return { ok: false, errors }
  }

  try {
    const functions: FunctionDef[] = []
    const stmts: Stmt[] = []

    for (const stmt of sourceFile.getStatements()) {
      if (stmt.getKind() === SyntaxKind.FunctionDeclaration) {
        functions.push(parseFunctionDeclaration(stmt.asKindOrThrow(SyntaxKind.FunctionDeclaration)))
      } else {
        stmts.push(...parseStatement(stmt))
      }
    }

    return { ok: true, program: { functions, stmts } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown parse error'
    return { ok: false, errors: [{ line: 1, column: 1, message }] }
  }
}

function lineOf(node: { getStart: (includeTrivia?: boolean) => number; getSourceFile: () => { getLineAndColumnAtPos: (pos: number) => { line: number } } }): number {
  const start = node.getStart(true)
  return node.getSourceFile().getLineAndColumnAtPos(start).line + 1
}

function parseFunctionDeclaration(fn: import('ts-morph').FunctionDeclaration): FunctionDef {
  const line = lineOf(fn)
  const name = fn.getName()
  if (!name) throw new Error(`Function at line ${line} must have a name`)

  const params: FunctionParam[] = fn.getParameters().map((p) => ({
    name: p.getName(),
    type: parseType(p.getTypeNode()?.getText()),
  }))

  const returnType = parseType(fn.getReturnTypeNode()?.getText() ?? 'number')
  const bodyNode = fn.getBody()
  if (!bodyNode || bodyNode.getKind() !== SyntaxKind.Block) {
    throw new Error(`Function "${name}" must have a block body at line ${line}`)
  }

  const { body, returnExpr } = parseFunctionBody(bodyNode.asKindOrThrow(SyntaxKind.Block))
  return { name, params, returnType, body, returnExpr, line }
}

function parseFunctionBody(block: import('ts-morph').Block): { body: Stmt[]; returnExpr: Expr } {
  const body: Stmt[] = []
  let returnExpr: Expr | null = null

  for (const stmt of block.getStatements()) {
    if (stmt.getKind() === SyntaxKind.ReturnStatement) {
      const ret = stmt.asKindOrThrow(SyntaxKind.ReturnStatement)
      const expr = ret.getExpression()
      if (!expr) throw new Error('Return statement requires an expression')
      returnExpr = parseExpression(expr)
      continue
    }
    body.push(...parseStatement(stmt))
  }

  if (!returnExpr) throw new Error('Function body must end with a return statement')
  return { body, returnExpr }
}

function parseStatement(stmt: Statement): Stmt[] {
  switch (stmt.getKind()) {
    case SyntaxKind.VariableStatement:
      return parseVariableStatement(stmt.asKindOrThrow(SyntaxKind.VariableStatement))
    case SyntaxKind.ExpressionStatement:
      return [parseExpressionStatement(stmt.asKindOrThrow(SyntaxKind.ExpressionStatement))]
    case SyntaxKind.IfStatement:
      return [parseIfStatement(stmt.asKindOrThrow(SyntaxKind.IfStatement))]
    case SyntaxKind.ForStatement:
      return [parseForStatement(stmt.asKindOrThrow(SyntaxKind.ForStatement))]
    case SyntaxKind.WhileStatement:
      return [parseWhileStatement(stmt.asKindOrThrow(SyntaxKind.WhileStatement))]
    case SyntaxKind.Block:
      return [{ kind: 'block', stmts: stmt.asKindOrThrow(SyntaxKind.Block).getStatements().flatMap((s) => parseStatement(s)) }]
    default:
      throw new Error(`Unsupported statement at line ${lineOf(stmt)}`)
  }
}

function parseVariableDeclarationList(declList: import('ts-morph').VariableDeclarationList, line: number): Stmt[] {
  const result: Stmt[] = []
  for (const decl of declList.getDeclarations()) {
    const name = decl.getName()
    const type = parseType(decl.getTypeNode()?.getText())
    const initNode = decl.getInitializer()
    const typeNode = decl.getTypeNode()
    if (!initNode && !typeNode) {
      throw new Error(`Variable "${name}" needs a type annotation or an initializer at line ${line}`)
    }
    result.push({
      kind: 'decl',
      name,
      type,
      ...(initNode ? { init: parseExpression(initNode) } : {}),
      line,
    })
  }
  return result
}

function parseVariableStatement(stmt: import('ts-morph').VariableStatement): Stmt[] {
  const declList = stmt.getFirstChildByKind(SyntaxKind.VariableDeclarationList)!
  return parseVariableDeclarationList(declList, lineOf(stmt))
}

function parseCallExpression(call: import('ts-morph').CallExpression, line: number): Stmt {
  const callee = call.getExpression()
  if (callee.getKind() !== SyntaxKind.Identifier) {
    throw new Error(`Only simple calls supported at line ${line}`)
  }
  const name = callee.getText()
  const args = call.getArguments().map((a) => parseExpression(a as Expression))

  if (name === 'assume') {
    if (args.length !== 1) throw new Error(`assume(...) expects 1 argument at line ${line}`)
    return { kind: 'assume', expr: args[0], line }
  }
  if (name === 'assert') {
    if (args.length !== 1) throw new Error(`assert(...) expects 1 argument at line ${line}`)
    return { kind: 'assert', expr: args[0], line }
  }
  if (name === 'domain') {
    if (args.length !== 2) throw new Error(`domain(var, expr) expects 2 arguments at line ${line}`)
    const varArg = call.getArguments()[0]
    if (varArg.getKind() !== SyntaxKind.Identifier) {
      throw new Error(`domain() first argument must be a variable name at line ${line}`)
    }
    return { kind: 'domain', variable: varArg.getText(), expr: args[1], line }
  }

  throw new Error(`Unknown statement call "${name}" at line ${line}. Use assume, assert, or domain`)
}

function parseExpressionStatement(stmt: import('ts-morph').ExpressionStatement): Stmt {
  const line = lineOf(stmt)
  const expr = stmt.getExpression()

  if (expr.getKind() === SyntaxKind.CallExpression) {
    return parseCallExpression(expr.asKindOrThrow(SyntaxKind.CallExpression), line)
  }

  if (expr.getKind() === SyntaxKind.BinaryExpression) {
    const bin = expr.asKindOrThrow(SyntaxKind.BinaryExpression)
    if (bin.getOperatorToken().getKind() === SyntaxKind.EqualsToken) {
      const name = bin.getLeft().getText()
      return { kind: 'assign', name, expr: parseExpression(bin.getRight()), line }
    }
  }

  throw new Error(`Unsupported expression statement at line ${line}`)
}

function parseIfStatement(stmt: import('ts-morph').IfStatement): Stmt {
  const line = lineOf(stmt)
  return {
    kind: 'if',
    cond: parseExpression(stmt.getExpression()),
    then: parseBlockLike(stmt.getThenStatement()),
    else: stmt.getElseStatement() ? parseBlockLike(stmt.getElseStatement()!) : undefined,
    line,
  }
}

function parseForStatement(stmt: import('ts-morph').ForStatement): Stmt {
  const line = lineOf(stmt)
  const init: Stmt[] = []
  const initializer = stmt.getInitializer()

  if (initializer) {
    if (initializer.getKind() === SyntaxKind.VariableDeclarationList) {
      init.push(...parseVariableDeclarationList(initializer as import('ts-morph').VariableDeclarationList, line))
    } else {
      init.push(parseInitAssignment(initializer as Expression, line))
    }
  }

  const condition = stmt.getCondition()
  if (!condition) throw new Error(`For loop at line ${line} requires a condition`)

  const incrementor = stmt.getIncrementor()
  const update = incrementor ? [parseUpdateStatement(incrementor as Expression, line)] : []

  return {
    kind: 'for',
    init,
    cond: parseExpression(condition),
    update,
    body: parseBlockLike(stmt.getStatement()),
    line,
  }
}

function parseWhileStatement(stmt: import('ts-morph').WhileStatement): Stmt {
  return {
    kind: 'while',
    cond: parseExpression(stmt.getExpression()),
    body: parseBlockLike(stmt.getStatement()),
    line: lineOf(stmt),
  }
}

function parseBlockLike(stmt: Statement): Stmt[] {
  if (stmt.getKind() === SyntaxKind.Block) {
    return stmt.asKindOrThrow(SyntaxKind.Block).getStatements().flatMap((s) => parseStatement(s))
  }
  return parseStatement(stmt)
}

function parseInitAssignment(expr: Expression, line: number): Stmt {
  if (expr.getKind() === SyntaxKind.BinaryExpression) {
    const bin = expr.asKindOrThrow(SyntaxKind.BinaryExpression)
    if (bin.getOperatorToken().getKind() === SyntaxKind.EqualsToken) {
      return { kind: 'assign', name: bin.getLeft().getText(), expr: parseExpression(bin.getRight()), line }
    }
  }
  throw new Error(`Unsupported for-loop initializer at line ${line}`)
}

function parseUpdateStatement(expr: Expression, line: number): Stmt {
  if (expr.getKind() === SyntaxKind.BinaryExpression) {
    const bin = expr.asKindOrThrow(SyntaxKind.BinaryExpression)
    if (bin.getOperatorToken().getKind() === SyntaxKind.EqualsToken) {
      return { kind: 'assign', name: bin.getLeft().getText(), expr: parseExpression(bin.getRight()), line }
    }
  }

  if (expr.getKind() === SyntaxKind.PostfixUnaryExpression) {
    const unary = expr.asKindOrThrow(SyntaxKind.PostfixUnaryExpression)
    if (unary.getOperatorToken() === SyntaxKind.PlusPlusToken) {
      const name = unary.getOperand().getText()
      return {
        kind: 'assign',
        name,
        expr: { kind: 'binary', op: '+', left: { kind: 'var', name }, right: { kind: 'lit', value: 1 } },
        line,
      }
    }
  }

  if (expr.getKind() === SyntaxKind.PrefixUnaryExpression) {
    const unary = expr.asKindOrThrow(SyntaxKind.PrefixUnaryExpression)
    if (unary.getOperatorToken() === SyntaxKind.PlusPlusToken) {
      const name = unary.getOperand().getText()
      return {
        kind: 'assign',
        name,
        expr: { kind: 'binary', op: '+', left: { kind: 'var', name }, right: { kind: 'lit', value: 1 } },
        line,
      }
    }
  }

  throw new Error(`Unsupported for-loop update at line ${line}`)
}

function parseExpression(expr: Expression): Expr {
  switch (expr.getKind()) {
    case SyntaxKind.NumericLiteral:
      return { kind: 'lit', value: Number(expr.getText()) }
    case SyntaxKind.TrueKeyword:
      return { kind: 'lit', value: true }
    case SyntaxKind.FalseKeyword:
      return { kind: 'lit', value: false }
    case SyntaxKind.Identifier:
      return { kind: 'var', name: expr.getText() }
    case SyntaxKind.CallExpression: {
      const call = expr.asKindOrThrow(SyntaxKind.CallExpression)
      const callee = call.getExpression()
      if (callee.getKind() !== SyntaxKind.Identifier) {
        throw new Error(`Only simple function calls are supported`)
      }
      const name = callee.getText()
      if (name === 'assume' || name === 'assert' || name === 'domain') {
        throw new Error(`"${name}" must be used as a top-level statement`)
      }
      return {
        kind: 'call',
        name,
        args: call.getArguments().map((a) => parseExpression(a as Expression)),
      }
    }
    case SyntaxKind.ParenthesizedExpression:
      return parseExpression(expr.asKindOrThrow(SyntaxKind.ParenthesizedExpression).getExpression())
    case SyntaxKind.PrefixUnaryExpression: {
      const unary = expr.asKindOrThrow(SyntaxKind.PrefixUnaryExpression)
      if (unary.getOperatorToken() === SyntaxKind.MinusToken) {
        return { kind: 'unary', op: '-', arg: parseExpression(unary.getOperand()) }
      }
      throw new Error('Unsupported unary expression')
    }
    case SyntaxKind.BinaryExpression:
      return parseBinaryExpression(expr.asKindOrThrow(SyntaxKind.BinaryExpression))
    default:
      throw new Error(`Unsupported expression: ${expr.getKindName()}`)
  }
}

function parseBinaryExpression(bin: import('ts-morph').BinaryExpression): Expr {
  const opKind = bin.getOperatorToken().getKind()
  const opMap: Partial<Record<SyntaxKind, BinOp>> = {
    [SyntaxKind.PlusToken]: '+',
    [SyntaxKind.MinusToken]: '-',
    [SyntaxKind.AsteriskToken]: '*',
    [SyntaxKind.SlashToken]: '/',
    [SyntaxKind.GreaterThanToken]: '>',
    [SyntaxKind.LessThanToken]: '<',
    [SyntaxKind.GreaterThanEqualsToken]: '>=',
    [SyntaxKind.LessThanEqualsToken]: '<=',
    [SyntaxKind.EqualsEqualsToken]: '==',
    [SyntaxKind.AmpersandAmpersandToken]: '&&',
    [SyntaxKind.BarBarToken]: '||',
  }

  const op = opMap[opKind]
  if (!op) throw new Error(`Unsupported operator ${bin.getOperatorToken().getText()}`)

  return {
    kind: 'binary',
    op,
    left: parseExpression(bin.getLeft()),
    right: parseExpression(bin.getRight()),
  }
}
