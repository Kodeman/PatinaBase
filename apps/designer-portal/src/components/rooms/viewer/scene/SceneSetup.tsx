'use client';

/**
 * Scene lighting and environment setup
 */
export function SceneSetup() {
  return (
    <>
      {/* Ambient light for overall illumination */}
      <ambientLight intensity={0.4} />

      {/* Main directional light (simulates sun) */}
      <directionalLight
        position={[10, 10, 5]}
        intensity={1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={50}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />

      {/* Fill light from opposite side */}
      <directionalLight
        position={[-5, 5, -5]}
        intensity={0.3}
      />

      {/* Soft point light for interior feel */}
      <pointLight
        position={[0, 3, 0]}
        intensity={0.5}
        decay={2}
        distance={10}
      />
    </>
  );
}
