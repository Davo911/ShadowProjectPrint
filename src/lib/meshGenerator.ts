import * as THREE from 'three';

export interface ModelConfig {
  bottomRadius: number;      // mm – cone outer radius at base
  topRadius: number;         // mm – cone outer radius at top
  ledHeight: number;         // mm – LED height above floor (projection math only)
  cylinderHeight: number;    // mm – physical cone height
  wallThickness: number;     // mm
  wrapAngle: number;         // degrees – angular range for cutouts
  projectionDistance: number; // mm – shadow reach beyond cone edge
  strutWidth: number;        // mm – support strut tangential width
  strutDepth: number;        // mm – support strut radial depth
  cageRotation: number;      // degrees – rotates cage around Z axis
  cageRadialSegments: number;  // number of vertical struts
  cageHeightSegments: number;  // number of horizontal rings
  enableCage: boolean;         // toggle support cage on/off
}

export const DEFAULT_CONFIG: ModelConfig = {
  bottomRadius: 50,
  topRadius: 25,
  ledHeight: 110,
  cylinderHeight: 100,
  wallThickness: 2.9,
  wrapAngle: 360,
  projectionDistance: 300,
  strutWidth: 2,
  strutDepth: 2,
  cageRotation: 0,
  cageRadialSegments: 8,
  cageHeightSegments: 6,
  enableCage: true,
};

export function autoSizeConfig(_imgW: number, _imgH: number): Partial<ModelConfig> {
  // Fixed physical dimensions that produce good shadows.
  // Image resolution doesn't affect the physical cone size — it only
  // affects marching-squares grid density, which is handled by surfaceRes.
  return {
    bottomRadius: DEFAULT_CONFIG.bottomRadius,
    topRadius: DEFAULT_CONFIG.topRadius,
    projectionDistance: DEFAULT_CONFIG.projectionDistance,
    ledHeight: DEFAULT_CONFIG.ledHeight,
    cylinderHeight: DEFAULT_CONFIG.cylinderHeight,
  };
}

export function getLedPosition(config: ModelConfig): [number, number, number] {
  return [0, config.ledHeight, 0];
}

// ---- Marching squares lookup tables ----
// Corner convention per cell:
//   A = TL (ti, hi+1)   B = TR (ti+1, hi+1)
//   D = BL (ti, hi)     C = BR (ti+1, hi)
// Cell-local coordinates: BL=(0,0) BR=(1,0) TR=(1,1) TL=(0,1)
// Edge midpoints: B=(0.5,0) R=(1,0.5) T=(0.5,1) L=(0,0.5)
// Case index = (A?8:0) | (B?4:0) | (C?2:0) | (D?1:0)
// All polygons in CCW winding (grid space)

type Pt2 = [number, number];

const MS_POLYS: Pt2[][][] = [
  [],                                                            // 0:  ----
  [[[0,0],[0.5,0],[0,0.5]]],                                    // 1:  ---D
  [[[0.5,0],[1,0],[1,0.5]]],                                    // 2:  --C-
  [[[0,0],[1,0],[1,0.5],[0,0.5]]],                              // 3:  --CD
  [[[1,0.5],[1,1],[0.5,1]]],                                    // 4:  -B--
  [[[0,0],[0.5,0],[0,0.5]],[[1,0.5],[1,1],[0.5,1]]],           // 5:  -B-D
  [[[0.5,0],[1,0],[1,1],[0.5,1]]],                              // 6:  -BC-
  [[[0,0],[1,0],[1,1],[0.5,1],[0,0.5]]],                        // 7:  -BCD
  [[[0,0.5],[0.5,1],[0,1]]],                                    // 8:  A---
  [[[0,0],[0.5,0],[0.5,1],[0,1]]],                              // 9:  A--D
  [[[0,0.5],[0.5,1],[0,1]],[[0.5,0],[1,0],[1,0.5]]],           // 10: A-C-
  [[[0,0],[1,0],[1,0.5],[0.5,1],[0,1]]],                        // 11: A-CD
  [[[0,0.5],[1,0.5],[1,1],[0,1]]],                              // 12: AB--
  [[[0,0],[0.5,0],[1,0.5],[1,1],[0,1]]],                        // 13: AB-D
  [[[0.5,0],[1,0],[1,1],[0,1],[0,0.5]]],                        // 14: ABC-
  [[[0,0],[1,0],[1,1],[0,1]]],                                  // 15: ABCD
];

