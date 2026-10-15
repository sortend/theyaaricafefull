"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

function Cup() {
  const g = useRef<THREE.Group>(null);
  const profile = useMemo(() => [[0, 0], [0.55, 0], [0.62, 0.1], [0.95, 1.1], [1, 1.5], [0.93, 1.5], [0.88, 1.2], [0.5, 0.2], [0, 0.15]].map(([x, y]) => new THREE.Vector2(x, y)), []);
  useFrame((s, dt) => {
    if (!g.current) return;
    g.current.rotation.y += dt * 0.3;
    g.current.rotation.x = THREE.MathUtils.lerp(g.current.rotation.x, 0.3 + s.pointer.y * 0.2, 0.05);
  });
  return (
    <group ref={g} position={[0, -0.9, 0]} rotation={[0.3, 0, 0]}>
      <mesh><latheGeometry args={[profile, 64]} /><meshStandardMaterial color="#f4ead8" roughness={0.25} metalness={0.1} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 1.38, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.9, 64]} /><meshStandardMaterial color="#3a2013" roughness={0.35} /></mesh>
      <mesh position={[1.02, 0.85, 0]}><torusGeometry args={[0.35, 0.07, 16, 48]} /><meshStandardMaterial color="#f4ead8" roughness={0.25} /></mesh>
      <mesh position={[0, -0.06, 0]}><cylinderGeometry args={[1.55, 1.25, 0.12, 64]} /><meshStandardMaterial color="#c9a66b" metalness={0.8} roughness={0.3} /></mesh>
    </group>
  );
}
export default function Scene3D() {
  return (
    <Canvas camera={{ position: [0, 1.6, 6], fov: 35 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 5, 3]} intensity={2.2} color="#ffe2b0" />
      <directionalLight position={[-4, 2, -2]} intensity={0.8} color="#c9a66b" />
      <Cup />
    </Canvas>
  );
}
