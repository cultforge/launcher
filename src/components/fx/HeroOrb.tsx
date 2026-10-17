import { Suspense, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial } from "@react-three/drei";
import { useRef } from "react";
import type { Mesh } from "three";
import { BUILTIN_THEMES_ALL } from "../../data/themes";
import { useThemeStore } from "../../stores/theme";

function OrbMesh({ color, emissive }: { color: string; emissive: string }) {
  const ref = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * 0.35;
    ref.current.rotation.x += delta * 0.12;
  });

  return (
    <Float speed={1.4} rotationIntensity={0.35} floatIntensity={0.6}>
      <mesh ref={ref} scale={1.15}>
        <icosahedronGeometry args={[1, 1]} />
        <MeshDistortMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={0.45}
          roughness={0.25}
          metalness={0.55}
          distort={0.28}
          speed={1.6}
          transparent
          opacity={0.85}
        />
      </mesh>
    </Float>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function HeroOrb({ className = "" }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  const activeThemeId = useThemeStore((s) => s.activeThemeId);
  const customThemes = useThemeStore((s) => s.customThemes);
  const theme =
    [...BUILTIN_THEMES_ALL, ...customThemes].find(
      (candidate) => candidate.id === activeThemeId,
    ) ?? BUILTIN_THEMES_ALL[0];

  if (reduced) {
    return (
      <div
        className={`pointer-events-none absolute inset-0 flex items-center justify-center ${className}`}
        aria-hidden
      >
        <div className="h-16 w-16 rounded-full bg-primary-base/20 blur-xl animate-breathe" />
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-none absolute inset-0 ${className}`}
      aria-hidden
    >
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 3.2], fov: 42 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[2, 3, 2]} intensity={1.1} />
        <Suspense fallback={null}>
          <OrbMesh
            color={theme.tokens.primaryBase}
            emissive={theme.tokens.primaryMuted}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
