/**
 * NextX Engine · static batching. Scenery and buildings are made of many small meshes; merging
 * the ones that never move into one mesh per material (and shadow setting) cuts the draw calls
 * from hundreds to tens, which is what lets phones afford shadows and a sharp picture.
 *
 * Meshes marked `userData.dynamic` (and everything under them) are left alone, as are instanced
 * meshes, lines and points. A material shared by merged meshes stays shared, so changing its
 * colour or glow later still works.
 *
 * With `palette`, plain painted parts (a standard material with no textures, glow or
 * transparency) go further: their colour, roughness and metalness are written into the vertices
 * and they all draw with one shared material, so a forklift of fifteen paints is one draw call.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const KEEP = ["position", "normal", "uv"] as const;

let palette: THREE.MeshStandardMaterial | null = null;

/** The one material every palette-merged mesh draws with (colour, roughness and metalness come from the vertices). */
export function paletteMaterial() {
  if (palette) return palette;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 rm;\nvarying vec2 vRM;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRM = rm;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vRM;")
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = vRM.x;")
      .replace("#include <metalnessmap_fragment>", "float metalnessFactor = vRM.y;");
  };
  m.customProgramCacheKey = () => "nextx-palette";
  return (palette = m);
}

/** A plain painted surface: a standard (not physical) material with nothing but colour, roughness and metalness. */
function plain(m: THREE.Material): m is THREE.MeshStandardMaterial {
  const s = m as THREE.MeshStandardMaterial;
  return (
    s.isMeshStandardMaterial === true &&
    !(m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial &&
    !m.userData.keep &&
    !m.transparent &&
    m.opacity === 1 &&
    m.alphaTest === 0 &&
    m.side === THREE.FrontSide &&
    !m.vertexColors &&
    !s.map &&
    !s.normalMap &&
    !s.roughnessMap &&
    !s.metalnessMap &&
    !s.aoMap &&
    !s.emissiveMap &&
    !s.alphaMap &&
    !s.bumpMap &&
    !s.lightMap &&
    !s.envMap &&
    !s.displacementMap &&
    !s.flatShading &&
    s.envMapIntensity === 1 &&
    s.emissive.r + s.emissive.g + s.emissive.b === 0
  );
}

export interface MergeOptions {
  /** Fold plain painted parts into one palette mesh (see the top of this file). */
  palette?: boolean;
}

/** Merge the static meshes under `root` in place. Returns how many meshes were folded in. */
export function mergeStatic(root: THREE.Object3D, opts: MergeOptions = {}): number {
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
      const n = g.attributes.position.count;
      if (!copy.getAttribute("uv")) copy.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
      if (g.index) copy.setIndex(g.index.clone());
      copy.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, m.matrixWorld));
      let mat = m.material as THREE.Material;
      if (opts.palette && plain(mat)) {
        // Paint the vertices: colour (linear, as the material holds it), roughness and metalness.
        const c = new Float32Array(n * 3);
        const rm = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) {
          c[i * 3] = mat.color.r;
          c[i * 3 + 1] = mat.color.g;
          c[i * 3 + 2] = mat.color.b;
          rm[i * 2] = mat.roughness;
          rm[i * 2 + 1] = mat.metalness;
        }
        copy.setAttribute("color", new THREE.BufferAttribute(c, 3));
        copy.setAttribute("rm", new THREE.BufferAttribute(rm, 2));
        mat = paletteMaterial();
      }
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