const MS_WALLS: [Pt2, Pt2][][] = [
  [],                                          // 0
  [[[0,0.5],[0.5,0]]],                        // 1
  [[[0.5,0],[1,0.5]]],                        // 2
  [[[0,0.5],[1,0.5]]],                        // 3
  [[[1,0.5],[0.5,1]]],                        // 4
  [[[0,0.5],[0.5,0]],[[1,0.5],[0.5,1]]],     // 5
  [[[0.5,0],[0.5,1]]],                        // 6
  [[[0,0.5],[0.5,1]]],                        // 7
  [[[0.5,1],[0,0.5]]],                        // 8
  [[[0.5,0],[0.5,1]]],                        // 9
  [[[0.5,1],[0,0.5]],[[0.5,0],[1,0.5]]],     // 10
  [[[1,0.5],[0.5,1]]],                        // 11
  [[[0,0.5],[1,0.5]]],                        // 12
  [[[0.5,0],[1,0.5]]],                        // 13
  [[[0,0.5],[0.5,0]]],                        // 14
  [],                                          // 15
];

/**
 * Anamorphic table projector – conical frustum with marching-squares mesh.
 *
 * The cone tapers from bottomRadius at y=0 to topRadius at y=cylinderHeight.
 * Projection math uses the height-varying radius R(y) for inverse raycasting.
 * The physical cone height is ALWAYS cylinderHeight, regardless of ledHeight.
 * ledHeight ONLY affects the projection formula (which pixels map to which cells).
 */
