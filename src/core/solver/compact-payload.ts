import type { AssertQuery, DomainQuery, FunctionCheckQuery, SExpr, VerifyPayload, WorkerVerifyPayload } from '../ir/types'

function internExpr(pool: SExpr[], table: Map<SExpr, number>, expr: SExpr): number {
  const existing = table.get(expr)
  if (existing !== undefined) return existing
  const index = pool.length
  pool.push(expr)
  table.set(expr, index)
  return index
}

function internList(pool: SExpr[], table: Map<SExpr, number>, list: SExpr[]): number[] {
  return list.map((expr) => internExpr(pool, table, expr))
}

function indexAssertQuery(
  pool: SExpr[],
  table: Map<SExpr, number>,
  query: AssertQuery,
): WorkerVerifyPayload['queries'][number] {
  return {
    line: query.line,
    assumptionIndices: internList(pool, table, query.assumptions),
    constraintIndices: internList(pool, table, query.constraints),
    assertionIndex: internExpr(pool, table, query.assertion),
    label: query.label,
  }
}

function indexDomainQuery(
  pool: SExpr[],
  table: Map<SExpr, number>,
  query: DomainQuery,
): WorkerVerifyPayload['domainQueries'][number] {
  return {
    line: query.line,
    variable: query.variable,
    ssaName: query.ssaName,
    assumptionIndices: internList(pool, table, query.assumptions),
    constraintIndices: internList(pool, table, query.constraints),
    conditionIndex: internExpr(pool, table, query.condition),
    label: query.label,
  }
}

function indexFunctionQuery(
  pool: SExpr[],
  table: Map<SExpr, number>,
  query: FunctionCheckQuery,
): WorkerVerifyPayload['functionQueries'][number] {
  return {
    name: query.name,
    line: query.line,
    param: query.param,
    paramSsaName: query.paramSsaName,
    paramMin: query.paramMin,
    paramMax: query.paramMax,
    assumptionIndices: internList(pool, table, query.assumptions),
    constraintIndices: internList(pool, table, query.constraints),
    assertQueries: query.assertQueries.map((aq) => indexAssertQuery(pool, table, aq)),
  }
}

/** Strip UI-only fields and deduplicate shared S-expressions for postMessage. */
export function compactForWorker(payload: VerifyPayload): WorkerVerifyPayload {
  const pool: SExpr[] = []
  const table = new Map<SExpr, number>()

  return {
    pool,
    queries: payload.queries.map((q) => indexAssertQuery(pool, table, q)),
    domainQueries: payload.domainQueries.map((q) => indexDomainQuery(pool, table, q)),
    functionQueries: payload.functionQueries.map((q) => indexFunctionQuery(pool, table, q)),
  }
}
