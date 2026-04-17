const MIN_PROCESSING_SIZE = 2048;
const MAX_PROCESSING_SIZE = 4096;

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
