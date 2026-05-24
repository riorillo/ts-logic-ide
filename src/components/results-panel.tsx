import { type Component, For, Show } from 'solid-js'
import { locale } from '../i18n/locale'
import { translateBuildError, translateParseError, translateResultLabel } from '../i18n/parse-errors'
import { t } from '../i18n/messages'
import { state } from '../stores/verification-store'
import { ConstraintDebug } from './constraint-debug'
import { LoopTrace } from './loop-trace'

export const ResultsPanel: Component = () => {
  const loc = () => locale()

  return (
    <div class="results-content">
      <h2>{t('results.title')}</h2>

      <Show when={!state.z3Supported}>
        <div class="alert alert-warn">
          {locale() === 'it' ? (
            <>
              SharedArrayBuffer non disponibile. Avvia con <code>npm run dev</code> per gli header
              COOP/COEP.
            </>
          ) : (
            <>
              SharedArrayBuffer not available. Run via <code>npm run dev</code> for COOP/COEP
              headers.
            </>
          )}
        </div>
      </Show>

      <Show when={state.parseErrors.length > 0}>
        <section class="result-section">
          <h3>{t('results.parseErrors')}</h3>
          <ul class="error-list">
            <For each={state.parseErrors}>
              {(err) => (
                <li>
                  {t('results.lineCol', {
                    line: err.line,
                    column: err.column,
                    message: translateParseError(err, loc()),
                  })}
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>

      <Show when={state.buildError}>
        <section class="result-section">
          <div class="alert alert-error">{translateBuildError(state.buildError!, loc())}</div>
        </section>
      </Show>

      <Show when={state.result}>
        {(result) => (
          <>
            <section class="result-section">
              <h3>{t('results.assertions')}</h3>
              <Show
                when={(result().assertResults ?? []).length > 0}
                fallback={<p class="muted">{t('results.noAsserts')}</p>}
              >
                <ul class="assert-list">
                  <For each={result().assertResults ?? []}>
                    {(item) => (
                      <li class={`assert-item ${item.valid ? 'valid' : 'invalid'}`}>
                        <div class="assert-header">
                          <span class={`badge ${item.valid ? 'badge-valid' : 'badge-invalid'}`}>
                            {item.valid ? t('results.valid') : t('results.invalid')}
                          </span>
                          <span>{t('results.line', { line: item.line })}</span>
                        </div>
                        <Show when={item.counterexample}>
                          {(model) => (
                            <div class="counterexample">
                              <strong>{t('results.counterexample')}</strong>
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
                  <h3>{t('results.finalModel')}</h3>
                  <pre class="model-block">{formatModel(model())}</pre>
                </section>
              )}
            </Show>

            <ConstraintDebug constraints={result().debugConstraints ?? []} />
            <LoopTrace steps={result().loopTrace ?? []} />

            <section class="result-section">
              <h3>{t('results.domains')}</h3>
              <Show
                when={(result().domainResults ?? []).length > 0}
                fallback={<p class="muted">{t('results.domainsHint')}</p>}
              >
                <ul class="assert-list">
                  <For each={result().domainResults ?? []}>
                    {(item) => (
                      <li class="assert-item domain-item">
                        <div class="assert-header">
                          <span class="badge badge-domain">{t('results.domainBadge')}</span>
                          <span>
                            {t('results.domainLine', { line: item.line, variable: item.variable })}
                          </span>
                        </div>
                        <Show
                          when={item.values.length > 0}
                          fallback={<p class="muted">{t('results.noDomainValues')}</p>}
                        >
                          <pre class="model-block">{item.values.join(', ')}</pre>
                        </Show>
                        <Show when={item.truncated}>
                          <p class="muted">{t('results.domainTruncated', { max: 32 })}</p>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </section>

            <section class="result-section">
              <h3>{t('results.functions')}</h3>
              <Show
                when={(result().functionResults ?? []).length > 0}
                fallback={<p class="muted">{t('results.noFunctions')}</p>}
              >
                <For each={result().functionResults ?? []}>
                  {(fn) => (
                    <div class="function-card">
                      <h4>
                        {t('results.fnSignature', {
                          name: fn.name,
                          param: fn.param,
                          line: fn.line,
                        })}
                      </h4>
                      <p class="muted">
                        {t('results.fnValidInputs', {
                          param: fn.param,
                          min: fn.paramRange.min,
                          max: fn.paramRange.max,
                        })}
                      </p>
                      <pre class="model-block">
                        {(fn.validInputs ?? []).length > 0
                          ? (fn.validInputs ?? []).join(', ')
                          : t('results.none')}
                      </pre>
                      <Show when={(fn.assertResults ?? []).length > 0}>
                        <p class="muted">{t('results.fnSymbolicAsserts')}</p>
                        <ul class="fn-assert-list">
                          <For each={fn.assertResults ?? []}>
                            {(a) => (
                              <li>
                                <span class={a.valid ? 'text-valid' : 'text-invalid'}>
                                  {a.valid ? t('results.validShort') : t('results.invalidShort')}
                                </span>{' '}
                                {translateResultLabel(a.label, loc())}
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
        <p class="muted hint">{t('results.idleHint')}</p>
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
