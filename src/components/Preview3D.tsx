import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { ModelConfig } from '../lib/meshGenerator';

interface Preview3DProps {
  geometry: THREE.BufferGeometry | null;
  ledPosition: [number, number, number];
  config: ModelConfig;
}

function Model({ geometry }: { geometry: THREE.BufferGeometry }) {
  return (
    <mesh geometry={geometry} castShadow>
      <meshStandardMaterial
        color="#aaa"
        side={THREE.DoubleSide}
        metalness={0.05}
        roughness={0.7}
      />
    </mesh>
  );
}

export default function Preview3D({ geometry, ledPosition, config }: Preview3DProps) {
  const shadowReach = config.bottomRadius + config.projectionDistance;
  const floorSize = Math.max(shadowReach * 3, 300);
  const camDist = Math.max(shadowReach * 1.8, 200);
  const lightIntensity = config.ledHeight * config.ledHeight * 8;

  return (
    <Canvas
      shadows
      camera={{
        position: [camDist * 0.6, config.ledHeight * 1.8, camDist * 0.6],
        fov: 45,
        near: 0.1,
        far: 5000,
      }}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#111118']} />

      {/* Low ambient so floor shadow contrast is high */}
      <ambientLight intensity={0.04} />

      {/* LED point light above the cylinder */}
      <pointLight
        position={ledPosition}
        intensity={lightIntensity}
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-near={0.5}
        shadow-camera-far={floorSize}
        shadow-bias={-0.0005}
        color="#fff5e0"
      />

      {/* LED indicator */}
      <mesh position={ledPosition}>
        <sphereGeometry args={[1.5, 12, 12]} />
        <meshBasicMaterial color="#ffee88" />
      </mesh>

      {geometry && <Model geometry={geometry} />}

      {/* Floor / table surface – catches the projected shadow */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <planeGeometry args={[floorSize, floorSize]} />
        <meshStandardMaterial color="#f5f0e8" roughness={1} />
      </mesh>

      <OrbitControls
        enableDamping
        dampingFactor={0.1}
        target={[0, config.cylinderHeight * 0.4, 0]}
        minDistance={20}
        maxDistance={1000}
      />
    </Canvas>
  );
}
