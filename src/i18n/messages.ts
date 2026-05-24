import type { Locale } from './locale'
import { locale as currentLocale } from './locale'
import type { VerificationStatus } from '../stores/verification-store'

const messages = {
  en: {
    'toolbar.example': 'Example',
    'toolbar.k': 'K',
    'toolbar.kTitle': 'While unroll limit and domain/function search range [-K, K]',
    'toolbar.verify': '▶ Verify',
    'toolbar.verifyCompact': 'Verify',
    'toolbar.lang': 'Language',
    'toolbar.langIt': 'IT',
    'toolbar.langEn': 'EN',
    'mobile.code': 'Code',
    'mobile.results': 'Results',
    'mobile.sectionsAria': 'Sections',
    'results.title': 'Z3 Results',
    'results.sharedArrayBuffer':
      'SharedArrayBuffer not available. Run via npm run dev for COOP/COEP headers.',
    'results.parseErrors': 'Parse errors',
    'results.lineCol': 'Line {line}:{column} — {message}',
    'results.assertions': 'Assertions',
    'results.noAsserts': 'No assert statements found.',
    'results.validShort': 'VALID',
    'results.invalidShort': 'INVALID',
    'results.valid': 'VALID (UNSAT)',
    'results.invalid': 'INVALID (SAT)',
    'results.line': 'Line {line}',
    'results.counterexample': 'Counterexample',
    'results.finalModel': 'Final model',
    'results.domains': 'Domains',
    'results.domainsHint': 'Use domain(var, condition) to enumerate satisfying values.',
    'results.domainBadge': 'DOMAIN',
    'results.domainLine': 'Line {line} — {variable}',
    'results.noDomainValues': 'No values satisfy the condition.',
    'results.domainTruncated':
      'Showing first {max} values (increase search or narrow condition).',
    'results.functions': 'Functions',
    'results.noFunctions': 'Define functions at the top of the file.',
    'results.fnSignature': '{name}({param}: number) — line {line}',
    'results.fnValidInputs':
      'Valid inputs for {param} in [{min}, {max}] (no assert failure):',
    'results.none': '(none)',
    'results.fnSymbolicAsserts': 'Symbolic asserts in body:',
    'results.idleHint':
      'Pick an example from the menu, then Verify. For domain with multiple values use let x: number; without = … and narrow with assume.',
    'loop.trace': 'Loop trace ({count} steps)',
    'loop.step': 'Loop line {line} — iteration {iteration}',
    'debug.constraints': 'Debug constraints ({count})',
    'status.idle': 'idle',
    'status.parsing': 'parsing',
    'status.solving': 'solving',
    'status.done': 'done',
    'status.error': 'error',
    'store.buildFailed': 'Failed to build constraints',
    'store.z3SharedArrayBuffer':
      'Z3 requires SharedArrayBuffer (COOP/COEP headers). Use the Vite dev server.',
    'store.z3Failed': 'Z3 verification failed',
  },
  it: {
    'toolbar.example': 'Esempio',
    'toolbar.k': 'K',
    'toolbar.kTitle':
      'Limite unrolling while e intervallo ricerca domain/funzioni [-K, K]',
    'toolbar.verify': '▶ Verifica',
    'toolbar.verifyCompact': 'Verifica',
    'toolbar.lang': 'Lingua',
    'toolbar.langIt': 'IT',
    'toolbar.langEn': 'EN',
    'mobile.code': 'Codice',
    'mobile.results': 'Risultati',
    'mobile.sectionsAria': 'Sezioni',
    'results.title': 'Risultati Z3',
    'results.sharedArrayBuffer':
      'SharedArrayBuffer non disponibile. Avvia con npm run dev per gli header COOP/COEP.',
    'results.parseErrors': 'Errori di parsing',
    'results.lineCol': 'Riga {line}:{column} — {message}',
    'results.assertions': 'Assert',
    'results.noAsserts': 'Nessun assert nel programma.',
    'results.validShort': 'VALIDO',
    'results.invalidShort': 'INVALIDO',
    'results.valid': 'VALIDO (UNSAT)',
    'results.invalid': 'INVALIDO (SAT)',
    'results.line': 'Riga {line}',
    'results.counterexample': 'Contromodello',
    'results.finalModel': 'Modello finale',
    'results.domains': 'Domini',
    'results.domainsHint':
      'Usa domain(var, condizione) per elencare i valori che soddisfano la formula.',
    'results.domainBadge': 'DOMINIO',
    'results.domainLine': 'Riga {line} — {variable}',
    'results.noDomainValues': 'Nessun valore soddisfa la condizione.',
    'results.domainTruncated':
      'Mostrati i primi {max} valori (aumenta K o restringi la condizione).',
    'results.functions': 'Funzioni',
    'results.noFunctions': 'Definisci funzioni in cima al file.',
    'results.fnSignature': '{name}({param}: number) — riga {line}',
    'results.fnValidInputs':
      'Input validi per {param} in [{min}, {max}] (nessun assert fallito):',
    'results.none': '(nessuno)',
    'results.fnSymbolicAsserts': 'Assert simbolici nel corpo:',
    'results.idleHint':
      'Scegli un esempio nel menu, poi Verifica. Per domain con più valori usa let x: number; senza = … e limita con assume.',
    'loop.trace': 'Traccia loop ({count} passi)',
    'loop.step': 'Loop riga {line} — iterazione {iteration}',
    'debug.constraints': 'Vincoli debug ({count})',
    'status.idle': 'inattivo',
    'status.parsing': 'parsing',
    'status.solving': 'risoluzione',
    'status.done': 'completato',
    'status.error': 'errore',
    'store.buildFailed': 'Impossibile costruire i vincoli',
    'store.z3SharedArrayBuffer':
      'Z3 richiede SharedArrayBuffer (header COOP/COEP). Usa il server Vite.',
    'store.z3Failed': 'Verifica Z3 fallita',
  },
} as const

export type MessageKey = keyof typeof messages.en

type Params = Record<string, string | number>

function interpolate(template: string, params: Params): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`))
}

export function t(key: MessageKey, params: Params = {}, loc: Locale = currentLocale()): string {
  const template = messages[loc][key] ?? messages.en[key]
  return interpolate(template, params)
}

export function statusLabel(status: VerificationStatus, loc: Locale = currentLocale()): string {
  return t(`status.${status}` as MessageKey, {}, loc)
}
