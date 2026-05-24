export interface ExampleProgram {
  id: string
  title: string
  summary: string
  source: string
}

export const EXAMPLES_EN: ExampleProgram[] = [
  {
    id: 'intro',
    title: '1 · Intro: assert and assume',
    summary: 'Two asserts: one always true, one falsifiable.',
    source: `// assert(expr) → VALID if expr follows from assume + program constraints.
// assume(expr) → path hypothesis (not proved on its own).

let x: number = 5;
assume(x > 0);

assert(x > 0);   // VALID: already assumed
assert(x < 0);   // INVALID: countermodel with x = 5
`,
  },
  {
    id: 'domain-piu-valori',
    title: '2 · Domain: multiple values',
    summary: 'let without = … + assume on an interval → 1, 2, 3, 4.',
    source: `// domain(x, φ) asks Z3: which values of x (current SSA version)
// make SAT:  (all constraints so far) ∧ (all assumes) ∧ φ ?
//
// For MULTIPLE values, x must not already be fixed by let x = constant.
// Use:  let x: number;   (no initializer, type required)

let x: number;
assume(x >= 1);
assume(x <= 4);

// With φ = (x*2 >= x), for integers 1..4 the formula holds.
domain(x, x * 2 >= x);

// EXPECTED in Domains: 1, 2, 3, 4  (up to 32 values max)
`,
  },
  {
    id: 'domain-conflitto',
    title: '3 · Domain: conflict (no values)',
    summary: 'let x = 0 and assume(x >= 1) are incompatible → empty Domains.',
    source: `// CLASSIC MISTAKE: initialization + assume that contradict each other.
//
//   let x = 0   →  SSA constraint:  x_0 = 0
//   assume(x >= 1)  →  x_0 >= 1
//
// Set: IMPOSSIBLE (UNSAT). domain() finds no value.

let x: number = 0;
assume(x >= 1);
assume(x <= 4);

domain(x, x * 2 >= x);

// EXPECTED in Domains: "No values satisfy the condition."
// Fix: use  let x: number;  without = 0  (see example 2).
`,
  },
  {
    id: 'domain-un-valore',
    title: '4 · Domain: single value',
    summary: 'let x = 2 with compatible assumes → only 2.',
    source: `// If let already fixes x, and assumes do not widen the set,
// domain() finds at most that value.

let x: number = 2;
assume(x >= 1);
assume(x <= 4);

domain(x, x >= 1);

// EXPECTED in Domains: 2
`,
  },
  {
    id: 'domain-dopo-percorso',
    title: '5 · Domain: after assignments',
    summary: 'Path (for/if) often narrows to a single value.',
    source: `// Even without let x = 0, after many assignments SSA fixes x.

let x: number = 0;

for (let i = 0; i < 3; i++) {
  x = x + 10;
}
// x = 30

if (x > 25) {
  x = x - 5;
}
// then branch: x = 25

domain(x, x > 0);

// EXPECTED in Domains: 25  (only possible value)
// For more values, call domain() BEFORE fixing x with if/for.
`,
  },
  {
    id: 'funzioni',
    title: '6 · Functions: valid inputs',
    summary: 'Functions panel: tries n ∈ [-K, K] on the first number parameter.',
    source: `// The "Functions" panel lists n for which:
//   • body assumes are consistent (SAT)
//   • every assert in the body is VALID
// Bound K in the toolbar = range [-K, K].

function isPositive(n: number): boolean {
  assume(n > 0);
  return n > 0;
}

function broken(n: number): boolean {
  assume(n >= 2);
  assert(n == 1);
  return n >= 2;
}

// Minimal body only to trigger analysis (no assert here).
let dummy: number = 0;
assume(dummy == 0);

// EXPECTED Functions:
//   isPositive → 1, 2, …, K
//   broken     → (none)
`,
  },
  {
    id: 'tour-completo',
    title: '7 · Full tour',
    summary: 'Functions, if, for, while, assert, domain together.',
    source: `// =============================================================================
// Tour: all features together
// =============================================================================

function isPositive(n: number): boolean {
  assume(n > 0);
  return n > 0;
}

function inRange(v: number, lo: number, hi: number): boolean {
  assume(lo <= hi);
  return v >= lo && v <= hi;
}

let coins: number = 0;
let price: number = 15;
let upgraded: boolean = false;

assume(price > 0);

for (let i = 0; i < 3; i++) {
  coins = coins + 25;
}

if (coins >= price) {
  upgraded = true;
  coins = coins - price;
}

assume(isPositive(coins));
assert(inRange(coins, 0, 100));
assert(coins == 60);

if (upgraded) {
  assert(coins < 50);   // intentional INVALID (60 < 50 is false)
}

let ticks: number = 0;
while (ticks < 1) {
  ticks = ticks + 1;
}
assert(ticks == 1);

domain(coins, coins >= price);   // often only 60: path already fixed
`,
  },
  {
    id: 'laboratorio-intricato',
    title: '★ Showcase — full lab',
    summary:
      'Documented tour: domain, assert, functions, if/for/while, &&/||. Read EXPECTED: and Verify.',
    source: `// =============================================================================
// LAB — many cases in one file
// Use Verify (Bound K recommended: 10). Scroll through "EXPECTED:" comments per block.
// =============================================================================

// ─── A. Functions (Functions panel) ─────────────────────────────────────────
//   ladder, divides  → many valid inputs on n (first number param)
//   trap             → (none): internal assert vs assume
//   pickBand         → all v in [-K,K] with free lo,hi but lo<=hi

function ladder(n: number): boolean {
  assume(n >= 0);
  assume(n <= 12);
  return n * 2 >= n && n <= 24;
}

function divides(a: number, b: number): boolean {
  assume(b > 0);
  return a / b >= 0;
}

function trap(n: number): boolean {
  assume(n >= 1);
  assert(n < 1);
  return n >= 1;
}

function pickBand(v: number, lo: number, hi: number): boolean {
  assume(lo <= hi);
  return v >= lo && v <= hi;
}

function isPositiveLike(n: number): boolean {
  assume(n > 0);
  return n > 0;
}

// ─── B. Domain: free vs fixed vs conflict ───────────────────────────────────

// B1 — FREE variable: multiple values in Domains
let loose: number;
assume(loose >= -2);
assume(loose <= 2);
domain(loose, loose * loose <= 4);
// EXPECTED Domains loose: -2, -1, 0, 1, 2  (all in the square)

// B2 — Variable FIXED by let =
let tight: number = 7;
assume(tight >= 1);
assume(tight <= 10);
domain(tight, tight >= 1);
// EXPECTED Domains tight: 7

// B3 — CONFLICT let = 0 vs assume (UNSAT)
let clash: number = 0;
assume(clash >= 3);
domain(clash, clash > 0);
// EXPECTED Domains clash: (no values)

// B4 — Same variable: domain BEFORE and AFTER an assignment
let early: number;
assume(early >= 1);
assume(early <= 3);
domain(early, early > 0);
// EXPECTED Domains (before): 1, 2, 3

early = 2;
domain(early, early == 2);
// EXPECTED Domains (after): 2

// ─── C. Path: for, nested if, guarded while ─────────────────────────────────

let acc: number = 0;
let flag: boolean = false;

for (let i = 0; i < 4; i++) {
  acc = acc + 3;
}
// acc = 12

if (acc > 10) {
  flag = true;
  acc = acc - 2;
} else {
  acc = acc + 100;
}
// then branch: flag = true, acc = 10

if (acc > 5) {
  if (acc < 20) {
    acc = acc + 1;
  }
}
// acc = 11

let pulse: number = 0;
while (pulse < 2) {
  pulse = pulse + 1;
}
assert(pulse == 2);
// EXPECTED Assertions pulse: VALID

// ─── D. Path-sensitive assert (same symbol, different branches) ─────────────

assert(acc == 11);
// EXPECTED: VALID

if (flag) {
  assert(acc == 11);
  assert(acc < 5);
  // EXPECTED: first VALID, second INVALID (11 < 5 false)
}

// ─── E. Inlined calls + && ────────────────────────────────────────────────────

assume(ladder(acc));
assert(pickBand(acc, 0, 50));
assert(divides(acc, 1));
assume(isPositiveLike(acc));
// EXPECTED: VALID (acc=11, inlined functions consistent)

// ─── F. Domain after a long path (often a single value) ─────────────────────

domain(acc, acc >= 10 && acc <= 15);
// EXPECTED Domains acc: 11  (already fixed by path)

// ─── G. Boolean + if ────────────────────────────────────────────────────────

let ok: boolean = false;
if (acc > 5) {
  ok = true;
}

if (ok) {
  assert(acc > 5);
  // EXPECTED: VALID on ok branch
}

// ─── H. Another free variable tied to acc ─────────────────────────────────────

let ghost: number;
assume(ghost >= 0);
assume(ghost <= 4);
domain(ghost, ghost + acc >= 12);
// acc ≈ 11  →  ghost + acc >= 12  →  ghost >= 1
// EXPECTED Domains ghost: 1, 2, 3, 4

// ─── I. Expression with || (alternative) ─────────────────────────────────────

let alt: number;
assume(alt >= 0);
assume(alt <= 3);
domain(alt, alt == 0 || alt == 3);
// EXPECTED Domains alt: 0, 3

// ─── J. Final assert intentionally dubious (comment out to experiment) ────────

assert(acc == 99);
// EXPECTED: INVALID — countermodel with acc = 11
`,
  },
]
