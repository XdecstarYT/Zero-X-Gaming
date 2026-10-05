import { describe, expect, it } from "vitest";
import { RoadGraph, halfWidth } from "./roads";

const line = (ax: number, az: number, bx: number, bz: number) => [ax, az, bx, bz];

describe("road graph", () => {
  it("a crossing road splits both into a four-way junction", () => {
    const g = new RoadGraph();
    g.addPath(line(0, 100, 200, 100), "street");
    const r = g.addPath(line(100, 0, 100, 200), "avenue");
    expect(r.created).toHaveLength(2);
    expect(g.edges.size).toBe(4);
    const centre = g.nearestNode({ x: 100, z: 100 }, 1)!;
    expect(centre).toBeTruthy();
    expect(g.degree(centre.id)).toBe(4);
    // The split halves keep the first road's name.
    const names = new Set([...g.edges.values()].filter((e) => e.type === "street").map((e) => e.name));
    expect(names.size).toBe(1);
  });

  it("an end dropped on a road makes a T-junction", () => {
    const g = new RoadGraph();
    g.addPath(line(0, 0, 200, 0), "street");
    g.addPath(line(80, 60, 81, 2), "street");
    expect(g.edges.size).toBe(3);
    const t = g.nearestNode({ x: 81, z: 0 }, 3)!;
    expect(g.degree(t.id)).toBe(3);
  });

  it("removing a branch merges the road back into one edge", () => {
    const g = new RoadGraph();
    g.addPath(line(0, 0, 200, 0), "street");
    const { created } = g.addPath(line(80, 60, 80, 1), "street");
    expect(g.edges.size).toBe(3);
    g.removeEdge(created[0].id);
    expect(g.edges.size).toBe(1);
    expect(g.nodes.size).toBe(2);
  });

  it("a road crossing several others gets a junction at each, and stays connected to the gate", () => {
    const g = new RoadGraph();
    const gate = g.addNode(0, 50, true);
    g.addPath([gate.x, gate.z, 400, 50], "highway");
    for (const x of [100, 200, 300]) g.addPath(line(x, 0, x, 300), "street");
    g.addPath(line(50, 250, 350, 250), "street");
    // Every street meets the highway and the top road.
    expect([...g.nodes.values()].filter((n) => g.degree(n.id) >= 3).length).toBe(6);
    expect(g.connectedNodes().size).toBe(g.nodes.size);
  });

  it("lane layout and one-way cycle, and widths follow the type", () => {
    const g = new RoadGraph();
    const [e] = g.addPath(line(0, 0, 100, 0), "avenue").created;
    expect([e.lanesF, e.lanesB]).toEqual([2, 2]);
    g.cycleLanes(e.id);
    expect(e.lanesF + e.lanesB).toBe(4);
    expect([e.lanesF, e.lanesB]).not.toEqual([2, 2]);
    g.cycleOneWay(e.id);
    expect(e.lanesB).toBe(0);
    g.cycleOneWay(e.id);
    expect(e.lanesF).toBe(0);
    expect(halfWidth({ type: "street", lanesF: 1, lanesB: 1 })).toBeCloseTo(3.5 + 2.6);
    expect(halfWidth({ type: "boulevard", lanesF: 2, lanesB: 2 })).toBeGreaterThan(halfWidth({ type: "avenue", lanesF: 2, lanesB: 2 }));
  });

  it("round-trips through JSON", () => {
    const g = new RoadGraph();
    g.addPath(line(0, 0, 100, 100), "street");
    const h = RoadGraph.from(JSON.parse(JSON.stringify(g.toJSON())));
    expect(h.edges.size).toBe(1);
    const [e] = h.addPath(line(0, 100, 100, 0), "street").created;
    expect(e).toBeTruthy();
    expect(h.edges.size).toBe(4);
  });
});
