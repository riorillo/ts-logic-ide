# TS Logic IDE

> **English:** this file · **Italiano:** [README.md](./README.md)

Web IDE for **formal verification** of a TypeScript subset. Code is translated into logical constraints (SMT) and analyzed with **Z3** in the browser via WebAssembly and a Web Worker. The model is symbolic (SSA, path-sensitive control flow): properties are expressed with `assert` and checked by *proof by refutation*.

The in-app UI and examples switch between **IT** and **EN** via the toolbar language toggle.

---

## Getting started

```bash
npm install
npm run dev
```

From the **Example** menu, pick a documented **Showcase**; **▶ Verify** runs parse, constraint generation, and Z3 solving. **Bound K** controls `while` unrolling and the `[-K, K]` range for function analysis.

| Control | Role |
|---------|------|
| **Example** | Load tutorial programs |
| **Bound K** | `while` unroll limit and Functions sampling |
| **▶ Verify** | Full verification |
| **Z3 Results** | Assertions, Domains, Functions, countermodels |

**INVALID** asserts are highlighted in the editor.

---

## Features

### `assert` and `assume`

- **`assume(expr)`** — path hypothesis (preconditions, context).
- **`assert(expr)`** — property checked by Z3 on the current path.

| Outcome | Meaning |
|---------|---------|
| **VALID (UNSAT)** | `assume ∧ constraints ∧ ¬expr` is unsatisfiable: the property holds |
| **INVALID (SAT)** | A countermodel (SSA values) violates it |

Verification is **path-sensitive** (`if`, unrolled loops, `assume`).

### `domain(var, condition)`

Enumerates (max **32** integers) for the current SSA version of `var` such that assumptions, constraints, and `condition` are satisfiable. Use `let x: number;` (no initializer) and bounds via `assume`.

### Functions

Top-level definitions; calls are **inlined** into constraints. The **Functions** panel lists integers in `[-K, K]` allowed as the first `number` parameter when the body is consistent and internal `assert`s are VALID.

---

## Language

TypeScript subset oriented to property specification:

- Types `number`, `boolean`; `let` (with or without initializer); assignments; `if` / `else`
- Operators: `+`, `-`, `*`, `/`, comparisons, `&&`, `||`
- `for (i < N)` with **literal N**; `while` unrolled up to **K** (guarded body)
- `function` with expression `return`; statements `assume`, `assert`, `domain`

---

## Architecture

```
Monaco → ts-morph (parse) → IR → constraint builder (SSA) → Z3 worker → UI
```

- **SSA:** each `let`/assignment introduces a new symbolic version.
- **`if`:** branch merge with implications and `ite` on modified variables.
- **`while`:** up to K iterations, body constraints conditioned on the guard.
- **Functions:** inline expansion of parameters and return value.

---

## Examples

Catalog in `src/examples/catalog-it.ts` and `catalog-en.ts`, selected from **Example**. On startup the **Showcase** loads (sections A–J, `EXPECTED:` / `ATTESO:` comments). Covers assert, domain, functions, control flow, and logical operators.

---

## Development

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm run build` | TypeScript + Vite + Z3 worker bundle |
| `npm run preview` | Preview production build |

**Main dependencies:** Solid.js, Vite, Monaco (`solid-monaco`), ts-morph, z3-solver, `@sigmasd/vite-plugin-z3`.

```
src/components/   UI
src/core/         parser, IR, constraints, solver
src/examples/     example catalogs (IT/EN)
src/i18n/         locale + messages
src/workers/      Z3 entry
public/           WASM and z3-worker.js (generated)
```

---

## Reference

| Construct | Behavior |
|-----------|----------|
| `assume(P)` | Path premise |
| `assert(P)` | SMT check of `P` |
| `domain(x, φ)` | SAT models for `x` with constraints ∧ φ |
| `function …` | Body analysis + inline |
| **K** | `while` bound and Functions range |
