export type HistoryAuditLimits = {
  maxObjects: number; maxCommits: number; maxTreeEntries: number;
  maxBlobBytes: number; maxTotalBytes: number; maxCommandBytes: number;
  commandTimeoutMs: number; scanTimeoutMs: number; maxFailures: number;
}
export type HistoryAuditResult = {
  checkedBlobs: number; checkedCommits: number; checkedTags: number;
  failures: { path: string; type: string; findings: string[] }[];
}
export type HistoryAuditOptions = { cwd?: string; revision?: string; policyFile?: string; limits?: Partial<HistoryAuditLimits> }
export function auditPublicHistory(options?: HistoryAuditOptions): HistoryAuditResult
export function auditPrePush(input: string, options?: Omit<HistoryAuditOptions, 'revision'>): HistoryAuditResult[]
