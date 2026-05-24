import { type Component, Show } from 'solid-js'
import { t } from '../i18n/messages'

interface Props {
  constraints: string[]
}

export const ConstraintDebug: Component<Props> = (props) => {
  const count = () => (props.constraints ?? []).length

  return (
    <Show when={count() > 0}>
      <section class="result-section collapsible">
        <details>
          <summary>{t('debug.constraints', { count: count() })}</summary>
          <pre class="debug-block">{(props.constraints ?? []).join('\n')}</pre>
        </details>
      </section>
    </Show>
  )
}
