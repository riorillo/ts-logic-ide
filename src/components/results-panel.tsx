import { type Component, For, Show } from 'solid-js'
import { state } from '../stores/verification-store'
import { ConstraintDebug } from './constraint-debug'
import { LoopTrace } from './loop-trace'

export const ResultsPanel: Component = () => {
  return (
    <div class="results-panel">
      <h2>Z3 Results</h2>

      <Show when={!state.z3Supported}>
        <div class="alert alert-warn">
          SharedArrayBuffer not available. Run via <code>npm run dev</code> for COOP/COEP headers.
        </div>
      </Show>

      <Show when={state.parseErrors.length > 0}>
        <section class="result-section">
          <h3>Parse errors</h3>
          <ul class="error-list">
            <For each={state.parseErrors}>
              {(err) => (
                <li>
                  Line {err.line}:{err.column} — {err.message}
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>

      <Show when={state.buildError}>
        <section class="result-section">
          <div class="alert alert-error">{state.buildError}</div>
        </section>
      </Show>

      <Show when={state.result}>
        {(result) => (
          <>
            <section class="result-section">
              <h3>Assertions</h3>
              <Show
                when={(result().assertResults ?? []).length > 0}
                fallback={<p class="muted">No assert statements found.</p>}
              >
                <ul class="assert-list">
                  <For each={result().assertResults ?? []}>
                    {(item) => (
                      <li class={`assert-item ${item.valid ? 'valid' : 'invalid'}`}>
                        <div class="assert-header">
                          <span class={`badge ${item.valid ? 'badge-valid' : 'badge-invalid'}`}>
                            {item.valid ? 'VALID (UNSAT)' : 'INVALID (SAT)'}
                          </span>
                          <span>Line {item.line}</span>
                        </div>
                        <Show when={item.counterexample}>
                          {(model) => (
                            <div class="counterexample">
                              <strong>Counterexample</strong>
                              <pre>{formatModel(model())}</pre>
                            </div>
                          )}
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </section>

            <Show when={result().finalModel}>
              {(model) => (
                <section class="result-section">
                  <h3>Final model</h3>
                  <pre class="model-block">{formatModel(model())}</pre>
                </section>
              )}
            </Show>

            <ConstraintDebug constraints={result().debugConstraints ?? []} />
            <LoopTrace steps={result().loopTrace ?? []} />

            <section class="result-section">
              <h3>Domains</h3>
              <Show
                when={(result().domainResults ?? []).length > 0}
                fallback={<p class="muted">Use domain(var, condition) to enumerate satisfying values.</p>}
              >
                <ul class="assert-list">
                  <For each={result().domainResults ?? []}>
                    {(item) => (
                      <li class="assert-item domain-item">
                        <div class="assert-header">
                          <span class="badge badge-domain">DOMAIN</span>
                          <span>Line {item.line} — {item.variable}</span>
                        </div>
                        <Show
                          when={item.values.length > 0}
                          fallback={<p class="muted">No values satisfy the condition.</p>}
                        >
                          <pre class="model-block">{item.values.join(', ')}</pre>
                        </Show>
                        <Show when={item.truncated}>
                          <p class="muted">Showing first {32} values (increase search or narrow condition).</p>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </section>

            <section class="result-section">
              <h3>Functions</h3>
              <Show
                when={(result().functionResults ?? []).length > 0}
                fallback={<p class="muted">Define functions at the top of the file.</p>}
              >
                <For each={result().functionResults ?? []}>
                  {(fn) => (
                    <div class="function-card">
                      <h4>
                        {fn.name}({fn.param}: number) — line {fn.line}
                      </h4>
                      <p class="muted">
                        Valid inputs for <strong>{fn.param}</strong> in [{fn.paramRange.min}, {fn.paramRange.max}]
                        (no assert failure):
                      </p>
                      <pre class="model-block">
                        {(fn.validInputs ?? []).length > 0 ? (fn.validInputs ?? []).join(', ') : '(none)'}
                      </pre>
                      <Show when={(fn.assertResults ?? []).length > 0}>
                        <p class="muted">Symbolic asserts in body:</p>
                        <ul class="fn-assert-list">
                          <For each={fn.assertResults ?? []}>
                            {(a) => (
                              <li>
                                <span class={a.valid ? 'text-valid' : 'text-invalid'}>
                                  {a.valid ? 'VALID' : 'INVALID'}
                                </span>{' '}
                                {a.label}
                              </li>
                            )}
                          </For>
                        </ul>
                      </Show>
                    </div>
                  )}
                </For>
              </Show>
            </section>
          </>
        )}
      </Show>

      <Show when={state.status === 'idle'}>
        <p class="muted hint">
          Scegli un esempio nel menu, poi Verify. Per <code>domain</code> con più valori usa{' '}
          <code>let x: number;</code> senza <code>= …</code> e limita con <code>assume</code>.
        </p>
      </Show>
    </div>
  )
}

function formatModel(model: Record<string, string>): string {
  return Object.entries(model)
    .filter(([k]) => !k.startsWith('__arg_') && !k.startsWith('__ret_'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k} = ${v}`)
    .join('\n')
}
