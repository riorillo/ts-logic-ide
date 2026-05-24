import { type Component, createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js'
import { state } from '../stores/verification-store'
import { EditorPanel } from './editor-panel'
import { ResultsPanel } from './results-panel'

type MobileTab = 'editor' | 'results'

export const IdeLayout: Component = () => {
  const [mobileTab, setMobileTab] = createSignal<MobileTab>('editor')
  const [isMobile, setIsMobile] = createSignal(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches,
  )

  onMount(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    onCleanup(() => mq.removeEventListener('change', update))
  })

  createEffect(() => {
    if (!isMobile()) return
    if (state.status === 'done' || state.status === 'error') {
      setMobileTab('results')
    }
  })

  return (
    <div class="ide-layout" classList={{ mobile: isMobile() }}>
      <Show when={isMobile()}>
        <nav class="mobile-tab-bar" aria-label="Sezioni">
          <button
            type="button"
            class="mobile-tab"
            classList={{ active: mobileTab() === 'editor' }}
            onClick={() => setMobileTab('editor')}
          >
            Code
          </button>
          <button
            type="button"
            class="mobile-tab"
            classList={{ active: mobileTab() === 'results' }}
            onClick={() => setMobileTab('results')}
          >
            Results
            <Show when={state.status === 'done' || state.status === 'error'}>
              <span class="mobile-tab-dot" aria-hidden="true" />
            </Show>
          </button>
        </nav>
      </Show>

      <div class="ide-main">
        <div
          class="editor-panel"
          classList={{ 'panel-active': !isMobile() || mobileTab() === 'editor' }}
        >
          <EditorPanel compact={isMobile()} />
        </div>
        <div
          class="results-panel"
          classList={{ 'panel-active': !isMobile() || mobileTab() === 'results' }}
        >
          <ResultsPanel />
        </div>
      </div>

      <footer class="site-footer">
        <span>TS Logic IDE</span>
        <span class="site-footer-sep">·</span>
        <span class="site-credit">by riorillo</span>
      </footer>
    </div>
  )
}
