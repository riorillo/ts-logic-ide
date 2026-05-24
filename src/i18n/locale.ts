import { createEffect, createSignal } from 'solid-js'

export type Locale = 'en' | 'it'

const LOCALE_KEY = 'ts-logic-ide-locale'

function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'it'
  const stored = localStorage.getItem(LOCALE_KEY)
  if (stored === 'en' || stored === 'it') return stored
  const lang = navigator.language.toLowerCase()
  return lang.startsWith('it') ? 'it' : 'en'
}

export function readInitialLocale(): Locale {
  return detectLocale()
}

const [localeSignal, setLocaleState] = createSignal<Locale>(detectLocale())

export function locale(): Locale {
  return localeSignal()
}

export function setLocale(next: Locale) {
  setLocaleState(next)
}

export function toggleLocale() {
  setLocaleState((l) => (l === 'en' ? 'it' : 'en'))
}

createEffect(() => {
  const loc = locale()
  localStorage.setItem(LOCALE_KEY, loc)
  if (typeof document !== 'undefined') {
    document.documentElement.lang = loc
    document.title = loc === 'it' ? 'TS Logic IDE' : 'TS Logic IDE'
  }
})
