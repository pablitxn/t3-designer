import { randomUUID } from 'node:crypto'
import type { CreditKind, CreditService } from './credits.ts'
import type { AssetStore } from './store.ts'

/** The asset library has one process owner. Serialize queue transitions while the
 * account ledger provides database-level locking across all balance writers. */
export class GenerationCredits {
  private queue: Promise<unknown> = Promise.resolve()
  private credits: CreditService
  private store: AssetStore
  constructor(credits: CreditService, store: AssetStore) { this.credits = credits; this.store = store }
  exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work, work)
    this.queue = result.catch(() => undefined)
    return result
  }
  async reserve(userId: string, jobId: string, kind: CreditKind): Promise<string> {
    // Recover a previously persisted terminal attempt before replacing its pointer.
    await this.settle(jobId)
    const operationId = randomUUID()
    await this.credits.reserve(userId, operationId, kind)
    try { this.store.setCreditOperation(jobId, operationId) }
    catch (error) { await this.credits.refund(operationId); throw error }
    return operationId
  }
  started(jobId: string): void { this.store.markCreditInference(jobId) }
  async settle(jobId: string): Promise<void> {
    const operation = this.store.creditOperation(jobId)
    if (!operation) return
    const reservation = await this.credits.reservation(operation.operationId)
    // A settled attempt remains immutable when its job is later cancelled,
    // retried, or fails to re-enter the queue.
    if (!reservation || reservation.state !== 'reserved') return
    const job = this.store.getJob(jobId)
    if (job && ['queued', 'analyzing', 'generating'].includes(job.status)) return
    if (job?.status === 'completed' || (job?.status === 'needs_input' && operation.inferenceStarted)) await this.credits.commit(operation.operationId)
    else await this.credits.refund(operation.operationId)
  }
  async recover(): Promise<void> {
    for (const reservation of await this.credits.listReservations()) {
      if (reservation.kind !== 'asset' && reservation.kind !== 'revision') continue
      const jobId = this.store.creditJob(reservation.id)
      if (!jobId) await this.credits.refund(reservation.id)
      else await this.settle(jobId)
    }
  }
  async authorized(jobId: string): Promise<boolean> {
    const operation = this.store.creditOperation(jobId)
    if (!operation) return false
    const reservation = await this.credits.reservation(operation.operationId)
    return reservation?.state === 'reserved' && reservation.userId === this.store.owner('job', jobId)
  }
}
