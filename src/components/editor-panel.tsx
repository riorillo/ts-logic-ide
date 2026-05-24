import { type Component, createEffect, createSignal, onCleanup } from 'solid-js'
import { MonacoEditor } from 'solid-monaco'
import type { editor } from 'monaco-editor'
import { DEFAULT_EXAMPLE_ID, EXAMPLES } from '../examples/catalog'
import { invalidAssertLines, loopK, setLoopK, setSource, source, state, verify } from '../stores/verification-store'

export const EditorPanel: Component = () => {
  const [exampleId, setExampleId] = createSignal(DEFAULT_EXAMPLE_ID)
  let editorRef: editor.IStandaloneCodeEditor | undefined
  let decorationIds: string[] = []

  const loadExample = (id: string) => {
    const example = EXAMPLES.find((e) => e.id === id)
    if (!example) return
    setExampleId(id)
    setSource(example.source)
  }

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

  return (
    <div class="editor-panel">
      <div class="toolbar">
        <div class="toolbar-left">
          <h1>TS Logic IDE</h1>
          <span class="subtitle">TypeScript subset → Z3 SMT</span>
        </div>
        <div class="toolbar-right">
          <label class="example-control">
            Esempio
            <select
              value={exampleId()}
              onChange={(e) => loadExample(e.currentTarget.value)}
              title={EXAMPLES.find((ex) => ex.id === exampleId())?.summary}
            >
              {EXAMPLES.map((ex) => (
                <option value={ex.id}>{ex.title}</option>
              ))}
            </select>
          </label>
          <label class="k-control">
            Bound K
            <input
              type="number"
              min={1}
              max={50}
              value={loopK()}
              onInput={(e) => setLoopK(Number(e.currentTarget.value) || 10)}
              title="While unroll limit and domain/function search range [-K, K]"
            />
          </label>
          <button
            type="button"
            class="verify-btn"
            onClick={() => void verify()}
            disabled={state.status === 'solving' || state.status === 'parsing'}
          >
            {state.status === 'solving' ? 'Solving…' : state.status === 'parsing' ? 'Parsing…' : '▶ Verify'}
          </button>
          <span class={`status-badge status-${state.status}`}>{state.status}</span>
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
            fontSize: 14,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            glyphMargin: true,
          }}
          onMount={(_monaco, ed) => {
            editorRef = ed
          }}
        />
      </div>
    </div>
  )
}
