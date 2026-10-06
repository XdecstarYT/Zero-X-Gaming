import { describe, expect, it } from "vitest";
import { RoadGraph, edgeLength, halfWidth } from "./roads";

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

  it("a road crossing or joining right beside a junction uses that junction instead of making a second one", () => {
    const g = new RoadGraph();
    g.addPath(line(0, 100, 300, 100), "avenue");
    g.addPath(line(100, 0, 100, 200), "street");
    const x = g.nearestNode({ x: 100, z: 100 }, 1)!;
    // A street across the avenue 9 m from the junction, one at a slant, and a T dropped 7 m away.
    g.addPath(line(109, 0, 109, 200), "street");
    g.addPath(line(60, 30, 125, 170), "street");
    g.addPath(line(93, 180, 93, 102), "street");
    expect(g.nearestNode({ x: 109, z: 100 }, 4)).toBeNull();
    expect(g.degree(x.id)).toBeGreaterThan(4);
    // No two junctions are joined by a stub too short for both mouths.
    for (const e of g.edges.values()) {
      if (g.degree(e.a) < 3 || g.degree(e.b) < 3) continue;
      expect(edgeLength(e), `${e.name}`).toBeGreaterThan(halfWidth(e) * 2 + 8);
    }
    // Far enough away, it's a junction of its own.
    g.addPath(line(200, 0, 200, 200), "street");
    expect(g.degree(g.nearestNode({ x: 200, z: 100 }, 1)!.id)).toBe(4);
  });

  it("junctions crammed together in older saves fold into one; roundabout rings are left alone", () => {
    const g = new RoadGraph();
    g.addPath(line(0, 100, 300, 100), "avenue");
    g.addPath(line(100, 0, 100, 200), "street");
    // A second crossing 10 m along, laid the old way (no snapping).
    const av = g.nearestEdge({ x: 110, z: 100 }, 1)!;
    const { node } = g.splitEdge(av.edge.id, av.s);
    const top = g.addNode(110, 0);
    const bot = g.addNode(110, 200);
    g.addEdge(top.id, node.id, [110, 0, 110, 50, 110, 96, 110, 100], "street", "Old Street");
    g.addEdge(node.id, bot.id, [110, 100, 110, 150, 110, 200], "street", "Old Street");
    const before = g.edges.size;
    const r = g.collapseStubs();
    expect(r.removed).toHaveLength(1);
    expect(g.edges.size).toBe(before - 1);
    const hub = [...g.nodes.values()].find((n) => g.degree(n.id) === 6)!;
    expect(hub).toBeTruthy();
    // Every edge still starts and ends exactly on its nodes, and the moved ends lost their kinks.
    for (const e of g.edges.values()) {
      const a = g.nodes.get(e.a)!;
      const b = g.nodes.get(e.b)!;
      expect([e.pts[0], e.pts[1]]).toEqual([a.x, a.z]);
      expect([e.pts[e.pts.length - 2], e.pts[e.pts.length - 1]]).toEqual([b.x, b.z]);
      if (r.moved.includes(e.id)) for (let i = 2; i < e.pts.length - 2; i += 2) expect(Math.hypot(e.pts[i] - hub.x, e.pts[i + 1] - hub.z)).toBeGreaterThanOrEqual(12);
    }
    expect(g.collapseStubs().removed).toEqual([]);

    // A small one-way ring with roads at every node keeps its short pieces.
    const ring = new RoadGraph();
    const ns = [0, 1, 2, 3].map((k) => ring.addNode(Math.cos((k * Math.PI) / 2) * 14, Math.sin((k * Math.PI) / 2) * 14));
    for (let k = 0; k < 4; k++) {
      const a = ns[k];
      const b = ns[(k + 1) % 4];
      ring.addEdge(a.id, b.id, [a.x, a.z, b.x, b.z], "street", "Ring Circle", [1, 0]);
      const out = ring.addNode(a.x * 6, a.z * 6);
      ring.addEdge(a.id, out.id, [a.x, a.z, out.x, out.z], "street", "Arm");
    }
    expect(ring.collapseStubs().removed).toEqual([]);
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
