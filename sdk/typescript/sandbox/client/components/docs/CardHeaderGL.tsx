import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { cn } from "../../lib/utils";

export type GlVariant =
  | "dictation"
  | "ambient"
  | "agentic"
  | "text-generation"
  | "medical-coding"
  | "extended";

const VARIANT_INDEX: Record<GlVariant, number> = {
  dictation: 0,
  ambient: 1,
  agentic: 2,
  "text-generation": 3,
  "medical-coding": 4,
  extended: 5,
};

// Match --foreground (0 0% 6%) and --corti-lime (77 94% 53%) exactly.
const INK = new THREE.Color("#0f0f0f");
const LIME = new THREE.Color("#b8f816");

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Flat, unlit, orthographic Bauhaus motifs, all in true pixel space (via
// uResolution) so circles are circles and margins are exact regardless of a
// card's aspect ratio. Ink shapes on a transparent ground so the white card
// shows through; a single lime accent per motif.
const fragmentShader = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uMouse;
  uniform vec2 uResolution;
  uniform float uVariant;
  uniform vec3 uInk;
  uniform vec3 uAccent;

  const float PI = 3.14159265;
  const float MARGIN = 16.0;

  float rand(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

  // Signed distance to a rounded box, centered at the origin.
  float sdRoundedBox(vec2 p, vec2 halfSize, float r) {
    vec2 d = abs(p) - halfSize + r;
    return length(max(d, 0.0)) - r + min(max(d.x, d.y), 0.0);
  }

  // Soft, ~2.5px anti-aliased fill from a signed distance.
  float fillMask(float sdf) { return smoothstep(1.25, -1.25, sdf); }

  float circleMask(vec2 p, vec2 c, float r) {
    return fillMask(length(p - c) - r);
  }

  vec2 halfExtent() { return uResolution * 0.5 - MARGIN; }

  // Dictation: two clean sine strokes tapering at the edges, firm lime centerline.
  void dictation(vec2 p, out float ink, out float acc) {
    ink = 0.0; acc = 0.0;
    vec2 ext = halfExtent();
    float t = clamp(p.x / ext.x, -1.0, 1.0);
    float envelope = cos(t * 1.5707);
    float amp = ext.y * 0.6 * (0.65 + 0.35 * uMouse.x);
    acc += fillMask(abs(p.y) - 1.6);
    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      float a = amp * (0.55 + 0.35 * fi) * envelope;
      float freq = 2.4 + fi * 1.3;
      float ph = uTime * (0.9 + fi * 0.35);
      float y = a * sin(t * PI * freq + ph);
      ink += fillMask(abs(p.y - y) - 1.5);
    }
    ink = clamp(ink, 0.0, 1.0);
  }

  // Ambient: rounded, evenly-gapped speaker-turn bars, one row lime.
  void ambient(vec2 p, out float ink, out float acc) {
    ink = 0.0; acc = 0.0;
    vec2 ext = halfExtent();
    float rows = 5.0;
    float slot = (ext.y * 2.0) / rows;
    float row = floor((p.y + ext.y) / slot);
    if (row < 0.0 || row >= rows) return;
    float seed = row + 1.0;
    float drift = 0.16 * sin(uTime * 0.55 + seed * 1.7) + 0.12 * (uMouse.y - 0.5);
    float wFrac = clamp(0.34 + 0.5 * rand(seed) + drift, 0.14, 0.92);
    float barW = ext.x * 2.0 * wFrac;
    float barH = slot * 0.46;
    vec2 c = vec2(-ext.x + barW * 0.5, -ext.y + slot * (row + 0.5));
    float mask = fillMask(sdRoundedBox(p - c, vec2(barW, barH) * 0.5, barH * 0.5));
    float isAccent = step(abs(row - 2.0), 0.5);
    ink += mask * (1.0 - isAccent);
    acc += mask * isAccent;
  }

  // Agentic: a hub with orbiting nodes, one lime, true pixel-space circles.
  void agentic(vec2 p, out float ink, out float acc) {
    ink = 0.0; acc = 0.0;
    vec2 ext = halfExtent();
    float R = min(ext.x, ext.y);
    float rot = uTime * 0.5 + (uMouse.x - 0.5) * 1.6;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float a = rot * (1.0 + 0.1 * fi) + fi * (2.0 * PI / 5.0);
      float r = R * (0.34 + 0.15 * fi);
      vec2 c = vec2(cos(a), sin(a)) * r;
      float mask = circleMask(p, c, 4.5);
      if (i == 0) acc += mask; else ink += mask;
    }
    ink += circleMask(p, vec2(0.0), 3.5);
    ink = clamp(ink, 0.0, 1.0);
  }

  // Text generation: a short paragraph of thin pill lines, the newest one
  // lime with a blinking cursor at its end.
  void textgen(vec2 p, out float ink, out float acc) {
    ink = 0.0; acc = 0.0;
    vec2 ext = halfExtent();
    float rows = 5.0;
    float slot = (ext.y * 2.0) / rows;
    float row = floor((p.y + ext.y) / slot);
    if (row < 0.0 || row >= rows) return;
    float seed = row + 1.0;
    float baseFrac = 0.82 - 0.16 * mod(row, 3.0);
    float wFrac = clamp(baseFrac + 0.04 * sin(uTime * 0.3 + seed), 0.2, 0.9);
    float barW = ext.x * 2.0 * wFrac;
    float barH = slot * 0.26;
    vec2 c = vec2(-ext.x + barW * 0.5, -ext.y + slot * (row + 0.5));
    float mask = fillMask(sdRoundedBox(p - c, vec2(barW, barH) * 0.5, barH * 0.5));
    float isCurrent = step(abs(row - 0.0), 0.5);
    ink += mask * (1.0 - isCurrent);
    acc += mask * isCurrent;
    float blink = step(0.5, fract(uTime * 1.4));
    vec2 cursor = vec2(-ext.x + barW + 6.0, -ext.y + slot * (row + 0.5));
    acc += fillMask(sdRoundedBox(p - cursor, vec2(1.4, barH * 0.5), 1.4)) * isCurrent * blink;
  }

  // Medical coding: a grid of true-square chips, a glow sweeping across them.
  void medcode(vec2 p, out float ink, out float acc) {
    ink = 0.0; acc = 0.0;
    vec2 ext = halfExtent();
    float cell = min(ext.x * 2.0 / 5.0, ext.y * 2.0 / 3.0);
    float cols = floor(ext.x * 2.0 / cell);
    float rows = floor(ext.y * 2.0 / cell);
    vec2 gridSize = vec2(cols, rows) * cell;
    vec2 origin = gridSize * -0.5;
    vec2 cellId = floor((p - origin) / cell);
    if (cellId.x < 0.0 || cellId.x >= cols || cellId.y < 0.0 || cellId.y >= rows) return;
    vec2 c = origin + (cellId + 0.5) * cell;
    float chipSize = cell * 0.6;
    float mask = fillMask(sdRoundedBox(p - c, vec2(chipSize) * 0.5, chipSize * 0.24));
    float idx = cellId.y * cols + cellId.x;
    float total = cols * rows;
    float chipOn = step(0.45, rand(idx));
    float cyclePos = mod(uTime * 0.6, total);
    float dist = min(abs(idx - cyclePos), total - abs(idx - cyclePos));
    float glow = smoothstep(0.9, 0.0, dist);
    ink += mask * chipOn * (1.0 - glow);
    acc += mask * glow;
  }

  float pipelineNodeX(float fi, float usable) {
    return -usable + fi * (2.0 * usable / 3.0);
  }

  // Extended workflows: a node pipeline with an eased, ping-ponging pulse.
  void pipeline(vec2 p, out float ink, out float acc) {
    ink = 0.0; acc = 0.0;
    vec2 ext = halfExtent();
    float usable = ext.x - 6.0;
    ink += fillMask(abs(p.y) - 1.4) * step(abs(p.x), usable);
    for (int i = 0; i < 4; i++) {
      float x = pipelineNodeX(float(i), usable);
      ink += circleMask(p, vec2(x, 0.0), 5.0);
    }
    float cycle = mod(uTime * 0.22, 2.0);
    float tri = cycle < 1.0 ? cycle : 2.0 - cycle;
    float eased = smoothstep(0.0, 1.0, tri);
    float px = -usable + eased * usable * 2.0;
    acc += circleMask(p, vec2(px, 0.0), 5.5);
    ink = clamp(ink, 0.0, 1.0);
  }

  void main() {
    vec2 p = (vUv - 0.5) * uResolution;
    float ink = 0.0;
    float acc = 0.0;
    if (uVariant < 0.5) dictation(p, ink, acc);
    else if (uVariant < 1.5) ambient(p, ink, acc);
    else if (uVariant < 2.5) agentic(p, ink, acc);
    else if (uVariant < 3.5) textgen(p, ink, acc);
    else if (uVariant < 4.5) medcode(p, ink, acc);
    else pipeline(p, ink, acc);

    vec2 ext = halfExtent();
    float clip = (1.0 - smoothstep(ext.x - 2.0, ext.x, abs(p.x)))
      * (1.0 - smoothstep(ext.y - 2.0, ext.y, abs(p.y)));
    ink *= clip;
    acc *= clip;

    float a = clamp(max(ink, acc), 0.0, 1.0);
    vec3 col = mix(uInk, uAccent, step(0.001, acc));
    gl_FragColor = vec4(col, a * 0.92);
  }
