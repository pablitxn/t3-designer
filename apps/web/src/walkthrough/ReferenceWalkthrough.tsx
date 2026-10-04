import { useMemo } from 'react'
import type { Fixture } from '@t3-designer/scene-schema'
import type { SolarStudy } from '../lib/useSolarStudy'
import { Walkthrough } from './Walkthrough'
import { publicScene } from '../lib/public-scene'

export function ReferenceWalkthrough({ solar, fixtures, onClose }: { solar: SolarStudy; fixtures: Fixture[]; onClose: () => void }) {
  const snapshot = useMemo(() => publicScene(fixtures), [fixtures])
  return <Walkthrough snapshot={snapshot} initialMoment={solar.moment} reference onClose={onClose} />
}
