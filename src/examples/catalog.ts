import type { Locale } from '../i18n/locale'
import { EXAMPLES_EN } from './catalog-en'
import { EXAMPLES_IT } from './catalog-it'

export interface ExampleProgram {
  id: string
  title: string
  summary: string
  source: string
}

export const DEFAULT_EXAMPLE_ID = 'laboratorio-intricato'

export function getExamples(locale: Locale): ExampleProgram[] {
  return locale === 'it' ? EXAMPLES_IT : EXAMPLES_EN
}

export function getExampleById(id: string, locale: Locale): ExampleProgram | undefined {
  return getExamples(locale).find((e) => e.id === id)
}

export function defaultExample(locale: Locale): ExampleProgram {
  return getExampleById(DEFAULT_EXAMPLE_ID, locale) ?? getExamples(locale)[0]
}

export function defaultExampleSource(locale: Locale): string {
  return defaultExample(locale).source
}

/** @deprecated Use getExamples(locale) */
export const EXAMPLES = EXAMPLES_IT
