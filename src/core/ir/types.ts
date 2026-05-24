export type BinOp = '+' | '-' | '*' | '/' | '>' | '<' | '>=' | '<=' | '==' | '&&' | '||'

export type VarType = 'number' | 'boolean'

export type Expr =
  | { kind: 'lit'; value: number | boolean }
  | { kind: 'var'; name: string }
  | { kind: 'unary'; op: '-'; arg: Expr }
  | { kind: 'binary'; op: BinOp; left: Expr; right: Expr }
  | { kind: 'call'; name: string; args: Expr[] }

export type Stmt =
  | { kind: 'decl'; name: string; type: VarType; init?: Expr; line: number }
  | { kind: 'assign'; name: string; expr: Expr; line: number }
  | { kind: 'assume'; expr: Expr; line: number }
  | { kind: 'assert'; expr: Expr; line: number }
  | { kind: 'domain'; variable: string; expr: Expr; line: number }
  | { kind: 'if'; cond: Expr; then: Stmt[]; else?: Stmt[]; line: number }
  | { kind: 'for'; init: Stmt[]; cond: Expr; update: Stmt[]; body: Stmt[]; line: number }
  | { kind: 'while'; cond: Expr; body: Stmt[]; line: number }
  | { kind: 'block'; stmts: Stmt[] }

export interface FunctionParam {
  name: string
  type: VarType
}

export interface FunctionDef {
  name: string
  params: FunctionParam[]
  returnType: VarType
  body: Stmt[]
  returnExpr: Expr
  line: number
}

export interface Program {
  functions: FunctionDef[]
  stmts: Stmt[]
}

export interface ParseError {
  line: number
  column: number
  message: string
  code?: string
  params?: Record<string, string | number>
}

export type Sort = 'int' | 'bool'

export type SExpr =
  | { op: 'const'; name: string; sort: Sort }
  | { op: 'int'; value: number }
  | { op: 'bool'; value: boolean }
  | { op: 'not'; arg: SExpr }
  | { op: 'and'; args: SExpr[] }
  | { op: 'or'; args: SExpr[] }
  | { op: 'eq'; left: SExpr; right: SExpr }
  | { op: 'add'; args: SExpr[] }
  | { op: 'sub'; left: SExpr; right: SExpr }
  | { op: 'mul'; args: SExpr[] }
  | { op: 'div'; left: SExpr; right: SExpr }
  | { op: 'gt'; left: SExpr; right: SExpr }
  | { op: 'lt'; left: SExpr; right: SExpr }
  | { op: 'gte'; left: SExpr; right: SExpr }
  | { op: 'lte'; left: SExpr; right: SExpr }
  | { op: 'ite'; cond: SExpr; then: SExpr; else: SExpr }

export interface AssertQuery {
  line: number
  assumptions: SExpr[]
  constraints: SExpr[]
  assertion: SExpr
  label: string
}

export interface DomainQuery {
  line: number
  variable: string
  ssaName: string
  sort: Sort
  assumptions: SExpr[]
  constraints: SExpr[]
  condition: SExpr
  label: string
}

export interface FunctionCheckQuery {
  name: string
  line: number
  param: string
  paramSsaName: string
  paramMin: number
  paramMax: number
  assumptions: SExpr[]
  constraints: SExpr[]
  assertQueries: AssertQuery[]
}

export interface LoopStep {
  loopLine: number
  iteration: number
  variables: Record<string, string>
}

export interface VerifyPayload {
  queries: AssertQuery[]
  domainQueries: DomainQuery[]
  functionQueries: FunctionCheckQuery[]
  debugConstraints: string[]
  loopTrace: LoopStep[]
  finalVarNames: string[]
}

export interface AssertResult {
  line: number
  valid: boolean
  status: 'valid' | 'invalid' | 'unknown'
  counterexample?: Record<string, string>
  label: string
}

export interface DomainResult {
  line: number
  variable: string
  values: string[]
  truncated: boolean
  label: string
}

export interface FunctionResult {
  name: string
  line: number
  param: string
  validInputs: string[]
  paramRange: { min: number; max: number }
  assertResults: AssertResult[]
}

export interface VerifyResult {
  assertResults: AssertResult[]
  domainResults: DomainResult[]
  functionResults: FunctionResult[]
  finalModel?: Record<string, string>
  debugConstraints: string[]
  loopTrace: LoopStep[]
}
