import { type Component } from 'solid-js'
import { EditorPanel } from './editor-panel'
import { ResultsPanel } from './results-panel'

export const IdeLayout: Component = () => {
  return (
    <div class="ide-layout">
      <EditorPanel />
      <ResultsPanel />
    </div>
  )
}
