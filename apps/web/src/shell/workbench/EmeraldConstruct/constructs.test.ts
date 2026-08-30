import { describe, expect, test } from "bun:test";
import {
  CONSTRUCTS,
  DETAIL_MAX,
  DETAIL_MIN,
  detailToCount,
  edgesFor,
  facetsFor,
  isConstructId,
  localProgress,
  nextConstruct,
  sampleConstruct,
} from "./constructs";

describe("EmeraldConstruct geometry", () => {
  test("cycles constructs in a stable order", () => {
    expect(CONSTRUCTS.map(entry => entry.id)).toEqual([
      "bird",
      "stella",
      "octagram",
    ]);
    expect(nextConstruct("bird")).toBe("stella");
    expect(nextConstruct("octagram")).toBe("bird");
    expect(isConstructId("bird")).toBe(true);
    expect(isConstructId("lattice")).toBe(false);
    expect(isConstructId("blob")).toBe(false);
  });

  test("each construct has outline, then wire, then complete edges", () => {
    for (const { id } of CONSTRUCTS) {
      const layers = edgesFor(id).map(edge => edge.layer);
      expect(layers.includes("outline")).toBe(true);
      expect(layers.includes("wire")).toBe(true);
      expect(layers.includes("complete")).toBe(true);
      expect(layers.indexOf("outline")).toBeLessThan(layers.indexOf("wire"));
      expect(layers.lastIndexOf("wire")).toBeLessThan(layers.indexOf("complete"));
    }
  });

  test("samples walk outline before wire before complete", () => {
    const samples = sampleConstruct("bird", 60);
    const firstWire = samples.findIndex(sample => sample.layer === "wire");
    const firstComplete = samples.findIndex(sample => sample.layer === "complete");
    const lastOutline = samples.reduce(
      (last, sample, index) => (sample.layer === "outline" ? index : last),
      -1,
    );

    expect(samples[0]?.layer).toBe("outline");
    expect(firstWire).toBeGreaterThan(lastOutline);
    expect(firstComplete).toBeGreaterThan(firstWire);
    expect(samples.every((sample, index) => sample.order === index)).toBe(true);
  });

  test("detail maps to a bounded sample budget and denser sampling", () => {
    expect(detailToCount(0)).toBe(DETAIL_MIN);
    expect(detailToCount(100)).toBe(DETAIL_MAX);

    const sparse = sampleConstruct("bird", 8);
    const dense = sampleConstruct("bird", 92);
    expect(dense.length).toBeGreaterThan(sparse.length);
    expect(sparse.length).toBeGreaterThanOrEqual(DETAIL_MIN / 2);
  });

  test("progress launches early samples first and arrives fully at 1", () => {
    const count = 12;
    const speed = 56;
    expect(localProgress(0, 0, count, speed)).toBe(0);
    expect(localProgress(0, count - 1, count, speed)).toBe(0);
    expect(localProgress(1, 0, count, speed)).toBe(1);
    expect(localProgress(1, count - 1, count, speed)).toBe(1);

    const midEarly = localProgress(0.45, 0, count, speed);
    const midLate = localProgress(0.45, count - 1, count, speed);
    expect(midEarly).toBeGreaterThan(midLate);
  });

  test("lowering progress reverses construction order", () => {
    const count = 10;
    const building = localProgress(0.85, 6, count, 50);
    const dissolving = localProgress(0.4, 6, count, 50);
    expect(building).toBeGreaterThan(dissolving);
    expect(localProgress(0.2, 8, count, 50)).toBe(0);
  });

  test("bird mesh has faceted shade variation", () => {
    const facets = facetsFor("bird");
    const shades = facets.map(facet => facet.shade);
    expect(facets.length).toBeGreaterThan(12);
    expect(Math.min(...shades)).toBeLessThan(0.35);
    expect(Math.max(...shades)).toBeGreaterThan(0.8);
    expect(facetsFor("stella")).toEqual([]);
  });

  test("bird silhouette reads as a hovering profile", () => {
    const points = facetsFor("bird").flatMap(facet => [facet.a, facet.b, facet.c]);
    const right = points.reduce((best, point) => (point.x > best.x ? point : best));
    const left = points.reduce((best, point) => (point.x < best.x ? point : best));
    const top = points.reduce((best, point) => (point.y < best.y ? point : best));
    expect(right.x).toBeGreaterThan(1.2);
    expect(right.y).toBeLessThan(0);
    expect(left.x).toBeLessThan(-1);
    expect(left.y).toBeGreaterThan(right.y);
    expect(top.y).toBeLessThan(-0.85);
    expect(top.x).toBeLessThan(0.2);
  });
});
