import type { Sort } from '../ir/types'

export class SSAContext {
  versions = new Map<string, number>()
  types = new Map<string, Sort>()

  clone(): SSAContext {
    const copy = new SSAContext()
    copy.versions = new Map(this.versions)
    copy.types = new Map(this.types)
    return copy
  }

  snapshotVersions(): Map<string, number> {
    return new Map(this.versions)
  }

  declare(name: string, sort: Sort): string {
    this.types.set(name, sort)
    return this.fresh(name)
  }

  fresh(name: string): string {
    const next = (this.versions.get(name) ?? -1) + 1
    this.versions.set(name, next)
    return this.ssaName(name, next)
  }

  current(name: string): string {
    const version = this.versions.get(name)
    if (version === undefined) {
      throw new Error(`Variable "${name}" is used before declaration`)
    }
    return this.ssaName(name, version)
  }

  has(name: string): boolean {
    return this.versions.has(name)
  }

  sortOf(name: string): Sort {
    const sort = this.types.get(name)
    if (!sort) throw new Error(`Unknown type for variable "${name}"`)
    return sort
  }

  ssaName(name: string, version: number): string {
    return `${name}_${version}`
  }

  allCurrentNames(): string[] {
    return [...this.versions.entries()].map(([name, version]) => this.ssaName(name, version))
  }

  currentSnapshot(): Record<string, string> {
    const snapshot: Record<string, string> = {}
    for (const [name, version] of this.versions.entries()) {
      snapshot[name] = this.ssaName(name, version)
    }
    return snapshot
  }
}

export function extractForBound(cond: import('../ir/types').Expr): number | null {
  if (cond.kind !== 'binary' || cond.op !== '<') return null
  if (cond.right.kind !== 'lit' || typeof cond.right.value !== 'number') return null
  return cond.right.value
}
