import type { ParseError } from '../core/ir/types'
import type { Locale } from './locale'
import { locale as currentLocale } from './locale'

export type ParseErrorCode =
  | 'unsupportedStatement'
  | 'onlyLet'
  | 'unsupportedType'
  | 'variableNeedsTypeOrInit'
  | 'expectedAssignAssumeAssertDomain'
  | 'functionMustHaveName'
  | 'unsupportedReturnType'
  | 'unsupportedParamType'
  | 'functionBodyMustBeBlock'
  | 'functionMustReturn'
  | 'onlySimpleCalls'
  | 'unsupportedCall'
  | 'domainTwoArgs'
  | 'domainFirstArgVariable'
  | 'builtinOneArg'
  | 'userCallOnlySimple'
  | 'builtinTopLevel'
  | 'postfixOnlyIncDec'
  | 'unaryMinusOnly'
  | 'unsupportedExpression'
  | 'unsupportedOperator'

type Params = Record<string, string | number>

const EN: Record<ParseErrorCode, (p: Params) => string> = {
  unsupportedStatement: (p) => `Unsupported statement: ${p.kind}`,
  onlyLet: () => 'Only `let` declarations are supported',
  unsupportedType: (p) => `Unsupported type "${p.type}". Use number or boolean`,
  variableNeedsTypeOrInit: () => 'Variable needs a type annotation or an initializer',
  expectedAssignAssumeAssertDomain: () =>
    'Expected assignment, assume(...), assert(...), or domain(...)',
  functionMustHaveName: () => 'Function must have a name',
  unsupportedReturnType: (p) => `Unsupported return type "${p.type}"`,
  unsupportedParamType: (p) => `Unsupported parameter type "${p.type}"`,
  functionBodyMustBeBlock: () => 'Function body must be a block',
  functionMustReturn: () => 'Function must contain a return statement',
  onlySimpleCalls: () => 'Only simple calls are supported',
  unsupportedCall: (p) => `Unsupported call "${p.name}". Use assume, assert, or domain`,
  domainTwoArgs: () => 'domain(var, expr) expects exactly 2 arguments',
  domainFirstArgVariable: () => 'domain() first argument must be a variable name',
  builtinOneArg: (p) => `${p.name}(...) expects exactly one argument`,
  userCallOnlySimple: () => 'Only simple function calls are supported',
  builtinTopLevel: (p) => `"${p.name}" must be used as a top-level statement`,
  postfixOnlyIncDec: () => 'Only ++ and -- are supported in postfix form',
  unaryMinusOnly: () => 'Only unary minus is supported',
  unsupportedExpression: (p) => `Unsupported expression: ${p.kind}`,
  unsupportedOperator: (p) => `Unsupported operator "${p.op}"`,
}

const IT: Record<ParseErrorCode, (p: Params) => string> = {
  unsupportedStatement: (p) => `Istruzione non supportata: ${p.kind}`,
  onlyLet: () => 'Sono supportate solo dichiarazioni `let`',
  unsupportedType: (p) => `Tipo non supportato "${p.type}". Usa number o boolean`,
  variableNeedsTypeOrInit: () => 'La variabile richiede un tipo o un inizializzatore',
  expectedAssignAssumeAssertDomain: () =>
    'Atteso assegnazione, assume(...), assert(...) o domain(...)',
  functionMustHaveName: () => 'La funzione deve avere un nome',
  unsupportedReturnType: (p) => `Tipo di ritorno non supportato "${p.type}"`,
  unsupportedParamType: (p) => `Tipo parametro non supportato "${p.type}"`,
  functionBodyMustBeBlock: () => 'Il corpo della funzione deve essere un blocco',
  functionMustReturn: () => 'La funzione deve contenere un return',
  onlySimpleCalls: () => 'Sono supportate solo chiamate semplici',
  unsupportedCall: (p) => `Chiamata non supportata "${p.name}". Usa assume, assert o domain`,
  domainTwoArgs: () => 'domain(var, expr) richiede esattamente 2 argomenti',
  domainFirstArgVariable: () => 'Il primo argomento di domain() deve essere un nome variabile',
  builtinOneArg: (p) => `${p.name}(...) richiede esattamente un argomento`,
  userCallOnlySimple: () => 'Sono supportate solo chiamate semplici a funzioni',
  builtinTopLevel: (p) => `"${p.name}" va usato come istruzione di primo livello`,
  postfixOnlyIncDec: () => 'Sono supportati solo ++ e -- in forma postfix',
  unaryMinusOnly: () => 'È supportato solo il meno unario',
  unsupportedExpression: (p) => `Espressione non supportata: ${p.kind}`,
  unsupportedOperator: (p) => `Operatore non supportato "${p.op}"`,
}

