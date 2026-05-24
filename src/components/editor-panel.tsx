import { type Component, createEffect, createSignal, onCleanup } from 'solid-js'
import { MonacoEditor } from 'solid-monaco'
import type { editor } from 'monaco-editor'
import { DEFAULT_EXAMPLE_ID, getExampleById, getExamples } from '../examples/catalog'
import { locale, setLocale } from '../i18n/locale'
import { t } from '../i18n/messages'
import { invalidAssertLines, loopK, setLoopK, setSource, source, state, verify } from '../stores/verification-store'
import type { Locale } from '../i18n/locale'
import { statusLabel } from '../i18n/messages'

interface Props {
  compact?: boolean
}

export const EditorPanel: Component<Props> = (props) => {
  const [exampleId, setExampleId] = createSignal(DEFAULT_EXAMPLE_ID)
  let editorRef: editor.IStandaloneCodeEditor | undefined
  let decorationIds: string[] = []

  const loadExample = (id: string, loc: Locale = locale()) => {
    const example = getExampleById(id, loc)
    if (!example) return
    setExampleId(id)
    setSource(example.source)
  }

  createEffect(() => {
    const loc = locale()
    loadExample(exampleId(), loc)
  })

  createEffect(() => {
    const lines = invalidAssertLines()
    if (!editorRef) return

    decorationIds = editorRef.deltaDecorations(
      decorationIds,
      lines.map((line) => ({
        range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
        options: {
          isWholeLine: true,
          className: 'assert-invalid-line',
          glyphMarginClassName: 'assert-invalid-glyph',
        },
      })),
    )
  })

  onCleanup(() => {
    editorRef?.deltaDecorations(decorationIds, [])
  })

  const examples = () => getExamples(locale())
  const currentExample = () => getExampleById(exampleId(), locale())

  return (
    <>
      <div class="toolbar">
        <div class="toolbar-controls">
          <div class="locale-control" role="group" aria-label={t('toolbar.lang')}>
            <button
              type="button"
              class="locale-btn"
              classList={{ active: locale() === 'it' }}
              onClick={() => setLocale('it')}
            >
              {t('toolbar.langIt')}
            </button>
            <button
              type="button"
              class="locale-btn"
              classList={{ active: locale() === 'en' }}
              onClick={() => setLocale('en')}
            >
              {t('toolbar.langEn')}
            </button>
          </div>
          <label class="example-control">
            <span class="control-label">{t('toolbar.example')}</span>
            <select
              value={exampleId()}
              onChange={(e) => loadExample(e.currentTarget.value)}
              title={currentExample()?.summary}
            >
              {examples().map((ex) => (
                <option value={ex.id}>{ex.title}</option>
              ))}
            </select>
          </label>
          <label class="k-control">
            <span class="control-label">{t('toolbar.k')}</span>
            <input
              type="number"
              min={1}
              max={50}
              value={loopK()}
              onInput={(e) => setLoopK(Number(e.currentTarget.value) || 10)}
              title={t('toolbar.kTitle')}
            />
          </label>
          <button
            type="button"
            class="verify-btn"
            onClick={() => void verify()}
            disabled={state.status === 'solving' || state.status === 'parsing'}
          >
            {state.status === 'solving'
              ? '…'
              : state.status === 'parsing'
                ? '…'
                : props.compact
                  ? t('toolbar.verifyCompact')
                  : t('toolbar.verify')}
          </button>
          <span class={`status-badge status-${state.status}`}>{statusLabel(state.status)}</span>
        </div>
      </div>
      <div class="editor-container">
        <MonacoEditor
          language="typescript"
          theme="vs-dark"
          value={source()}
          onChange={(value) => setSource(value)}
          options={{
            minimap: { enabled: false },
            fontSize: props.compact ? 13 : 14,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            glyphMargin: !props.compact,
            lineNumbersMinChars: props.compact ? 2 : 3,
            padding: { top: 8, bottom: 8 },
          }}
          onMount={(_monaco, ed) => {
            editorRef = ed
          }}
        />
      </div>
    </>
  )
}
