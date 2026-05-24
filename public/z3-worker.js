(() => {
  // src/core/constraints/constraint-builder.ts
  var MAX_DOMAIN_VALUES = 32;

  // src/core/solver/encode.ts
  var solverChecks = 0;
  async function yieldToEventLoop() {
    solverChecks++;
    if (solverChecks % 48 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  async function solverCheck(solver) {
    const status = await solver.check();
    await yieldToEventLoop();
    return status;
  }
  var Z3Env = class {
    ctx;
    Int;
    Bool;
    If;
    Solver;
    pool;
    boolCache = /* @__PURE__ */ new Map();
    arithCache = /* @__PURE__ */ new Map();
    intSymbols = /* @__PURE__ */ new Map();
    boolSymbols = /* @__PURE__ */ new Map();
    constructor(z3, pool) {
      this.pool = pool;
      this.ctx = new z3.Context("main");
      const ctx = this.ctx;
      this.Int = ctx.Int;
      this.Bool = ctx.Bool;
      this.If = ctx.If;
      this.Solver = ctx.Solver;
      for (const expr of pool) this.visit(expr);
    }
    buildBoolAt(index) {
      const cached = this.boolCache.get(index);
      if (cached !== void 0) return cached;
      const built = this.buildBool(this.pool[index]);
      this.boolCache.set(index, built);
      return built;
    }
    buildArithAt(index) {
      const cached = this.arithCache.get(index);
      if (cached !== void 0) return cached;
      const built = this.buildArith(this.pool[index]);
      this.arithCache.set(index, built);
      return built;
    }
    buildBoolList(indices) {
      return indices.map((i) => this.buildBoolAt(i));
    }
    modelValues(model) {
      const values = {};
      for (const [name, sym] of this.intSymbols) values[name] = String(model.eval(sym, true));
      for (const [name, sym] of this.boolSymbols) values[name] = String(model.eval(sym, true));
      return values;
    }
    intConst(name) {
      if (!this.intSymbols.has(name)) this.intSymbols.set(name, this.Int.const(name));
      return this.intSymbols.get(name);
    }
    boolConst(name) {
      if (!this.boolSymbols.has(name)) this.boolSymbols.set(name, this.Bool.const(name));
      return this.boolSymbols.get(name);
    }
    visit(expr) {
      if (expr.op === "const") {
        if (expr.sort === "int") this.intConst(expr.name);
        else this.boolConst(expr.name);
        return;
      }
      switch (expr.op) {
        case "not":
          this.visit(expr.arg);
          break;
        case "and":
        case "or":
        case "add":
        case "mul":
          expr.args.forEach((a) => this.visit(a));
          break;
        case "eq":
        case "sub":
        case "div":
        case "gt":
        case "lt":
        case "gte":
        case "lte":
          this.visit(expr.left);
          this.visit(expr.right);
          break;
        case "ite":
          this.visit(expr.cond);
          this.visit(expr.then);
          this.visit(expr.else);
          break;
      }
    }
    buildArith(expr) {
      const ar = (e) => e;
      switch (expr.op) {
        case "const":
          if (expr.sort !== "int") throw new Error(`Expected int symbol ${expr.name}`);
          return this.intConst(expr.name);
        case "int":
          return this.Int.val(expr.value);
        case "add":
          return expr.args.map((a) => this.buildArith(a)).reduce((a, b) => ar(a).add(b));
        case "sub":
          return ar(this.buildArith(expr.left)).sub(this.buildArith(expr.right));
        case "mul":
          return expr.args.map((a) => this.buildArith(a)).reduce((a, b) => ar(a).mul(b));
        case "div":
          return ar(this.buildArith(expr.left)).div(this.buildArith(expr.right));
        case "ite":
          return this.If(this.buildBool(expr.cond), this.buildArith(expr.then), this.buildArith(expr.else));
        default:
          throw new Error(`Not an arithmetic expression: ${expr.op}`);
      }
    }
    buildBool(expr) {
      const bl = (e) => e;
      const ar = (e) => e;
      switch (expr.op) {
        case "const":
          if (expr.sort !== "bool") throw new Error(`Expected bool symbol ${expr.name}`);
          return this.boolConst(expr.name);
        case "bool":
          return this.Bool.val(expr.value);
        case "not":
          return bl(this.buildBool(expr.arg)).not();
        case "and":
          return expr.args.map((a) => this.buildBool(a)).reduce((a, b) => bl(a).and(b));
        case "or":
          return expr.args.map((a) => this.buildBool(a)).reduce((a, b) => bl(a).or(b));
        case "eq":
          if (isIntExpr(expr.left) && isIntExpr(expr.right)) {
            return ar(this.buildArith(expr.left)).eq(this.buildArith(expr.right));
          }
          return bl(this.buildBool(expr.left)).eq(this.buildBool(expr.right));
        case "gt":
          return ar(this.buildArith(expr.left)).gt(this.buildArith(expr.right));
        case "lt":
          return ar(this.buildArith(expr.left)).lt(this.buildArith(expr.right));
        case "gte":
          return ar(this.buildArith(expr.left)).ge(this.buildArith(expr.right));
        case "lte":
          return ar(this.buildArith(expr.left)).le(this.buildArith(expr.right));
        case "ite":
          return this.If(this.buildBool(expr.cond), this.buildBool(expr.then), this.buildBool(expr.else));
        default:
          throw new Error(`Not a boolean expression: ${expr.op}`);
      }
    }
  };
  function addToSolver(solver, exprs) {
    for (const e of exprs) solver.add(e);
  }
  async function checkAssertQuery(env, query, extra = []) {
    const solver = new env.Solver();
    addToSolver(solver, env.buildBoolList(query.assumptionIndices));
    addToSolver(solver, env.buildBoolList(query.constraintIndices));
    addToSolver(solver, extra);
    const notAssert = env.buildBoolAt(query.assertionIndex).not();
    solver.add(notAssert);
    const status = await solverCheck(solver);
    if (status === "unsat") return { valid: true, status: "valid" };
    if (status === "sat") return { valid: false, status: "invalid", counterexample: env.modelValues(solver.model()) };
    return { valid: false, status: "unknown" };
  }
  async function solveVerification(z3, payload) {
    solverChecks = 0;
    const env = new Z3Env(z3, payload.pool ?? []);
    const queries = payload.queries ?? [];
    const domainQueries = payload.domainQueries ?? [];
    const functionQueries = payload.functionQueries ?? [];
    const assertResults = [];
    for (const query of queries) {
      const outcome = await checkAssertQuery(env, query);
      assertResults.push({
        line: query.line,
        valid: outcome.valid,
        status: outcome.status,
        counterexample: outcome.counterexample,
        label: query.label
      });
    }
    const domainResults = [];
    for (const query of domainQueries) {
      const sym = env.intConst(query.ssaName);
      const symAr = sym;
      const values = [];
      const solver = new env.Solver();
      addToSolver(solver, env.buildBoolList(query.assumptionIndices));
      addToSolver(solver, env.buildBoolList(query.constraintIndices));
      solver.add(env.buildBoolAt(query.conditionIndex));
      let truncated = false;
      for (let i = 0; i < MAX_DOMAIN_VALUES; i++) {
        const status = await solverCheck(solver);
        if (status !== "sat") break;
        const val = solver.model().eval(sym, true);
        values.push(String(val));
        solver.add(symAr.neq(val));
        if (i === MAX_DOMAIN_VALUES - 1) truncated = true;
      }
      domainResults.push({
        line: query.line,
        variable: query.variable,
        values,
        truncated,
        label: query.label
      });
    }
    const functionResults = [];
    for (const fq of functionQueries) {
      const assertQueries = fq.assertQueries ?? [];
      const paramSym = env.intConst(fq.paramSsaName);
      const paramAr = paramSym;
      const validInputs = [];
      const baseAssumes = env.buildBoolList(fq.assumptionIndices);
      const baseConstraints = env.buildBoolList(fq.constraintIndices);
      const fnAssertResults = [];
      for (const aq of assertQueries) {
        const outcome = await checkAssertQuery(env, aq);
        fnAssertResults.push({
          line: aq.line,
          valid: outcome.valid,
          status: outcome.status,
          label: `[${fq.name}] ${aq.label}`
        });
      }
      const baseSolver = new env.Solver();
      addToSolver(baseSolver, baseAssumes);
      addToSolver(baseSolver, baseConstraints);
      for (let v = fq.paramMin; v <= fq.paramMax; v++) {
        const pin = paramAr.eq(env.Int.val(v));
        baseSolver.push();
        baseSolver.add(pin);
        if (await solverCheck(baseSolver) === "unsat") {
          baseSolver.pop();
          continue;
        }
        let allValid = assertQueries.length === 0;
        if (!allValid) {
          for (const aq of assertQueries) {
            const outcome = await checkAssertQuery(env, aq, [pin]);
            if (!outcome.valid) {
              allValid = false;
              break;
            }
          }
        }
        baseSolver.pop();
        if (allValid) validInputs.push(String(v));
      }
      functionResults.push({
        name: fq.name,
        line: fq.line,
        param: fq.param,
        validInputs,
        paramRange: { min: fq.paramMin, max: fq.paramMax },
        assertResults: fnAssertResults
      });
    }
    let finalModel;
    if (queries.length > 0) {
      const last = queries[queries.length - 1];
      const solver = new env.Solver();
      addToSolver(solver, env.buildBoolList(last.assumptionIndices));
      addToSolver(solver, env.buildBoolList(last.constraintIndices));
      const status = await solverCheck(solver);
      if (status === "sat") finalModel = env.modelValues(solver.model());
    }
    return {
      assertResults,
      domainResults,
      functionResults,
      finalModel,
      debugConstraints: [],
      loopTrace: []
    };
  }
  function isIntExpr(expr) {
    if (expr.op === "const") return expr.sort === "int";
    return ["int", "add", "sub", "mul", "div", "ite"].includes(expr.op);
  }

  // src/workers/z3-worker.ts
  async function solve(z3, data) {
    return solveVerification(z3, data);
  }

  // public/z3-worker.js.entry.tmp.js
  globalThis.__filename = new URL("/z3-built.js", self.location.href).href;
  importScripts("/z3-built.js");
  globalThis.global = globalThis;
  globalThis.global.initZ3 = globalThis.initZ3;
  importScripts("/z3-wrapper.js");
  var _z3 = null;
  async function getZ3() {
    if (_z3) return _z3;
    _z3 = await globalThis.z3Init();
    return _z3;
  }
  self.postMessage({ type: "z3:ready" });
  self.onmessage = async (e) => {
    try {
      const z3 = await getZ3();
      const solveFn = solve;
      if (typeof solveFn !== "function") {
        throw new Error("Worker must export a 'solve' function or have a default export.");
      }
      const result = await solveFn(z3, e.data);
      self.postMessage({ type: "z3:result", ok: true, result });
    } catch (err) {
      self.postMessage({ type: "z3:result", ok: false, error: String(err) });
    }
  };
})();
