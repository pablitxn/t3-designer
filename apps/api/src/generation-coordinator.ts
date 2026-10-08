/** One local generation pipeline at a time, shared by all workshops. */
export class GenerationCoordinator {
  private active = false
  private readonly waiting: { signal: AbortSignal; resolve: (release: () => void) => void; reject: (reason: unknown) => void; abort: () => void }[] = []

  acquire(signal: AbortSignal): Promise<() => void> {
    signal.throwIfAborted()
    return new Promise((resolve, reject) => {
      const entry = { signal, resolve, reject, abort: () => {
        const index = this.waiting.indexOf(entry)
        if (index >= 0) this.waiting.splice(index, 1)
        reject(signal.reason)
      } }
      signal.addEventListener('abort', entry.abort, { once: true })
      this.waiting.push(entry)
      this.advance()
    })
  }

  private advance(): void {
    if (this.active) return
    const entry = this.waiting.shift()
    if (!entry) return
    entry.signal.removeEventListener('abort', entry.abort)
    if (entry.signal.aborted) { entry.reject(entry.signal.reason); this.advance(); return }
    this.active = true
    let released = false
    entry.resolve(() => {
      if (released) return
      released = true
      this.active = false
      this.advance()
    })
  }
}

const coordinator = new GenerationCoordinator()
export const acquireGenerationSlot = (signal: AbortSignal): Promise<() => void> => coordinator.acquire(signal)
