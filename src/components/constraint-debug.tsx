import { type Component, Show } from 'solid-js'

interface Props {
  constraints: string[]
}

export const ConstraintDebug: Component<Props> = (props) => {
  return (
    <Show when={(props.constraints ?? []).length > 0}>
      <section class="result-section collapsible">
        <details>
          <summary>Debug constraints ({(props.constraints ?? []).length})</summary>
          <pre class="debug-block">{(props.constraints ?? []).join('\n')}</pre>
        </details>
      </section>
    </Show>
  )
}
