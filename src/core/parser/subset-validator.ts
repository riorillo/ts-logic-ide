import {
  Node,
  SyntaxKind,
  VariableDeclarationKind,
  type BinaryExpression,
  type CallExpression,
  type Expression,
  type SourceFile,
  type Statement,
} from 'ts-morph'
import type { ParseError } from '../ir/types'
import { formatParseError, type ParseErrorCode } from '../../i18n/parse-errors'

const ALLOWED_BIN_OPS = new Set([
  SyntaxKind.PlusToken,
  SyntaxKind.MinusToken,
  SyntaxKind.AsteriskToken,
  SyntaxKind.SlashToken,
  SyntaxKind.GreaterThanToken,
  SyntaxKind.LessThanToken,
  SyntaxKind.GreaterThanEqualsToken,
  SyntaxKind.LessThanEqualsToken,
  SyntaxKind.EqualsEqualsToken,
  SyntaxKind.AmpersandAmpersandToken,
  SyntaxKind.BarBarToken,
])

const FORBIDDEN_STMT_KINDS = new Set([
  SyntaxKind.ClassDeclaration,
  SyntaxKind.InterfaceDeclaration,
  SyntaxKind.TypeAliasDeclaration,
  SyntaxKind.EnumDeclaration,
  SyntaxKind.ImportDeclaration,
  SyntaxKind.ExportDeclaration,
  SyntaxKind.TryStatement,
  SyntaxKind.SwitchStatement,
  SyntaxKind.DoStatement,
  SyntaxKind.ReturnStatement,
  SyntaxKind.ThrowStatement,
])

const BUILTIN_STMT_CALLS = new Set(['assume', 'assert', 'domain'])
const BUILTIN_EXPR_CALLS = new Set(['assume', 'assert', 'domain'])

export function validateSubset(sourceFile: SourceFile): ParseError[] {
  const errors: ParseError[] = []

  for (const stmt of sourceFile.getStatements()) {
    if (stmt.getKind() === SyntaxKind.FunctionDeclaration) {
      validateFunctionDeclaration(stmt.asKindOrThrow(SyntaxKind.FunctionDeclaration), errors)
    } else {
      validateStatement(stmt, errors)
    }
  }

  return errors
}

function loc(node: Node): { line: number; column: number } {
  const start = node.getStart(true)
  const { line, column } = node.getSourceFile().getLineAndColumnAtPos(start)
  return { line: line + 1, column: column + 1 }
}

function error(
  node: Node,
  code: ParseErrorCode,
  errors: ParseError[],
  params: Record<string, string | number> = {},
) {
  const { line, column } = loc(node)
  errors.push({
    line,
    column,
    code,
    params,
    message: formatParseError(code, params, 'en'),
  })
}

function validateStatement(stmt: Statement, errors: ParseError[]) {
  const kind = stmt.getKind()

  if (FORBIDDEN_STMT_KINDS.has(kind)) {
    error(stmt, 'unsupportedStatement', errors, { kind: stmt.getKindName() })
    return
  }

  switch (kind) {
    case SyntaxKind.VariableStatement:
      validateVariableStatement(stmt, errors)
      break
    case SyntaxKind.ExpressionStatement:
      validateExpressionStatement(stmt.asKindOrThrow(SyntaxKind.ExpressionStatement), errors)
      break
    case SyntaxKind.IfStatement:
      validateIfStatement(stmt, errors)
      break
    case SyntaxKind.ForStatement:
      validateForStatement(stmt, errors)
      break
    case SyntaxKind.WhileStatement:
      validateWhileStatement(stmt, errors)
      break
    case SyntaxKind.Block:
      for (const inner of stmt.asKindOrThrow(SyntaxKind.Block).getStatements()) {
        validateStatement(inner, errors)
      }
      break
    default:
      error(stmt, 'unsupportedStatement', errors, { kind: stmt.getKindName() })
  }
}

