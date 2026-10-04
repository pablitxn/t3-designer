export type PrivacyPolicy = { readonly blockedTerms: readonly string[]; readonly binaryBlockedTerms: readonly string[] }
export function parsePrivacyPolicy(source: string): PrivacyPolicy
export function loadPrivacyPolicy(policyFile?: string, repositoryRoot?: string, gitDirectory?: string): PrivacyPolicy
export function isTestFixturePath(filename: string): boolean
export function safeFindingPath(path: string, policy?: PrivacyPolicy): string
export function pngMetadata(content: Buffer): string
export function privacyFindings(content: Buffer, filename: string, policy?: PrivacyPolicy): string[]
export function auditPublicArtifacts(buildDirectory?: string, options?: { cwd?: string; policyFile?: string }): Promise<{ checked: number; failures: { file: string; findings: string[] }[] }>
