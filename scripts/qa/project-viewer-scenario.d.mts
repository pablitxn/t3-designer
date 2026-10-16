import type { Project } from '../../apps/web/src/private/api'
import type { AppDatabase } from '../../apps/api/src/app-database'
import type { Projects } from '../../apps/api/src/projects'
import type { AssetStore } from '../../apps/api/src/store'
import type { User, Accounts } from '../../apps/api/src/accounts'
import type { Asset } from '@t3-designer/asset-schema'
import type { FoundationVersion } from '@t3-designer/scene-schema'
export const demoPassword: string
export function startViewerScenario(options?: { webPort?: number }): Promise<{
  origin: string; directory: string; users: Record<'owner' | 'viewer' | 'outsider', User>
  ready: Project; empty: Project; foreign: Project; plan: { id: string; name: string; url: string }
  asset: Asset; attached: { id: string; url: string }; versions: FoundationVersion[]
  projects: Projects; accounts: Accounts; database: AppDatabase; store: AssetStore
  revoke: () => Promise<unknown>; restoreAccess: () => Promise<unknown>; expire: () => Promise<unknown>; close: () => Promise<void>
}>