export function formatParseError(
  code: ParseErrorCode,
  params: Params = {},
  loc: Locale = currentLocale(),
): string {
  const table = loc === 'it' ? IT : EN
  return table[code](params)
}

export function translateParseError(err: ParseError, loc: Locale = currentLocale()): string {
  if (err.code) {
    return formatParseError(err.code as ParseErrorCode, err.params ?? {}, loc)
  }
  return err.message
}

/** Map legacy English throw messages from parse-program / constraint-builder. */
const BUILD_PATTERNS: Array<{ re: RegExp; en: string; it: string }> = [
  {
    re: /^Failed to build constraints$/,
    en: 'Failed to build constraints',
    it: 'Impossibile costruire i vincoli',
  },
  {
    re: /^Z3 requires SharedArrayBuffer/,
    en: 'Z3 requires SharedArrayBuffer (COOP/COEP headers). Use the Vite dev server.',
    it: 'Z3 richiede SharedArrayBuffer (header COOP/COEP). Usa il server Vite (`npm run dev`).',
  },
  {
    re: /^Z3 verification failed$/,
    en: 'Z3 verification failed',
    it: 'Verifica Z3 fallita',
  },
  {
    re: /^Unknown parse error$/,
    en: 'Unknown parse error',
    it: 'Errore di parsing sconosciuto',
  },
  {
    re: /^domain\(\): variable "(.+)" is not defined at line (\d+)$/,
    en: 'domain(): variable "$1" is not defined at line $2',
    it: 'domain(): variabile "$1" non definita alla riga $2',
  },
  {
    re: /^domain\(\) supports number variables only \(got boolean "(.+)" at line (\d+)\)$/,
    en: 'domain() supports number variables only (got boolean "$1" at line $2)',
    it: 'domain() supporta solo variabili number (boolean "$1" alla riga $2)',
  },
  {
    re: /^Function "(.+)" needs at least one number parameter for input analysis$/,
    en: 'Function "$1" needs at least one number parameter for input analysis',
    it: 'La funzione "$1" richiede almeno un parametro number per l\'analisi input',
  },
  {
    re: /^Function "(.+)" expects (\d+) argument\(s\), got (\d+)$/,
    en: 'Function "$1" expects $2 argument(s), got $3',
    it: 'La funzione "$1" richiede $2 argomenti, ricevuti $3',
  },
  {
    re: /^For loop at line (\d+) must use a literal bound like i < N$/,
    en: 'For loop at line $1 must use a literal bound like i < N',
    it: 'Il for alla riga $1 deve usare un bound letterale tipo i < N',
  },
  {
    re: /^Invalid expression$/,
    en: 'Invalid expression',
    it: 'Espressione non valida',
  },
  {
    re: /^Duplicate function "(.+)" at line (\d+)$/,
    en: 'Duplicate function "$1" at line $2',
    it: 'Funzione duplicata "$1" alla riga $2',
  },
  {
    re: /^Unknown function "(.+)"$/,
    en: 'Unknown function "$1"',
    it: 'Funzione sconosciuta "$1"',
  },
  {
    re: /^Variable "(.+)" is used before declaration$/,
    en: 'Variable "$1" is used before declaration',
    it: 'Variabile "$1" usata prima della dichiarazione',
  },
]

export function translateBuildError(message: string, loc: Locale = currentLocale()): string {
  if (loc === 'en') return message
  for (const { re, it } of BUILD_PATTERNS) {
    const m = message.match(re)
    if (!m) continue
    let out = it
    for (let i = 1; i < m.length; i++) {
      out = out.replace(`$${i}`, m[i])
    }
    return out
  }
  return message
}

export function translateResultLabel(label: string, loc: Locale = currentLocale()): string {
  const assert = /^assert at line (\d+)$/.exec(label)
  if (assert) {
    return loc === 'it' ? `assert alla riga ${assert[1]}` : label
  }
  const domain = /^domain\((.+), …\) at line (\d+)$/.exec(label)
  if (domain) {
    return loc === 'it'
      ? `domain(${domain[1]}, …) alla riga ${domain[2]}`
      : label
  }
  const fnAssert = /^\[(.+)\] assert at line (\d+)$/.exec(label)
  if (fnAssert) {
    return loc === 'it'
      ? `[${fnAssert[1]}] assert alla riga ${fnAssert[2]}`
      : label
  }
  return label
}
