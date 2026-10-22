import { describe, expect, it } from "vitest";
import pngjs from "pngjs";
import { decodePng, downscale, encodeJpeg, isAllBlack } from "../src/image.js";

const solid = (w: number, h: number, rgb: [number, number, number]) => {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set([...rgb, 255], i);
  return { data, width: w, height: h };
};

describe("image helpers", () => {
  it("downscales to the max long edge, preserving aspect and colour", () => {
    const out = downscale(solid(1080, 2400, [200, 100, 50]), 1280);
    expect([out.width, out.height]).toEqual([576, 1280]);
    expect(Array.from(out.data.subarray(0, 4))).toEqual([200, 100, 50, 255]);
  });
  it("never enlarges", () => {
    const img = solid(100, 50, [1, 2, 3]);
    expect(downscale(img, 1280)).toBe(img);
  });
  it("averages 2x2 boxes", () => {
    const img = { data: new Uint8Array([0, 0, 0, 255, 100, 100, 100, 255, 100, 100, 100, 255, 200, 200, 200, 255]), width: 2, height: 2 };
    expect(Array.from(downscale(img, 1).data)).toEqual([100, 100, 100, 255]);
  });
  it("detects black frames and round-trips PNG -> JPEG", () => {
    expect(isAllBlack(solid(4, 4, [9, 9, 9]))).toBe(true);
    expect(isAllBlack(solid(4, 4, [0, 0, 10]))).toBe(false);
    const png = new pngjs.PNG({ width: 8, height: 8 });
    png.data.fill(255);
    const img = decodePng(pngjs.PNG.sync.write(png));
    expect([img.width, img.height]).toEqual([8, 8]);
    const jpg = encodeJpeg(img, 80);
    expect(jpg.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });
});