`;

function Motif({
  variant,
  mouse,
  paused,
}: {
  variant: GlVariant;
  mouse: React.MutableRefObject<THREE.Vector2>;
  paused: React.MutableRefObject<boolean>;
}) {
  const { viewport } = useThree();
  const uniforms = useRef({
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uVariant: { value: VARIANT_INDEX[variant] },
    uInk: { value: INK },
    uAccent: { value: LIME },
  }).current;

  useFrame((_, delta) => {
    if (paused.current) {
      return;
    }
    uniforms.uTime.value += Math.min(delta, 0.05);
    uniforms.uMouse.value.lerp(mouse.current, 0.08);
    uniforms.uResolution.value.set(viewport.width, viewport.height);
  });

  return (
    <mesh scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
      />
    </mesh>
  );
}

/**
 * A live, cursor-reactive WebGL header for a hero card. Orthographic + unlit +
 * flat so it reads as Bauhaus, not as a 3D scene. Pauses when offscreen or when
 * the user prefers reduced motion.
 */
export function CardHeaderGL({ variant, className }: { variant: GlVariant; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const mouse = useRef(new THREE.Vector2(0.5, 0.5));
  const paused = useRef(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    paused.current = reduced;
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    mouse.current.set((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height);
  };

  return (
    <div ref={wrapRef} onPointerMove={onPointerMove} className={cn("relative", className)}>
      <Canvas
        orthographic
        camera={{ position: [0, 0, 1], zoom: 1 }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true }}
        frameloop={visible ? "always" : "never"}
      >
        <Motif variant={variant} mouse={mouse} paused={paused} />
      </Canvas>
    </div>
  );
}
