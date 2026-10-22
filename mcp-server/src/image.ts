/** Pure-JS image helpers (no native deps): PNG decode, box downscale, JPEG encode. */
import jpeg from "jpeg-js";
import pngjs from "pngjs";

/** RGBA pixels, 4 bytes per pixel. */
export interface Rgba {
  data: Uint8Array;
  width: number;
  height: number;
}

export function decodePng(png: Buffer): Rgba {
  const { data, width, height } = pngjs.PNG.sync.read(png);
  return { data, width, height };
}

export function encodeJpeg(img: Rgba, quality: number): Buffer {
  return jpeg.encode({ data: img.data, width: img.width, height: img.height }, quality).data;
}

/** True when every pixel's R, G and B are below `threshold` (screen off / FLAG_SECURE). */
export function isAllBlack(img: Rgba, threshold = 10): boolean {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) if (d[i]! >= threshold || d[i + 1]! >= threshold || d[i + 2]! >= threshold) return false;
  return true;
}

/** Area-average (box) downscale so the long edge is at most `maxEdge`. Never enlarges. */
export function downscale(img: Rgba, maxEdge: number): Rgba {
  const { data: src, width: w, height: h } = img;
  const scale = Math.max(w, h) / maxEdge;
  if (scale <= 1) return img;
  const tw = Math.max(1, Math.round(w / scale));
  const th = Math.max(1, Math.round(h / scale));
  // Integer source ranges per target column/row; every source pixel lands in exactly one box.
  const x0 = new Uint32Array(tw + 1);
  for (let x = 0; x <= tw; x++) x0[x] = Math.min(w, Math.floor((x * w) / tw));
  const out = new Uint8Array(tw * th * 4);
  const acc = new Uint32Array(tw * 3);
  for (let ty = 0; ty < th; ty++) {
    const sy0 = Math.floor((ty * h) / th);
    const sy1 = Math.max(sy0 + 1, Math.floor(((ty + 1) * h) / th));
    acc.fill(0);
    for (let sy = sy0; sy < sy1; sy++) {
      const row = sy * w * 4;
      for (let tx = 0; tx < tw; tx++) {
        let r = 0, g = 0, b = 0;
        const end = row + x0[tx + 1]! * 4;
        for (let i = row + x0[tx]! * 4; i < end; i += 4) {
          r += src[i]!;
          g += src[i + 1]!;
          b += src[i + 2]!;
        }
        const a = tx * 3;
        acc[a] = acc[a]! + r;
        acc[a + 1] = acc[a + 1]! + g;
        acc[a + 2] = acc[a + 2]! + b;
      }
    }
    const rows = sy1 - sy0;
    for (let tx = 0; tx < tw; tx++) {
      const n = (x0[tx + 1]! - x0[tx]!) * rows || 1;
      const o = (ty * tw + tx) * 4;
      out[o] = (acc[tx * 3]! + (n >> 1)) / n;
      out[o + 1] = (acc[tx * 3 + 1]! + (n >> 1)) / n;
      out[o + 2] = (acc[tx * 3 + 2]! + (n >> 1)) / n;
      out[o + 3] = 255;
    }
  }
  return { data: out, width: tw, height: th };
}
