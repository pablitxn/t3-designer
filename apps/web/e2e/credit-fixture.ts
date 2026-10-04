import type { CreditSummary } from '../src/private/account-api'
export const creditFixture: CreditSummary = {
  tier: 'standard', balance: 100, reserved: 0, debt: 0, trialEndsAt: '2026-10-19T10:00:00Z', trialActive: true, premiumPeriodEndsAt: null,
  premiumMonthlyCredits: 1000, trialCredits: 100, trialDays: 15,
  costs: { asset: 20, revision: 10, project: 50, building: 100, apartment: 50 },
  grants: [{ id: 'grant-trial', userId: 'test-user', sourceKey: 'trial', amount: 100, remaining: 100, reason: 'Créditos de prueba', createdAt: '2026-10-04T10:00:00Z', expiresAt: '2026-10-19T10:00:00Z', revokedAt: null }],
  transactions: [{ id: 'transaction-trial', type: 'grant', amount: 100, reason: 'Créditos de prueba', createdAt: '2026-10-04T10:00:00Z', operationId: null, grantId: 'grant-trial' }],
}
