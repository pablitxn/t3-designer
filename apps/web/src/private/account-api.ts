export type InvitationMetadata = { email: string | null; tier: 'standard' | 'premium'; trialDays: number; trialCredits: number; expiresAt: string }
export type CreditSummary = {
  tier: 'standard' | 'premium'; balance: number; reserved: number; debt: number; trialEndsAt: string; trialActive: boolean; premiumPeriodEndsAt: string | null;
  premiumMonthlyCredits: number; trialCredits: number; trialDays: number;
  costs: { asset: number; revision: number; project: number; building: number; apartment: number };
  grants: { id: string; userId: string; sourceKey: string; amount: number; remaining: number; reason: string; createdAt: string; expiresAt: string | null; revokedAt: string | null }[];
  transactions: { id: string; type: string; amount: number; reason: string; createdAt: string; operationId: string | null; grantId: string | null }[];
}
export type BillingProduct = { id: string; label: string; kind: 'subscription' | 'pack'; amount: number; credits: number; months: number | null }
export type BillingSummary = {
  mode: 'disabled' | 'sandbox' | 'mock'; currency: 'ARS'; products: BillingProduct[];
  subscription: { id: string; product: string; status: string; checkoutUrl: string | null; periodEndsAt: string | null } | null;
  orders: { id: string; product: string; kind: string; status: string; amount: number; credits: number; checkoutUrl: string | null; createdAt: string }[];
  payments: { providerId: string; orderId: string; status: string; approvedAt: string | null; periodEndsAt: string | null }[];
}
