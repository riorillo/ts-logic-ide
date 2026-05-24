# TS Logic IDE

IDE web per la **verifica formale** di un sottoinsieme di TypeScript. Il codice viene tradotto in vincoli logici (SMT) e analizzato con **Z3** nel browser tramite WebAssembly e Web Worker. Il modello è simbolico (SSA, controllo di flusso path-sensitive): le proprietà sono espresse con `assert` e verificate mediante *proof by refutation*.

---

## Avvio

```bash
npm install
npm run dev
```
Dal menu **Esempio** è disponibile uno **Showcase** documentato; **▶ Verify** avvia parse, generazione vincoli e risoluzione Z3. Il parametro **Bound K** regola lo srotolamento dei `while` e l’intervallo `[-K, K]` per l’analisi delle funzioni.

| Controllo | Funzione |
|-----------|----------|
| **Esempio** | Caricamento programmi didattici |
| **Bound K** | Limite iterazioni `while` e campionamento Functions |
| **▶ Verify** | Verifica completa |
| **Z3 Results** | Assertions, Domains, Functions, contromodelli |

Gli `assert` **INVALID** sono evidenziati nell’editor.

---

## Funzionalità

### `assert` e `assume`

- **`assume(expr)`** — ipotesi sul percorso di esecuzione (precondizioni, contesto).
- **`assert(expr)`** — proprietà verificata da Z3 sul percorso corrente.

| Esito | Significato |
|-------|-------------|
| **VALID (UNSAT)** | `assume ∧ vincoli ∧ ¬expr` insoddisfacibile: la proprietà regge |
| **INVALID (SAT)** | Esiste un contromodello (valori SSA) che la viola |

La verifica è **path-sensitive** (`if`, cicli srotolati, `assume`).

### `domain(var, condizione)`

Enumerazione (max **32** valori) degli interi per la versione SSA corrente di `var` tali che ipotesi, vincoli e `condizione` siano soddisfacibili. Utile con `let x: number;` (senza inizializzatore) e bound tramite `assume`.

### Funzioni

Definizioni in testa al file; le chiamate sono **inlined** nei vincoli. Il pannello **Functions** elenca gli interi in `[-K, K]` ammessi come primo parametro `number` per cui il corpo è coerente e gli `assert` interni risultano VALID.

---

## Linguaggio

Subset TypeScript orientato alla specifica di proprietà:

- Tipi `number`, `boolean`; `let` (con o senza inizializzatore); assegnazioni; `if` / `else`
- Operatori: `+`, `-`, `*`, `/`, confronti, `&&`, `||`
- `for (i < N)` con **N letterale**; `while` srotolato fino a **K** (corpo guarded)
- `function` con `return` espressione; statement `assume`, `assert`, `domain`

---

## Architettura

```
Monaco → ts-morph (parse) → IR → constraint builder (SSA) → Z3 worker → UI
```

- **SSA:** ogni `let`/assegnazione introduce una nuova versione simbolica.
- **`if`:** merge dei rami con implicazioni e `ite` sulle variabili modificate.
- **`while`:** fino a K iterazioni, vincoli del corpo condizionati alla guardia.
- **Funzioni:** espansione inline di parametri e valore di ritorno.

---

## Esempi

Catalogo in `src/examples/catalog.ts`, selezionabile da **Esempio**. All’avvio è caricato lo **Showcase** (sezioni A–J, commenti `ATTESO:`). Sono inclusi casi su assert, domain, funzioni, controllo di flusso e operatori logici.

---

## Sviluppo

| Comando | Descrizione |
|---------|-------------|
| `npm run dev` | Server di sviluppo |
| `npm run build` | TypeScript + Vite + bundle worker Z3 |
| `npm run preview` | Anteprima build |

**Dipendenze principali:** Solid.js, Vite, Monaco (`solid-monaco`), ts-morph, z3-solver, `@sigmasd/vite-plugin-z3`.

```
src/components/   UI
src/core/         parser, IR, constraints, solver
src/examples/     catalogo esempi
src/workers/      entry Z3
public/           WASM e z3-worker.js (generati)
```

---

## Riferimento

| Costrutto | Comportamento |
|-----------|----------------|
| `assume(P)` | Premessa di percorso |
| `assert(P)` | Verifica SMT di `P` |
| `domain(x, φ)` | Modelli SAT per `x` con vincoli ∧ φ |
| `function …` | Analisi corpo + inline |
| **K** | Bound `while` e range Functions |
