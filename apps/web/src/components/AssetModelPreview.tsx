import { Component, memo, Suspense, useMemo, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { Bounds, Center, OrbitControls, useGLTF } from '@react-three/drei'
import { Mesh, PCFShadowMap } from 'three'
import { useTranslation } from 'react-i18next'
import { WebGLGuard } from './WebGLGuard'

const previewShadows = { type: PCFShadowMap }
const previewCamera = { position: [2, 1.5, 3] as [number, number, number], fov: 40 }

class PreviewBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  const clone = useMemo(() => {
    const result = scene.clone(true)
    result.traverse(node => { if (node instanceof Mesh) { node.castShadow = true; node.receiveShadow = true } })
    return result
  }, [scene])
  return <primitive object={clone} dispose={null} />
}

export const AssetModelPreview = memo(function AssetModelPreview({ url }: { url: string }) {
  const { t } = useTranslation('assets')
  return <div className="workshop-model" aria-label={t('library.model')}>
    <PreviewBoundary key={url} fallback={<p className="workshop-canvas-message" role="status">{t('library.modelFailed')}</p>}>
      <WebGLGuard fallback={<p className="workshop-canvas-message">{t('library.noWebGL')}</p>}>
        <Canvas shadows={previewShadows} camera={previewCamera} dpr={[1, 1.75]}>
          <color attach="background" args={['#e9e9e2']} />
          <ambientLight intensity={1.6} />
          <directionalLight position={[3, 5, 4]} intensity={3} castShadow shadow-mapSize={[1024, 1024]} shadow-normalBias={0.01} />
          <directionalLight position={[-3, 2, -2]} intensity={1.2} />
          <Suspense fallback={null}>
            <Bounds fit clip observe margin={1.3}><Center><Model url={url} /></Center></Bounds>
          </Suspense>
          <OrbitControls makeDefault minPolarAngle={0.15} maxPolarAngle={Math.PI * .9} />
        </Canvas>
        <p className="workshop-model-guide">{t('library.drag')}</p>
      </WebGLGuard>
    </PreviewBoundary>
  </div>
})
