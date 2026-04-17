# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server with HMR
- `npm run build` — TypeScript check (`tsc -b`) then Vite production build
- `npm run preview` — Serve built dist/ locally
- No test suite — verify changes visually in the 3D preview

**Known TypeScript warning:** `src/main.tsx` produces `TS2882: Cannot find module or type declarations for side-effect import of './index.css'`. This is a Vite-specific false positive — ignore it.

## Architecture

Single-page React app that converts B&W silhouette images into 3D-printable anamorphic shadow projectors (STL export). Fully client-side, no backend.

**Data flow:** Image upload → binary thresholding → inverse raycast projection onto cone surface → marching squares mesh → Three.js preview with shadow → STL download.

### Core modules

- **`src/lib/meshGenerator.ts`** — Heart of the app. Inverse projection math, marching squares surface generation, support cage geometry. All physical dimensions in mm.
- **`src/lib/imageProcessor.ts`** — Scales image to 2048–4096px range, luminance thresholding to boolean grid.
- **`src/components/Preview3D.tsx`** — Three.js scene: point light at LED position, shadow-receiving floor plane, orbit controls.
- **`src/lib/stlExporter.ts`** — Binary STL export via Three.js STLExporter.
- **`src/lib/contourTracer.ts`** — Unused legacy module (marching squares + RDP simplification).
- **`src/App.tsx`** — UI shell, all state management, two useEffects (auto-size on image load + model generation on any state change).

### Critical design constraint: LED height decoupling

`ledHeight` must ONLY affect two things:
1. The Y-position of the PointLight in Preview3D
2. The `H` variable in the projection formula: `d = (H × R(y)) / (H - y)`

It must NEVER affect the physical cone height, create solid bands, or clip geometry. The cone is always exactly `cylinderHeight` tall. This was a recurring bug — do not reintroduce it.

### Projection math

In `isCornerSolid()`: for each grid cell on the cone surface, compute where an LED ray through that point hits the floor. Map that floor point to an image pixel. Black pixel → solid wall; white → cutout.

```
R(y) = bottomRadius + (topRadius - bottomRadius) × y / cylinderHeight
d = (ledHeight × R(y)) / (ledHeight - y)
floorX = d × cos(θ),  floorZ = d × sin(θ)
pixel = floor(floorPoint / floorScale + projectionCenter)
```

### Marching squares

16-case lookup tables (`MS_POLYS`, `MS_WALLS`) generate smooth contour boundaries on the cone wall. Each cell produces outer face polygons (reversed winding for outward normal), inner face polygons (CCW for inward normal), and boundary quads connecting outer↔inner along contour edges.

## Tech stack

React 19, Three.js 0.183, React Three Fiber 9, @react-three/drei 10, Tailwind CSS 4 (via Vite plugin), TypeScript 6, Vite 8.
