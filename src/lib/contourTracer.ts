export type Point = [number, number];

export interface TraceResult {
  contours: Point[][];
  hasFloatingIslands: boolean;
}

// --- Marching squares ---

function padImage(binary: boolean[][]): boolean[][] {
  const h = binary.length;
  const w = binary[0].length;
  const padded: boolean[][] = [new Array(w + 2).fill(false)];
  for (let y = 0; y < h; y++) {
    padded.push([false, ...binary[y], false]);
  }
  padded.push(new Array(w + 2).fill(false));
  return padded;
}

// Edge indices: 0=N(top), 1=E(right), 2=S(bottom), 3=W(left)
function edgeMid(edge: number, cx: number, cy: number): Point {
  switch (edge) {
    case 0: return [cx + 0.5, cy];
    case 1: return [cx + 1, cy + 0.5];
    case 2: return [cx + 0.5, cy + 1];
    default: return [cx, cy + 0.5]; // 3 = W
  }
}

// Lookup table: for each of 16 cases, pairs of edges to connect
const SEGMENT_TABLE: [number, number][][] = [
  [],                   // 0:  ----
  [[3, 2]],             // 1:  ---d
  [[2, 1]],             // 2:  --c-
  [[3, 1]],             // 3:  --cd
  [[0, 1]],             // 4:  -b--
  [[0, 3], [2, 1]],     // 5:  -b-d (saddle)
  [[0, 2]],             // 6:  -bc-
  [[0, 3]],             // 7:  -bcd
  [[0, 3]],             // 8:  a---
  [[0, 2]],             // 9:  a--d
  [[0, 1], [2, 3]],     // 10: a-c- (saddle)
  [[0, 1]],             // 11: a-cd
  [[3, 1]],             // 12: ab--
  [[2, 1]],             // 13: ab-d
  [[3, 2]],             // 14: abc-
  [],                   // 15: abcd
];

function marchingSquares(grid: boolean[][]): [Point, Point][] {
  const rows = grid.length;
  const cols = grid[0].length;
  const segments: [Point, Point][] = [];

  for (let cy = 0; cy < rows - 1; cy++) {
    for (let cx = 0; cx < cols - 1; cx++) {
      const a = grid[cy][cx] ? 8 : 0;
      const b = grid[cy][cx + 1] ? 4 : 0;
      const c = grid[cy + 1][cx + 1] ? 2 : 0;
      const d = grid[cy + 1][cx] ? 1 : 0;
      const caseIdx = a | b | c | d;

      for (const [e1, e2] of SEGMENT_TABLE[caseIdx]) {
        segments.push([edgeMid(e1, cx, cy), edgeMid(e2, cx, cy)]);
      }
    }
  }

  return segments;
}

// --- Segment chaining ---

function ptKey(p: Point): string {
  return `${p[0]},${p[1]}`;
}

function chainSegments(segments: [Point, Point][]): Point[][] {
  const adj = new Map<string, Point[]>();

  for (const [a, b] of segments) {
    const ka = ptKey(a);
    const kb = ptKey(b);
    if (!adj.has(ka)) adj.set(ka, []);
    if (!adj.has(kb)) adj.set(kb, []);
    adj.get(ka)!.push(b);
    adj.get(kb)!.push(a);
  }

  const contours: Point[][] = [];

  for (const [startKey] of adj) {
    const startNeighbors = adj.get(startKey);
    if (!startNeighbors || startNeighbors.length === 0) continue;

    const contour: Point[] = [];
    const [sx, sy] = startKey.split(',').map(Number);
    let current: Point = [sx, sy];

    while (true) {
      const ck = ptKey(current);
      const neighbors = adj.get(ck);
      if (!neighbors || neighbors.length === 0) break;

      contour.push(current);
      const next = neighbors.pop()!;

      // Remove the reverse edge
      const nk = ptKey(next);
      const rn = adj.get(nk);
      if (rn) {
        const idx = rn.findIndex((p) => ptKey(p) === ck);
        if (idx !== -1) rn.splice(idx, 1);
      }

      current = next;
      if (ptKey(current) === ptKey(contour[0])) break;
    }

    if (contour.length >= 3) {
      contours.push(contour);
    }
  }

  return contours;
}

// --- Path simplification (Ramer-Douglas-Peucker) ---

function simplifyContour(points: Point[], tolerance: number): Point[] {
  if (points.length <= 3) return points;

  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  function rdp(start: number, end: number) {
    if (end - start <= 1) return;

    const [x1, y1] = points[start];
    const [x2, y2] = points[end];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);

    let maxDist = 0;
    let maxIdx = start;

    for (let i = start + 1; i < end; i++) {
      const dist =
        len === 0
          ? Math.hypot(points[i][0] - x1, points[i][1] - y1)
          : Math.abs(dy * points[i][0] - dx * points[i][1] + x2 * y1 - y2 * x1) / len;
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }

    if (maxDist > tolerance) {
      keep[maxIdx] = true;
      rdp(start, maxIdx);
      rdp(maxIdx, end);
    }
  }

  rdp(0, points.length - 1);
  return points.filter((_, i) => keep[i]);
}

// --- Signed area (positive = CW in screen coords, Y-down) ---

export function signedArea(contour: Point[]): number {
  let area = 0;
  for (let i = 0; i < contour.length; i++) {
    const j = (i + 1) % contour.length;
    area += contour[i][0] * contour[j][1];
    area -= contour[j][0] * contour[i][1];
  }
  return area / 2;
}

// --- Floating island detection ---

function detectFloatingIslands(binary: boolean[][]): boolean {
  const h = binary.length;
  const w = binary[0].length;
  const visited: boolean[][] = Array.from({ length: h }, () =>
    new Array(w).fill(false),
  );
  const queue: [number, number][] = [];

  // Seed from all white border pixels
  for (let x = 0; x < w; x++) {
    if (!binary[0][x]) queue.push([0, x]);
    if (!binary[h - 1][x]) queue.push([h - 1, x]);
  }
  for (let y = 1; y < h - 1; y++) {
    if (!binary[y][0]) queue.push([y, 0]);
    if (!binary[y][w - 1]) queue.push([y, w - 1]);
  }

  while (queue.length > 0) {
    const [cy, cx] = queue.pop()!;
    if (cy < 0 || cy >= h || cx < 0 || cx >= w) continue;
    if (visited[cy][cx] || binary[cy][cx]) continue;
    visited[cy][cx] = true;
    queue.push([cy - 1, cx], [cy + 1, cx], [cy, cx - 1], [cy, cx + 1]);
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!binary[y][x] && !visited[y][x]) return true;
    }
  }
  return false;
}

// --- Main export ---

export function traceContours(
  binary: boolean[][],
  tolerance: number = 1.0,
): TraceResult {
  const padded = padImage(binary);
  const segments = marchingSquares(padded);
  let contours = chainSegments(segments);

  // Shift coordinates to remove padding offset
  contours = contours.map((c) =>
    c.map(([x, y]) => [x - 1, y - 1] as Point),
  );

  // Simplify paths
  contours = contours.map((c) => simplifyContour(c, tolerance));

  // Filter tiny contours (noise)
  const minArea = 4;
  contours = contours.filter((c) => Math.abs(signedArea(c)) >= minArea);

  const hasFloatingIslands = detectFloatingIslands(binary);

  return { contours, hasFloatingIslands };
}
