export interface ExampleProgram {
  id: string
  title: string
  summary: string
  source: string
}

export const DEFAULT_EXAMPLE_ID = 'laboratorio-intricato'

export const EXAMPLES: ExampleProgram[] = [
  {
    id: 'intro',
    title: '1 · Intro: assert e assume',
    summary: 'Due assert: uno sempre vero, uno falsificabile.',
    source: `// assert(expr) → VALID se expr segue da assume + vincoli del programma.
// assume(expr) → ipotesi sul percorso (non viene dimostrata da sola).

let x: number = 5;
assume(x > 0);

assert(x > 0);   // VALID: già assunto
assert(x < 0);   // INVALID: contromodello con x = 5
`,
  },
  {
    id: 'domain-piu-valori',
    title: '2 · Domain: più valori',
    summary: 'let senza = … + assume su un intervallo → 1, 2, 3, 4.',
    source: `// domain(x, φ) chiede a Z3: quali valori di x (versione SSA corrente)
// rendono SAT:  (tutti i vincoli fino a qui) ∧ (tutti gli assume) ∧ φ ?
//
// Per avere PIÙ valori, x non deve essere già fissato da un let x = costante.
// Usa:  let x: number;   (senza inizializzatore, tipo obbligatorio)

let x: number;
assume(x >= 1);
assume(x <= 4);

// Con φ = (x*2 >= x), per gli interi 1..4 la formula è vera.
domain(x, x * 2 >= x);

// Atteso in Domains: 1, 2, 3, 4  (fino a 32 valori max)
`,
  },
  {
    id: 'domain-conflitto',
    title: '3 · Domain: conflitto (nessun valore)',
    summary: 'let x = 0 e assume(x >= 1) sono incompatibili → Domains vuoto.',
    source: `// ERRORE CLASSICO: inizializzazione + assume che si contraddicono.
//
//   let x = 0   →  vincolo SSA:  x_0 = 0
//   assume(x >= 1)  →  x_0 >= 1
//
// Insieme: IMPOSSIBILE (UNSAT). domain() non trova alcun valore.

let x: number = 0;
assume(x >= 1);
assume(x <= 4);

domain(x, x * 2 >= x);

// Atteso in Domains: "No values satisfy the condition."
// Correzione: usa  let x: number;  senza = 0  (vedi esempio 2).
`,
  },
  {
    id: 'domain-un-valore',
    title: '4 · Domain: un solo valore',
    summary: 'let x = 2 con assume compatibili → solo 2.',
    source: `// Se let fissa già x, e gli assume non allargano l'insieme,
// domain() trova al massimo quel valore.

let x: number = 2;
assume(x >= 1);
assume(x <= 4);

domain(x, x >= 1);

// Atteso in Domains: 2
`,
  },
  {
    id: 'domain-dopo-percorso',
    title: '5 · Domain: dopo assegnazioni',
    summary: 'Il percorso (for/if) restringe spesso a un solo valore.',
    source: `// Anche senza let x = 0, dopo molte assegnazioni la SSA fissa x.

let x: number = 0;

for (let i = 0; i < 3; i++) {
  x = x + 10;
}
// x = 30

if (x > 25) {
  x = x - 5;
}
// ramo then: x = 25

domain(x, x > 0);

// Atteso in Domains: 25  (un solo valore possibile)
// Per più valori, chiama domain() PRIMA di fissare x con if/for.
`,
  },
  {
    id: 'funzioni',
    title: '6 · Functions: input validi',
    summary: 'Pannello Functions: prova n ∈ [-K, K] sul primo parametro number.',
    source: `// Il pannello "Functions" elenca gli n per cui:
//   • gli assume del corpo sono coerenti (SAT)
//   • ogni assert nel corpo è VALID
// Bound K nella toolbar = range [-K, K].

function isPositive(n: number): boolean {
  assume(n > 0);
  return n > 0;
}

function broken(n: number): boolean {
  assume(n >= 2);
  assert(n == 1);
  return n >= 2;
}

// Corpo minimo solo per attivare l'analisi (nessun assert qui).
let dummy: number = 0;
assume(dummy == 0);

// Atteso Functions:
//   isPositive → 1, 2, …, K
//   broken     → (none)
`,
  },
  {
    id: 'tour-completo',
    title: '7 · Tour completo',
    summary: 'Funzioni, if, for, while, assert, domain insieme.',
    source: `// =============================================================================
// Tour: tutte le funzionalità insieme
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
  assert(coins < 50);   // INVALID voluto (60 < 50 è falso)
}

let ticks: number = 0;
while (ticks < 1) {
  ticks = ticks + 1;
}
assert(ticks == 1);

domain(coins, coins >= price);   // spesso solo 60: percorso già fissato
`,
  },
  {
    id: 'laboratorio-intricato',
    title: '★ Showcase — laboratorio completo',
    summary:
      'Tour documentato: domain, assert, funzioni, if/for/while, &&/||. Leggi ATTESO: e Verify.',
    source: `// =============================================================================
// LABORATORIO — molte casistiche in un unico file
// Usa Verify (Bound K consigliato: 10). Scorri i commenti "ATTESO:" per ogni blocco.
// =============================================================================

// ─── A. Funzioni (pannello Functions) ───────────────────────────────────────
//   ladder, divides  → molti input validi su n (primo param number)
//   trap             → (none): assert interno vs assume
//   pickBand         → tutti i v in [-K,K] con lo,hi liberi ma lo<=hi

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

// ─── B. Domain: libero vs fissato vs conflitto ───────────────────────────────

// B1 — Variabile LIBERA: più valori in Domains
let loose: number;
assume(loose >= -2);
assume(loose <= 2);
domain(loose, loose * loose <= 4);
// ATTESO Domains loose: -2, -1, 0, 1, 2  (tutti nel quadrato)

// B2 — Variabile FISSATA da let =
let tight: number = 7;
assume(tight >= 1);
assume(tight <= 10);
domain(tight, tight >= 1);
// ATTESO Domains tight: 7

// B3 — CONFLITTO let = 0 vs assume (UNSAT)
let clash: number = 0;
assume(clash >= 3);
domain(clash, clash > 0);
// ATTESO Domains clash: (nessun valore)

// B4 — Stessa variabile: domain PRIMA e DOPO un assegnamento
let early: number;
assume(early >= 1);
assume(early <= 3);
domain(early, early > 0);
// ATTESO Domains (prima): 1, 2, 3

early = 2;
domain(early, early == 2);
// ATTESO Domains (dopo): 2

// ─── C. Percorso: for, if annidato, while guarded ───────────────────────────

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
// ramo then: flag = true, acc = 10

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
// ATTESO Assertions pulse: VALID

// ─── D. Assert path-sensitive (stesso simbolo, rami diversi) ─────────────────

assert(acc == 11);
// ATTESO: VALID

if (flag) {
  assert(acc == 11);
  assert(acc < 5);
  // ATTESO: primo VALID, secondo INVALID (11 < 5 falso)
}

// ─── E. Chiamate inlined + && ───────────────────────────────────────────────

assume(ladder(acc));
assert(pickBand(acc, 0, 50));
assert(divides(acc, 1));
assume(isPositiveLike(acc));
// ATTESO: VALID (acc=11, funzioni inlined coerenti)

// ─── F. Domain dopo un percorso lungo (spesso un solo valore) ───────────────

domain(acc, acc >= 10 && acc <= 15);
// ATTESO Domains acc: 11  (già fissato dal percorso)

// ─── G. Boolean + if ────────────────────────────────────────────────────────

let ok: boolean = false;
if (acc > 5) {
  ok = true;
}

if (ok) {
  assert(acc > 5);
  // ATTESO: VALID sul ramo ok
}

// ─── H. Altra variabile libera legata ad acc ────────────────────────────────

let ghost: number;
assume(ghost >= 0);
assume(ghost <= 4);
domain(ghost, ghost + acc >= 12);
// acc ≈ 11  →  ghost + acc >= 12  →  ghost >= 1
// ATTESO Domains ghost: 1, 2, 3, 4

// ─── I. Espressione con || (alternativa) ───────────────────────────────────

let alt: number;
assume(alt >= 0);
assume(alt <= 3);
domain(alt, alt == 0 || alt == 3);
// ATTESO Domains alt: 0, 3

// ─── J. Assert finale volutamente dubbio (commenta per sperimentare) ────────

assert(acc == 99);
// ATTESO: INVALID — contromodello con acc = 11
`,
  },
]

export function getExampleById(id: string): ExampleProgram | undefined {
  return EXAMPLES.find((e) => e.id === id)
}

export function defaultExample(): ExampleProgram {
  return getExampleById(DEFAULT_EXAMPLE_ID) ?? EXAMPLES[0]
}