function validateVariableDeclarationList(
  list: import('ts-morph').VariableDeclarationList,
  errors: ParseError[],
) {
  if (list.getDeclarationKind() !== VariableDeclarationKind.Let) {
    error(list, 'onlyLet', errors)
  }

  for (const decl of list.getDeclarations()) {
    const typeNode = decl.getTypeNode()
    const typeText = typeNode?.getText()
    if (typeText && typeText !== 'number' && typeText !== 'boolean') {
      error(decl, 'unsupportedType', errors, { type: typeText })
    }
    const init = decl.getInitializer()
    if (!init && !typeNode) {
      error(decl, 'variableNeedsTypeOrInit', errors)
    }
    if (init) validateExpression(init, errors)
  }
}

function validateVariableStatement(stmt: Statement, errors: ParseError[]) {
  const declList = stmt.getFirstChildByKind(SyntaxKind.VariableDeclarationList)
  if (!declList) return

  validateVariableDeclarationList(declList.asKindOrThrow(SyntaxKind.VariableDeclarationList), errors)
}

function validateExpressionStatement(stmt: import('ts-morph').ExpressionStatement, errors: ParseError[]) {
  const expr = stmt.getExpression()

  if (expr.getKind() === SyntaxKind.CallExpression) {
    validateCallExpression(expr.asKindOrThrow(SyntaxKind.CallExpression), errors)
    return
  }

  if (expr.getKind() === SyntaxKind.BinaryExpression) {
    const bin = expr.asKindOrThrow(SyntaxKind.BinaryExpression)
    if (bin.getOperatorToken().getKind() === SyntaxKind.EqualsToken) {
      validateExpression(bin.getRight(), errors)
      return
    }
  }

  error(expr, 'expectedAssignAssumeAssertDomain', errors)
}

function validateFunctionDeclaration(fn: import('ts-morph').FunctionDeclaration, errors: ParseError[]) {
  if (!fn.getName()) {
    error(fn, 'functionMustHaveName', errors)
  }

  const retType = fn.getReturnTypeNode()?.getText()
  if (retType && retType !== 'number' && retType !== 'boolean') {
    error(fn, 'unsupportedReturnType', errors, { type: retType })
  }

  for (const param of fn.getParameters()) {
    const t = param.getTypeNode()?.getText()
    if (t && t !== 'number' && t !== 'boolean') {
      error(param, 'unsupportedParamType', errors, { type: t })
    }
  }

  const body = fn.getBody()
  if (!body || body.getKind() !== SyntaxKind.Block) {
    error(fn, 'functionBodyMustBeBlock', errors)
    return
  }

  let hasReturn = false
  for (const inner of body.asKindOrThrow(SyntaxKind.Block).getStatements()) {
    if (inner.getKind() === SyntaxKind.ReturnStatement) {
      hasReturn = true
      const ret = inner.asKindOrThrow(SyntaxKind.ReturnStatement)
      if (ret.getExpression()) validateExpression(ret.getExpression()!, errors)
      continue
    }
    validateStatement(inner, errors)
  }
  if (!hasReturn) {
    error(body, 'functionMustReturn', errors)
  }
}

function validateCallExpression(call: CallExpression, errors: ParseError[]) {
  const expr = call.getExpression()
  if (expr.getKind() !== SyntaxKind.Identifier) {
    error(call, 'onlySimpleCalls', errors)
    return
  }

  const name = expr.getText()
  if (!BUILTIN_STMT_CALLS.has(name)) {
    error(call, 'unsupportedCall', errors, { name })
    return
  }

  if (name === 'domain') {
    if (call.getArguments().length !== 2) {
      error(call, 'domainTwoArgs', errors)
      return
    }
    if (call.getArguments()[0].getKind() !== SyntaxKind.Identifier) {
      error(call, 'domainFirstArgVariable', errors)
    }
    validateExpression(call.getArguments()[1] as Expression, errors)
    return
  }

  if (call.getArguments().length !== 1) {
    error(call, 'builtinOneArg', errors, { name })
    return
  }

  validateExpression(call.getArguments()[0] as Expression, errors)
}

function validateUserCallExpression(call: CallExpression, errors: ParseError[]) {
  const expr = call.getExpression()
  if (expr.getKind() !== SyntaxKind.Identifier) {
    error(call, 'userCallOnlySimple', errors)
    return
  }
  const name = expr.getText()
  if (BUILTIN_EXPR_CALLS.has(name)) {
    error(call, 'builtinTopLevel', errors, { name })
    return
  }
  for (const arg of call.getArguments()) {
    validateExpression(arg as Expression, errors)
  }
}

