import { Component, Suspense, useMemo, type ReactNode, type RefObject } from 'react'
import { Html, useGLTF } from '@react-three/drei'
import { Mesh, type Group } from 'three'
import { currentFixtures } from '../data/current-state'
import { demoAssets } from '../data/demo-catalog'
import { useTranslation } from 'react-i18next'
import { assetEvidence, assetLabel } from '../i18n/workspace-labels'
import type { Fixture } from '@t3-designer/scene-schema'

type AssetBoundaryProps = { label: string; url: string; retryLabel: string; children: ReactNode }

class AssetBoundary extends Component<AssetBoundaryProps, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) {
      return (
        <Html center>
          <span role="status" style={{ display: 'block', width: 135, padding: '7px 10px', borderRadius: 8, background: '#f4eee5', color: '#76513c', font: '11px/1.4 system-ui', textAlign: 'center' }}>
            {this.props.label}
            <button type="button" onClick={() => { useGLTF.clear(this.props.url); this.setState({ failed: false }) }} style={{ display: 'block', margin: '5px auto 0', cursor: 'pointer' }}>{this.props.retryLabel}</button>
          </span>
        </Html>
      )
    }
    return this.props.children
  }
}

function FixtureModel({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  const model = useMemo(() => {
    // Clone nodes per instance; geometry and immutable PBR materials are shared.
    // In particular the three radiators must never reparent one cached scene.
    const clone = scene.clone(true)
    clone.traverse((node) => {
      if (node instanceof Mesh) {
        node.castShadow = true
        node.receiveShadow = true
      }
    })
    return clone
  }, [scene])
  return <primitive object={model} dispose={null} />
}

export type FixtureEditing = {
  objects: RefObject<Map<string, Group>>
  selectedId: string | null
  enabled: boolean
}

export function Fixtures({ fixtures = currentFixtures, editing }: { fixtures?: Fixture[]; editing?: FixtureEditing }) {
  const { t } = useTranslation('workspace')
  return (
    <group name="current-state-fixtures">
      {fixtures.map((fixture) => {
        const asset = demoAssets.find((candidate) => candidate.id === fixture.assetId)
        if (!asset) return null
        return (
          <group key={fixture.id} ref={node => {
            if (node) editing?.objects.current.set(fixture.id, node)
            else editing?.objects.current.delete(fixture.id)
          }} name={fixture.id} position={fixture.position} rotation={[0, fixture.rotation, 0]} userData={{ fixtureId: fixture.id, roomId: fixture.roomId, label: assetLabel(t, fixture.assetId, asset.label), evidence: assetEvidence(t, fixture.assetId) || asset.evidence }}>
            <AssetBoundary label={t('fixtures.failed', { label: assetLabel(t, fixture.assetId, asset.label) })} retryLabel={t('fixtures.retry')} url={asset.url}>
              <Suspense fallback={null}>
                <FixtureModel url={asset.url} />
              </Suspense>
            </AssetBoundary>
            {editing?.enabled && <mesh position={[0, asset.dimensions[1] / 2, 0]}>
              <boxGeometry args={asset.dimensions} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
            </mesh>}
            {editing?.enabled && editing.selectedId === fixture.id && <mesh position={[0, asset.dimensions[1] / 2, 0]} renderOrder={10} raycast={() => {}}>
              <boxGeometry args={asset.dimensions.map(value => value + .035) as [number, number, number]} />
              <meshBasicMaterial color="#236747" wireframe depthTest={false} depthWrite={false} />
            </mesh>}
          </group>
        )
      })}
    </group>
  )
}
