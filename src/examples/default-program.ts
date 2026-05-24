export {
  DEFAULT_EXAMPLE_ID,
  defaultExample,
  defaultExampleSource,
  getExampleById,
  getExamples,
  type ExampleProgram,
} from './catalog'

import { defaultExampleSource } from './catalog'
import { readInitialLocale } from '../i18n/locale'

/** Source loaded when the IDE starts. */
export const DEFAULT_PROGRAM = defaultExampleSource(readInitialLocale())