export function generateModel(
  binary: boolean[][],
  _imgW: number,
  _imgH: number,
  config: ModelConfig = DEFAULT_CONFIG,
  projCenterX?: number,
  projCenterY?: number,
): THREE.BufferGeometry {
  const nImgRows = binary.length;
  const nImgCols = binary[0].length;
  const {
    bottomRadius, topRadius, ledHeight, cylinderHeight,
    wallThickness, wrapAngle: wrapDeg, projectionDistance,
    strutWidth, strutDepth, cageRotation,
    cageRadialSegments, cageHeightSegments, enableCage,
  } = config;

  // ---- Cone radius functions ----

  function outerRAtY(y: number): number {
    return bottomRadius + (topRadius - bottomRadius) * y / cylinderHeight;
  }
  function innerRAtY(y: number): number {
    return Math.max(outerRAtY(y) - wallThickness, 0.5);
  }
  function cageInnerRAtY(y: number): number {
    return Math.max(innerRAtY(y) - strutDepth, 0.3);
  }

  // ---- Floor mapping ----

  const edgeDist = bottomRadius + projectionDistance;
  const floorScale = (2 * edgeDist) / Math.max(nImgCols, nImgRows);

  const baseHeight = Math.max(2, wallThickness * 2);

  // Projection center (defaults to image center)
  const centerX = projCenterX ?? nImgCols / 2;
  const centerY = projCenterY ?? nImgRows / 2;

  // Grid resolution – high for smooth shadows
  const surfaceRes = Math.max(floorScale * 0.35, 0.1);
  const maxR = Math.max(bottomRadius, topRadius);
  const nTheta = Math.min(Math.max(Math.ceil((2 * Math.PI * maxR) / surfaceRes), 256), 1024);
  const nHeight = Math.min(Math.max(Math.ceil(cylinderHeight / surfaceRes), 128), 800);

  const wrapRad = (wrapDeg * Math.PI) / 180;

  // ---- Compute corner values for marching squares ----

  function isCornerSolid(ti: number, hi: number): boolean {
    const theta = (2 * Math.PI * ti) / nTheta;
    const y = (cylinderHeight * hi) / nHeight;

    // Solid base ring
    if (y <= baseHeight) return true;

    // Wrap angle mask
    if (wrapDeg < 359.9) {
      let nt = theta;
      if (nt > Math.PI) nt -= 2 * Math.PI;
      if (nt < -wrapRad / 2 || nt > wrapRad / 2) return true;
    }

    // ---- Projection math only ----
    // ledHeight is ONLY used here as H in the anamorphic formula.
    // It does NOT clip the cone height or create solid bands.
    const R_y = outerRAtY(y);
    const denom = ledHeight - y;

    // If this cell is at or above the LED, the projection is undefined.
    // The ray shoots upward/horizontal — it can never hit the floor.
    // Return solid so the cell becomes wall (physically correct, no
    // visual coupling because ledHeight > cylinderHeight in normal use).
    if (denom <= 0) return true;

    const d = (ledHeight * R_y) / denom;
    const xf = d * Math.cos(theta);
    const zf = d * Math.sin(theta);

    // Map projected floor point to image pixel
    const px = Math.floor(xf / floorScale + centerX);
    const py = Math.floor(centerY - zf / floorScale);

    if (px < 0 || px >= nImgCols || py < 0 || py >= nImgRows) return true;

    return binary[py][px];
  }

  // Corner grid: corners[hi][ti] for hi in [0, nHeight], ti in [0, nTheta)
  const corners: boolean[][] = [];
  for (let hi = 0; hi <= nHeight; hi++) {
    corners[hi] = [];
    for (let ti = 0; ti < nTheta; ti++) {
      corners[hi][ti] = hi < nHeight ? isCornerSolid(ti, hi) : false;
    }
  }

  function getCorner(ti: number, hi: number): boolean {
    if (hi < 0 || hi > nHeight) return false;
    return corners[hi][((ti % nTheta) + nTheta) % nTheta];
  }

  // ---- Geometry helpers for cone ----

  function gridTo3DOuter(tiFrac: number, hiFrac: number): number[] {
    const theta = (2 * Math.PI * tiFrac) / nTheta;
    const y = (cylinderHeight * hiFrac) / nHeight;
    const r = outerRAtY(y);
    return [r * Math.cos(theta), y, r * Math.sin(theta)];
  }

  function gridTo3DInner(tiFrac: number, hiFrac: number): number[] {
    const theta = (2 * Math.PI * tiFrac) / nTheta;
    const y = (cylinderHeight * hiFrac) / nHeight;
    const r = innerRAtY(y);
    return [r * Math.cos(theta), y, r * Math.sin(theta)];
  }

  const verts: number[] = [];

  function pushTri(a: number[], b: number[], c: number[]) {
    verts.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  }

  function pushQuad(a: number[], b: number[], c: number[], d: number[]) {
    pushTri(a, b, c);
    pushTri(a, c, d);
  }

  // ---- 1. Marching squares cone wall ----

  for (let hi = 0; hi < nHeight; hi++) {
    for (let ti = 0; ti < nTheta; ti++) {
      const d = getCorner(ti, hi);       // BL
      const c = getCorner(ti + 1, hi);   // BR
      const b = getCorner(ti + 1, hi + 1); // TR
      const a = getCorner(ti, hi + 1);   // TL

      const caseIdx = (a ? 8 : 0) | (b ? 4 : 0) | (c ? 2 : 0) | (d ? 1 : 0);
      if (caseIdx === 0) continue;

      const polygons = MS_POLYS[caseIdx];
      const boundaries = MS_WALLS[caseIdx];

      for (const poly of polygons) {
        const outerV = poly.map(([dx, dy]) => gridTo3DOuter(ti + dx, hi + dy));
        const innerV = poly.map(([dx, dy]) => gridTo3DInner(ti + dx, hi + dy));

        // Outer face: reverse CCW → CW in grid space → outward radial normal
        for (let i = 1; i < outerV.length - 1; i++) {
          pushTri(outerV[0], outerV[i + 1], outerV[i]);
        }

        // Inner face: keep CCW in grid space → inward radial normal
        for (let i = 1; i < innerV.length - 1; i++) {
          pushTri(innerV[0], innerV[i], innerV[i + 1]);
        }
      }

      // Boundary walls (connecting outer to inner along contour line)
      for (const [[x1, y1], [x2, y2]] of boundaries) {
        const o1 = gridTo3DOuter(ti + x1, hi + y1);
        const o2 = gridTo3DOuter(ti + x2, hi + y2);
        const i1 = gridTo3DInner(ti + x1, hi + y1);
        const i2 = gridTo3DInner(ti + x2, hi + y2);
        pushQuad(o1, o2, i2, i1);
      }
    }
  }

  // ---- 2. Bottom cap – solid annular ring at y = 0 ----

  const botOuterR = outerRAtY(0);
  const cageActive = enableCage && (cageRadialSegments > 0 || cageHeightSegments > 0);
  const botInnerR = cageActive ? cageInnerRAtY(0) : innerRAtY(0);

  for (let ti = 0; ti < nTheta; ti++) {
    const t1 = (2 * Math.PI * ti) / nTheta;
    const t2 = (2 * Math.PI * (ti + 1)) / nTheta;

    const o1 = [botOuterR * Math.cos(t1), 0, botOuterR * Math.sin(t1)];
    const o2 = [botOuterR * Math.cos(t2), 0, botOuterR * Math.sin(t2)];
    const i1 = [botInnerR * Math.cos(t1), 0, botInnerR * Math.sin(t1)];
    const i2 = [botInnerR * Math.cos(t2), 0, botInnerR * Math.sin(t2)];

    pushQuad(o1, o2, i2, i1);
  }

  // ---- 3. Inner support cage (thick FDM-printable, follows cone taper) ----
  // Skipped entirely when cage is disabled or both segment counts are 0.

  if (cageActive) {
    const nStruts = cageRadialSegments;
    const nRings = cageHeightSegments;

    const cageRotRad = (cageRotation * Math.PI) / 180;
    const minCageOuterR = Math.min(innerRAtY(0), innerRAtY(cylinderHeight));
    const strutAngularHalfW = strutWidth / (2 * minCageOuterR);

    const strutCentres: number[] = [];
    for (let s = 0; s < nStruts; s++) {
      strutCentres.push((2 * Math.PI * s) / nStruts + cageRotRad);
    }

    // 3a. Vertical struts – tapered rectangular pillars following cone slope
    for (let s = 0; s < nStruts; s++) {
      const tc = strutCentres[s];
      const t1 = tc - strutAngularHalfW;
      const t2 = tc + strutAngularHalfW;

      const cogBot = innerRAtY(0);
      const cigBot = cageInnerRAtY(0);
      const cogTop = innerRAtY(cylinderHeight);
      const cigTop = cageInnerRAtY(cylinderHeight);

      const otl = [cogTop * Math.cos(t1), cylinderHeight, cogTop * Math.sin(t1)];
      const otr = [cogTop * Math.cos(t2), cylinderHeight, cogTop * Math.sin(t2)];
      const obl = [cogBot * Math.cos(t1), 0, cogBot * Math.sin(t1)];
      const obr = [cogBot * Math.cos(t2), 0, cogBot * Math.sin(t2)];

      const itl = [cigTop * Math.cos(t1), cylinderHeight, cigTop * Math.sin(t1)];
      const itr = [cigTop * Math.cos(t2), cylinderHeight, cigTop * Math.sin(t2)];
      const ibl = [cigBot * Math.cos(t1), 0, cigBot * Math.sin(t1)];
      const ibr = [cigBot * Math.cos(t2), 0, cigBot * Math.sin(t2)];

      pushQuad(otl, otr, obr, obl); // outer (flush w/ cone inner wall)
      pushQuad(itl, ibl, ibr, itr); // inner
      pushQuad(otl, obl, ibl, itl); // left side
      pushQuad(otr, itr, ibr, obr); // right side
      pushQuad(itl, itr, otr, otl); // top cap
      pushQuad(obl, obr, ibr, ibl); // bottom cap
    }

    // 3b. Horizontal rings – thick arcs between struts at cone radius
    if (nStruts > 0) {
      for (let r = 0; r < nRings; r++) {
        const yCenter = baseHeight + (cylinderHeight - baseHeight) * (r + 1) / (nRings + 1);
        const yBot = yCenter - strutWidth / 2;
        const yTop = yCenter + strutWidth / 2;

        const ringOuterR = innerRAtY(yCenter);
        const ringInnerR = cageInnerRAtY(yCenter);

        for (let s = 0; s < nStruts; s++) {
          const arcStart = strutCentres[s] + strutAngularHalfW;
          const arcEnd = strutCentres[(s + 1) % nStruts] - strutAngularHalfW;

          let arcSpan = arcEnd - arcStart;
          if (arcSpan <= 0) arcSpan += 2 * Math.PI;

          const arcLen = arcSpan * ringOuterR;
          const nArcSegs = Math.max(Math.ceil(arcLen / 1.0), 4);

          for (let seg = 0; seg < nArcSegs; seg++) {
            const a1 = arcStart + arcSpan * (seg / nArcSegs);
            const a2 = arcStart + arcSpan * ((seg + 1) / nArcSegs);

            const o1t = [ringOuterR * Math.cos(a1), yTop, ringOuterR * Math.sin(a1)];
            const o2t = [ringOuterR * Math.cos(a2), yTop, ringOuterR * Math.sin(a2)];
            const o1b = [ringOuterR * Math.cos(a1), yBot, ringOuterR * Math.sin(a1)];
            const o2b = [ringOuterR * Math.cos(a2), yBot, ringOuterR * Math.sin(a2)];

            const i1t = [ringInnerR * Math.cos(a1), yTop, ringInnerR * Math.sin(a1)];
            const i2t = [ringInnerR * Math.cos(a2), yTop, ringInnerR * Math.sin(a2)];
            const i1b = [ringInnerR * Math.cos(a1), yBot, ringInnerR * Math.sin(a1)];
            const i2b = [ringInnerR * Math.cos(a2), yBot, ringInnerR * Math.sin(a2)];

            pushQuad(o1t, o2t, o2b, o1b); // outer
            pushQuad(i1t, i1b, i2b, i2t); // inner
            pushQuad(i1t, i2t, o2t, o1t); // top
            pushQuad(o1b, o2b, i2b, i1b); // bottom
          }

          // End caps where ring arc meets strut
          for (const angle of [arcStart, arcEnd]) {
            const ot = [ringOuterR * Math.cos(angle), yTop, ringOuterR * Math.sin(angle)];
            const ob = [ringOuterR * Math.cos(angle), yBot, ringOuterR * Math.sin(angle)];
            const it = [ringInnerR * Math.cos(angle), yTop, ringInnerR * Math.sin(angle)];
            const ib = [ringInnerR * Math.cos(angle), yBot, ringInnerR * Math.sin(angle)];
            pushQuad(ot, ob, ib, it);
          }
        }
      }
    }
  }

  // ---- Finalise ----

  if (verts.length === 0) {
    throw new Error('No geometry – adjust threshold');
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  return geo;
}
