/**
 * NextX Engine · static batching. Scenery and buildings are made of many small meshes; merging
 * the ones that never move into one mesh per material (and shadow setting) cuts the draw calls
 * from hundreds to tens, which is what lets phones afford shadows and a sharp picture.
 *
 * Meshes marked `userData.dynamic` (and everything under them) are left alone, as are instanced
 * meshes, lines and points. A material shared by merged meshes stays shared, so changing its
 * colour or glow later still works.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const KEEP = ["position", "normal", "uv"] as const;

/** Merge the static meshes under `root` in place. Returns how many meshes were folded in. */
export function mergeStatic(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<
    string,
    { material: THREE.Material; geos: THREE.BufferGeometry[]; cast: boolean; receive: boolean; order: number }
  >();
  const fold: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D) => {
    if (o.userData.dynamic) return;
    const m = o as THREE.Mesh;
    if (
      m.isMesh &&
      !(m as THREE.InstancedMesh).isInstancedMesh &&
      !Array.isArray(m.material) &&
      m.visible &&
      m.geometry.attributes.position &&
      m.geometry.attributes.normal
    ) {
      const g = m.geometry;
      const copy = new THREE.BufferGeometry();
      for (const k of KEEP) {
        const a = g.getAttribute(k);
        if (a) copy.setAttribute(k, a.clone());
      }
      if (!copy.getAttribute("uv"))
        copy.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (g.index) copy.setIndex(g.index.clone());
      copy.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, m.matrixWorld));
      const mat = m.material as THREE.Material;
      // Indexed and unindexed geometry can't share a merge.
      const key = `${mat.uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${m.renderOrder}|${g.index ? 1 : 0}`;
      let b = buckets.get(key);
      if (!b)
        buckets.set(
          key,
          (b = { material: mat, geos: [], cast: m.castShadow, receive: m.receiveShadow, order: m.renderOrder }),
        );
      b.geos.push(copy);
      fold.push(m);
    }
    for (const c of o.children) visit(c);
  };
  for (const c of root.children) visit(c);
  if (fold.length < 2) return 0;
  for (const m of fold) {
    m.removeFromParent();
    if (m.userData.own) m.geometry.dispose();
  }
  // Groups left with nothing in them go too.
  const empty: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o !== root && o.type === "Group" && !o.userData.dynamic && o.children.length === 0) empty.push(o);
  });
  for (const o of empty) o.removeFromParent();
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    mesh.renderOrder = b.order;
    mesh.userData.own = true;
    mesh.userData.merged = true;
    root.add(mesh);
  }
  return fold.length;
}
