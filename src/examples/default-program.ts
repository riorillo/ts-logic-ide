export {
  DEFAULT_EXAMPLE_ID,
  EXAMPLES,
  defaultExample,
  getExampleById,
  type ExampleProgram,
} from './catalog'

import { defaultExample } from './catalog'

/** Sorgente caricata all'avvio dell'IDE. */
export const DEFAULT_PROGRAM = defaultExample().source
