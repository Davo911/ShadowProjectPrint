const MIN_PROCESSING_SIZE = 1024;
const MAX_PROCESSING_SIZE = 2048;

export interface ProcessedImage {
  binary: boolean[][];
  width: number;
  height: number;
}

export function processImage(
  img: HTMLImageElement,
  threshold: number,
): ProcessedImage {
  let w = img.naturalWidth;
  let h = img.naturalHeight;

  // Scale to target resolution range for smooth edge detection
  const maxDim = Math.max(w, h);
  if (maxDim < MIN_PROCESSING_SIZE) {
    const scale = MIN_PROCESSING_SIZE / maxDim;
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  } else if (maxDim > MAX_PROCESSING_SIZE) {
    const scale = MAX_PROCESSING_SIZE / maxDim;
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const binary: boolean[][] = [];
  for (let y = 0; y < h; y++) {
    binary[y] = [];
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const luminance =
        0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      binary[y][x] = luminance < threshold;
    }
  }

  return { binary, width: w, height: h };
}

/**
 * Detect floating islands: solid (true) pixel regions not connected to
 * the image border. Border-connected regions attach to the cone's base
 * ring and always-solid outer zone; disconnected regions float in mid-air.
 *
 * Uses BFS flood fill from border — O(w*h), typically <30ms on 2048px images.
 */
export function hasFloatingIslands(binary: boolean[][]): boolean {
  const h = binary.length;
  if (h === 0) return false;
  const w = binary[0].length;

  const visited = new Uint8Array(h * w);
  const queue: number[] = [];

  // Seed: all solid pixels on the image border
  for (let x = 0; x < w; x++) {
    if (binary[0][x]) { visited[x] = 1; queue.push(x); }
    const bIdx = (h - 1) * w + x;
    if (binary[h - 1][x]) { visited[bIdx] = 1; queue.push(bIdx); }
  }
  for (let y = 1; y < h - 1; y++) {
    const lIdx = y * w;
    if (binary[y][0]) { visited[lIdx] = 1; queue.push(lIdx); }
    const rIdx = y * w + w - 1;
    if (binary[y][w - 1]) { visited[rIdx] = 1; queue.push(rIdx); }
  }

  // BFS through solid pixels reachable from border
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const iy = (idx / w) | 0;
    const ix = idx - iy * w;

    if (iy > 0)     { const n = idx - w;     if (!visited[n] && binary[iy - 1][ix]) { visited[n] = 1; queue.push(n); } }
    if (iy < h - 1) { const n = idx + w;     if (!visited[n] && binary[iy + 1][ix]) { visited[n] = 1; queue.push(n); } }
    if (ix > 0)     { const n = idx - 1;     if (!visited[n] && binary[iy][ix - 1]) { visited[n] = 1; queue.push(n); } }
    if (ix < w - 1) { const n = idx + 1;     if (!visited[n] && binary[iy][ix + 1]) { visited[n] = 1; queue.push(n); } }
  }

  // Any solid pixel not reached = floating island
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (binary[y][x] && !visited[y * w + x]) return true;
    }
  }

  return false;
}

export function renderBinaryPreview(
  binary: boolean[][],
  canvas: HTMLCanvasElement,
) {
  const h = binary.length;
  const w = binary[0].length;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(w, h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = binary[y][x] ? 0 : 255;
      imageData.data[i] = v;
      imageData.data[i + 1] = v;
      imageData.data[i + 2] = v;
      imageData.data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}