function validateIfStatement(stmt: Statement, errors: ParseError[]) {
  const ifStmt = stmt.asKindOrThrow(SyntaxKind.IfStatement)
  validateExpression(ifStmt.getExpression(), errors)
  validateBlockLike(ifStmt.getThenStatement(), errors)
  const elseStmt = ifStmt.getElseStatement()
  if (elseStmt) validateBlockLike(elseStmt, errors)
}

function validateForStatement(stmt: Statement, errors: ParseError[]) {
  const forStmt = stmt.asKindOrThrow(SyntaxKind.ForStatement)
  const initializer = forStmt.getInitializer()
  if (initializer) {
    if (initializer.getKind() === SyntaxKind.VariableDeclarationList) {
      validateVariableDeclarationList(initializer as import('ts-morph').VariableDeclarationList, errors)
    } else {
      validateExpression(initializer as Expression, errors)
    }
  }

  const condition = forStmt.getCondition()
  if (condition) validateExpression(condition, errors)

  const incrementor = forStmt.getIncrementor()
  if (incrementor) validateExpression(incrementor as Expression, errors)

  validateBlockLike(forStmt.getStatement(), errors)
}

function validateWhileStatement(stmt: Statement, errors: ParseError[]) {
  const whileStmt = stmt.asKindOrThrow(SyntaxKind.WhileStatement)
  validateExpression(whileStmt.getExpression(), errors)
  validateBlockLike(whileStmt.getStatement(), errors)
}

function validateBlockLike(stmt: Statement, errors: ParseError[]) {
  if (stmt.getKind() === SyntaxKind.Block) {
    for (const inner of stmt.asKindOrThrow(SyntaxKind.Block).getStatements()) {
      validateStatement(inner, errors)
    }
    return
  }
  validateStatement(stmt, errors)
}

function validateExpression(expr: Expression, errors: ParseError[]) {
  switch (expr.getKind()) {
    case SyntaxKind.NumericLiteral:
    case SyntaxKind.TrueKeyword:
    case SyntaxKind.FalseKeyword:
    case SyntaxKind.Identifier:
      return
    case SyntaxKind.ParenthesizedExpression:
      validateExpression(expr.asKindOrThrow(SyntaxKind.ParenthesizedExpression).getExpression(), errors)
      return
    case SyntaxKind.PostfixUnaryExpression: {
      const unary = expr.asKindOrThrow(SyntaxKind.PostfixUnaryExpression)
      const op = unary.getOperatorToken()
      if (op !== SyntaxKind.PlusPlusToken && op !== SyntaxKind.MinusMinusToken) {
        error(unary, 'postfixOnlyIncDec', errors)
      }
      validateExpression(unary.getOperand(), errors)
      return
    }
    case SyntaxKind.PrefixUnaryExpression: {
      const unary = expr.asKindOrThrow(SyntaxKind.PrefixUnaryExpression)
      if (unary.getOperatorToken() !== SyntaxKind.MinusToken) {
        error(unary, 'unaryMinusOnly', errors)
      }
      validateExpression(unary.getOperand(), errors)
      return
    }
    case SyntaxKind.BinaryExpression:
      validateBinaryExpression(expr.asKindOrThrow(SyntaxKind.BinaryExpression), errors)
      return
    case SyntaxKind.CallExpression:
      validateUserCallExpression(expr.asKindOrThrow(SyntaxKind.CallExpression), errors)
      return
    default:
      error(expr, 'unsupportedExpression', errors, { kind: expr.getKindName() })
  }
}

function validateBinaryExpression(bin: BinaryExpression, errors: ParseError[]) {
  const op = bin.getOperatorToken().getKind()
  if (!ALLOWED_BIN_OPS.has(op)) {
    error(bin, 'unsupportedOperator', errors, { op: bin.getOperatorToken().getText() })
  }
  validateExpression(bin.getLeft(), errors)
  validateExpression(bin.getRight(), errors)
}
