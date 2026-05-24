(() => {
  // src/core/constraints/constraint-builder.ts
  var MAX_DOMAIN_VALUES = 32;

  // src/core/solver/encode.ts
  async function checkAssertValid(ctx, buildBool, query, extra = []) {
    const Solver = ctx.Solver;
    const solver = new Solver();
    for (const assumption of query.assumptions) solver.add(buildBool(assumption));
    for (const constraint of query.constraints) solver.add(buildBool(constraint));
    for (const e of extra) solver.add(e);
    const notAssert = buildBool(query.assertion).not();
    solver.add(notAssert);
    return await solver.check() === "unsat";
  }
  async function solveVerification(z3, payload) {
    const queries = payload.queries ?? [];
    const domainQueries = payload.domainQueries ?? [];
    const functionQueries = payload.functionQueries ?? [];
    const ctx = new z3.Context("main");
    const Int = ctx.Int;
    const Bool = ctx.Bool;
    const If = ctx.If;
    const SolverCtor = ctx.Solver;
    const intSymbols = /* @__PURE__ */ new Map();
    const boolSymbols = /* @__PURE__ */ new Map();
    const intConst = (name) => {
      if (!intSymbols.has(name)) intSymbols.set(name, Int.const(name));
      return intSymbols.get(name);
    };
    const boolConst = (name) => {
      if (!boolSymbols.has(name)) boolSymbols.set(name, Bool.const(name));
      return boolSymbols.get(name);
    };
    const buildArith = (expr) => {
      const ar = (e) => e;
      switch (expr.op) {
        case "const":
          if (expr.sort !== "int") throw new Error(`Expected int symbol ${expr.name}`);
          return intConst(expr.name);
        case "int":
          return Int.val(expr.value);
        case "add":
          return expr.args.map(buildArith).reduce((a, b) => ar(a).add(b));
        case "sub":
          return ar(buildArith(expr.left)).sub(buildArith(expr.right));
        case "mul":
          return expr.args.map(buildArith).reduce((a, b) => ar(a).mul(b));
        case "div":
          return ar(buildArith(expr.left)).div(buildArith(expr.right));
        case "ite":
          return If(buildBool(expr.cond), buildArith(expr.then), buildArith(expr.else));
        default:
          throw new Error(`Not an arithmetic expression: ${expr.op}`);
      }
    };
    const buildBool = (expr) => {
      const bl = (e) => e;
      const ar = (e) => e;
      switch (expr.op) {
        case "const":
          if (expr.sort !== "bool") throw new Error(`Expected bool symbol ${expr.name}`);
          return boolConst(expr.name);
        case "bool":
          return Bool.val(expr.value);
        case "not":
          return bl(buildBool(expr.arg)).not();
        case "and":
          return expr.args.map(buildBool).reduce((a, b) => bl(a).and(b));
        case "or":
          return expr.args.map(buildBool).reduce((a, b) => bl(a).or(b));
        case "eq":
          if (isIntExpr(expr.left) && isIntExpr(expr.right)) {
            return ar(buildArith(expr.left)).eq(buildArith(expr.right));
          }
          return bl(buildBool(expr.left)).eq(buildBool(expr.right));
        case "gt":
          return ar(buildArith(expr.left)).gt(buildArith(expr.right));
        case "lt":
          return ar(buildArith(expr.left)).lt(buildArith(expr.right));
        case "gte":
          return ar(buildArith(expr.left)).ge(buildArith(expr.right));
        case "lte":
          return ar(buildArith(expr.left)).le(buildArith(expr.right));
        case "ite":
          return If(buildBool(expr.cond), buildBool(expr.then), buildBool(expr.else));
        default:
          throw new Error(`Not a boolean expression: ${expr.op}`);
      }
    };
    const visit = (expr) => {
      if (expr.op === "const") {
        if (expr.sort === "int") intConst(expr.name);
        else boolConst(expr.name);
        return;
      }
      switch (expr.op) {
        case "not":
          visit(expr.arg);
          break;
        case "and":
        case "or":
        case "add":
        case "mul":
          expr.args.forEach(visit);
          break;
        case "eq":
        case "sub":
        case "div":
        case "gt":
        case "lt":
        case "gte":
        case "lte":
          visit(expr.left);
          visit(expr.right);
          break;
        case "ite":
          visit(expr.cond);
          visit(expr.then);
          visit(expr.else);
          break;
      }
    };
    for (const query of queries) {
      query.assumptions.forEach(visit);
      query.constraints.forEach(visit);
      visit(query.assertion);
    }
    for (const query of domainQueries) {
      query.assumptions.forEach(visit);
      query.constraints.forEach(visit);
      visit(query.condition);
      intConst(query.ssaName);
    }
    for (const fq of functionQueries) {
      fq.assumptions.forEach(visit);
      fq.constraints.forEach(visit);
      fq.assertQueries.forEach((q) => {
        q.assumptions.forEach(visit);
        q.constraints.forEach(visit);
        visit(q.assertion);
      });
      intConst(fq.paramSsaName);
    }
    const modelValues = (model) => {
      const values = {};
      for (const [name, sym] of intSymbols) values[name] = String(model.eval(sym, true));
      for (const [name, sym] of boolSymbols) values[name] = String(model.eval(sym, true));
      return values;
    };
    const assertResults = [];
    for (const query of queries) {
      const valid = await checkAssertValid(ctx, buildBool, query);
      if (valid) {
        assertResults.push({ line: query.line, valid: true, status: "valid", label: query.label });
      } else {
        const solver = new SolverCtor();
        for (const assumption of query.assumptions) solver.add(buildBool(assumption));
        for (const constraint of query.constraints) solver.add(buildBool(constraint));
        solver.add(buildBool(query.assertion).not());
        const status = await solver.check();
        if (status === "sat") {
          assertResults.push({
            line: query.line,
            valid: false,
            status: "invalid",
            counterexample: modelValues(solver.model()),
            label: query.label
          });
        } else {
          assertResults.push({ line: query.line, valid: false, status: "unknown", label: query.label });
        }
      }
    }
    const domainResults = [];
    for (const query of domainQueries) {
      const sym = intConst(query.ssaName);
      const symAr = sym;
      const values = [];
      const solver = new SolverCtor();
      for (const assumption of query.assumptions) solver.add(buildBool(assumption));
      for (const constraint of query.constraints) solver.add(buildBool(constraint));
      solver.add(buildBool(query.condition));
      let truncated = false;
      for (let i = 0; i < MAX_DOMAIN_VALUES; i++) {
        const status = await solver.check();
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
      const paramSym = intConst(fq.paramSsaName);
      const paramAr = paramSym;
      const validInputs = [];
      for (let v = fq.paramMin; v <= fq.paramMax; v++) {
        const pin = paramAr.eq(Int.val(v));
        const solver = new SolverCtor();
        for (const assumption of fq.assumptions) solver.add(buildBool(assumption));
        for (const constraint of fq.constraints) solver.add(buildBool(constraint));
        solver.add(pin);
        if (await solver.check() === "unsat") continue;
        let allValid = assertQueries.length === 0;
        for (const aq of assertQueries) {
          if (!await checkAssertValid(ctx, buildBool, aq, [pin])) {
            allValid = false;
            break;
          }
        }
        if (allValid) validInputs.push(String(v));
      }
      const fnAssertResults = [];
      for (const aq of assertQueries) {
        const valid = await checkAssertValid(ctx, buildBool, aq);
        fnAssertResults.push({
          line: aq.line,
          valid,
          status: valid ? "valid" : "invalid",
          label: `[${fq.name}] ${aq.label}`
        });
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
      const solver = new SolverCtor();
      const last = queries[queries.length - 1];
      for (const assumption of last.assumptions) solver.add(buildBool(assumption));
      for (const constraint of last.constraints) solver.add(buildBool(constraint));
      const status = await solver.check();
      if (status === "sat") finalModel = modelValues(solver.model());
    }
    return {
      assertResults,
      domainResults,
      functionResults,
      finalModel,
      debugConstraints: payload.debugConstraints ?? [],
      loopTrace: payload.loopTrace ?? []
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
