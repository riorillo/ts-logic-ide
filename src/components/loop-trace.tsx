import { type Component, For, Show } from 'solid-js'
import type { LoopStep } from '../core/ir/types'

interface Props {
  steps: LoopStep[]
}

export const LoopTrace: Component<Props> = (props) => {
  return (
    <Show when={(props.steps ?? []).length > 0}>
      <section class="result-section collapsible">
        <details>
          <summary>Loop trace ({(props.steps ?? []).length} steps)</summary>
          <div class="loop-trace">
            <For each={props.steps ?? []}>
              {(step) => (
                <div class="loop-step">
                  <div class="loop-step-header">
                    Loop line {step.loopLine} — iteration {step.iteration}
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
