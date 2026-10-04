/** Public test operator; never identifies a real deployment or collector. */
export const siteConfigFixture = {
  version: 1,
  privacyRevision: 'test-profile-v1',
  operator: {
    name: 'Example Operator', contactEmail: 'privacy@example.test', reviewedOn: '2026-10-04',
    hosting: 'Example hosting location supplied by the test operator.',
    operationalLogs: 'The test operator keeps no operational logs.',
    retention: 'Test collector data is discarded when each test ends.',
  },
  analytics: {
    scriptUrl: '/umami/script.js', hostUrl: '/umami',
    websiteId: '00000000-0000-4000-8000-000000000001', hostname: '127.0.0.1',
  },
} as const
