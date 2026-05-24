import { type Component, For, Show } from 'solid-js'
import type { LoopStep } from '../core/ir/types'
import { t } from '../i18n/messages'

interface Props {
  steps: LoopStep[]
}

export const LoopTrace: Component<Props> = (props) => {
  const count = () => (props.steps ?? []).length

  return (
    <Show when={count() > 0}>
      <section class="result-section collapsible">
        <details>
          <summary>{t('loop.trace', { count: count() })}</summary>
          <div class="loop-trace">
            <For each={props.steps ?? []}>
              {(step) => (
                <div class="loop-step">
                  <div class="loop-step-header">
                    {t('loop.step', { line: step.loopLine, iteration: step.iteration })}
                  </div>
                  <pre>{formatVars(step.variables)}</pre>
                </div>
              )}
            </For>
          </div>
        </details>
      </section>
    </Show>
  )
}

function formatVars(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([k, v]) => `${k} → ${v}`)
    .join('\n')
}
