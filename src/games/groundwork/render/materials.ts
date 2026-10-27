import * as THREE from "three";
import { asphaltPBR, brickPBR, brickworkPBR, concretePBR, grassPBR, gravelPBR, metalPBR, mortarPBR, soilPBR, tilePBR, timberPBR, type PBR } from "./textures";

/**
 * Groundwork's materials. Every texture is laid on in the piece's own space, in metres (a box's
 * faces each take the two axes they span), so timber grain runs along every board, a brick
 * shows a different patch of clay from its neighbour, and nothing stretches however long a
 * footing is. Each piece's finish (a brick's colour, a door's paint) comes from its instance.
 */

const VERT_HEAD = /* glsl */ `#include <common>
varying vec3 vGP;
varying vec3 vGN;`;

const VERT_BODY = /* glsl */ `#include <begin_vertex>
vec3 gsz = vec3(1.0);
vec3 goff = vec3(0.0);
#ifdef USE_INSTANCING
gsz = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
goff = instanceMatrix[3].xyz;
#endif
vGP = transformed * gsz + vec3(goff.x * 1.713 + goff.y * 3.11, goff.y * 2.07 + goff.z * 0.53, goff.z * 2.371 + goff.x * 0.29);
vGN = objectNormal;`;

const FRAG_HEAD = /* glsl */ `#include <common>
varying vec3 vGP;
varying vec3 vGN;
uniform float uTexScale;
vec2 gwUV() {
  vec3 n = abs(vGN);
  vec2 uv = (n.x > n.y && n.x > n.z) ? vGP.zy : ((n.y > n.z) ? vGP.xz : vGP.xy);
  return uv / uTexScale;
}`;

const FRAG_MAP = /* glsl */ `vec2 gUV = gwUV();
#ifdef USE_MAP
  diffuseColor *= texture2D(map, gUV);
#endif`;

const FRAG_ROUGH = /* glsl */ `float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  roughnessFactor *= texture2D(roughnessMap, gUV).g;
#endif`;

const FRAG_NORMAL = /* glsl */ `#ifdef USE_NORMALMAP_TANGENTSPACE
  vec3 mapN = texture2D(normalMap, gUV).xyz * 2.0 - 1.0;
  mapN.xy *= normalScale;
  mat3 gwTbn = getTangentFrame(-vViewPosition, normal, gUV);
  normal = normalize(gwTbn * mapN);
#endif`;

export interface LocalOpts {
  scale: number;
  roughness?: number;
  metalness?: number;
  normalScale?: number;
  color?: THREE.ColorRepresentation;
  env?: number;
  /** Ignore the instance's colour (a frame, a handle, a sill). */
  fixed?: boolean;
  side?: THREE.Side;
  extra?: (sh: { fragmentShader: string }) => void;
}

/** A standard material with its textures in local metres (see above). */
export function localMaterial(pbr: PBR | null, o: LocalOpts, physical = false) {
  const p = {
    color: o.color ?? "#ffffff",
    roughness: o.roughness ?? 1,
    metalness: o.metalness ?? 0,
    envMapIntensity: o.env ?? 1,
    side: o.side ?? THREE.FrontSide,
    ...(pbr ? { map: pbr.map, normalMap: pbr.normal, roughnessMap: pbr.rough, normalScale: new THREE.Vector2(o.normalScale ?? 1, o.normalScale ?? 1) } : {}),
  };
  const m = physical ? new THREE.MeshPhysicalMaterial(p) : new THREE.MeshStandardMaterial(p);
  const scale = o.scale;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTexScale = { value: scale };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", VERT_HEAD).replace("#include <begin_vertex>", VERT_BODY);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", FRAG_HEAD)
      .replace("#include <map_fragment>", FRAG_MAP)
      .replace("#include <roughnessmap_fragment>", FRAG_ROUGH)
      .replace("#include <normal_fragment_maps>", FRAG_NORMAL);
    if (o.fixed) sh.fragmentShader = sh.fragmentShader.replace("#include <color_fragment>", "");
    o.extra?.(sh);
  };
  m.customProgramCacheKey = () => `gw-${scale}-${o.fixed ? 1 : 0}-${pbr ? 1 : 0}-${physical ? 1 : 0}-${o.extra ? 1 : 0}`;
  return m;
}

/**
 * The ground: grass (or soil, gravel, asphalt) in world metres, with slow variation over tens
 * of metres so a lawn is never one green, and worn patches painted in by a mask.
 */
export function groundMaterial(pbr: PBR, scale: number, opts: { color?: string; worn?: { pbr: PBR; scale: number; mask: THREE.Texture; size: number } } = {}) {
  const m = new THREE.MeshStandardMaterial({ map: pbr.map, normalMap: pbr.normal, roughnessMap: pbr.rough, color: opts.color ?? "#ffffff", roughness: 1 });
  const w = opts.worn;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTexScale = { value: scale };
    if (w) {
      sh.uniforms.tWornMap = { value: w.pbr.map };
      sh.uniforms.tWornN = { value: w.pbr.normal };
      sh.uniforms.tMask = { value: w.mask };
      sh.uniforms.uWornScale = { value: w.scale };
      sh.uniforms.uMaskSize = { value: w.size };
    }
    sh.vertexShader = sh.vertexShader.replace("#include <common>", VERT_HEAD).replace("#include <begin_vertex>", VERT_BODY);
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `${FRAG_HEAD}
        ${w ? "uniform sampler2D tWornMap; uniform sampler2D tWornN; uniform sampler2D tMask; uniform float uWornScale; uniform float uMaskSize;" : ""}`,
      )
      .replace(
        "#include <map_fragment>",
        `vec2 gUV = vGP.xz / uTexScale;
        vec4 gcol = texture2D(map, gUV) * 0.6 + texture2D(map, gUV * 0.27 + 0.13) * 0.4;
        float wv = texture2D(map, vGP.xz / 61.0).g;
        gcol.rgb *= 0.86 + wv * 0.3;
        ${w ? "float wear = texture2D(tMask, vGP.xz / uMaskSize + 0.5).r; vec4 wcol = texture2D(tWornMap, vGP.xz / uWornScale); gcol = mix(gcol, wcol, wear);" : ""}
        diffuseColor *= gcol;`,
      )
      .replace("#include <roughnessmap_fragment>", FRAG_ROUGH)
      .replace(
        "#include <normal_fragment_maps>",
        `#ifdef USE_NORMALMAP_TANGENTSPACE
          vec3 mapN = texture2D(normalMap, gUV).xyz * 2.0 - 1.0;
          ${w ? "mapN = mix(mapN, texture2D(tWornN, vGP.xz / uWornScale).xyz * 2.0 - 1.0, wear);" : ""}
          mapN.xy *= normalScale;
          mat3 gwTbn = getTangentFrame(-vViewPosition, normal, gUV);
          normal = normalize(gwTbn * mapN);
        #endif`,
      );
  };
  m.customProgramCacheKey = () => `gw-ground-${scale}-${w ? 1 : 0}`;
  return m;
}

let cache: ReturnType<typeof build> | null = null;

function build() {
  const brick = brickPBR();
  const mortar = mortarPBR();
  const concrete = concretePBR();
  const timber = timberPBR();
  const tile = tilePBR();
  const metal = metalPBR();
  return {
    pbr: { brick, mortar, concrete, timber, tile, metal, grass: grassPBR(), soil: soilPBR(), gravel: gravelPBR(), asphalt: asphaltPBR(), brickwork: brickworkPBR(["#9a4b37", "#8a4635", "#a35a3f", "#7f4232"]), brickworkCream: brickworkPBR(["#c9a571", "#b8935e", "#d2b07c"]) },
    brick: localMaterial(brick, { scale: 0.55, normalScale: 1.1, env: 0.6 }),
    mortar: localMaterial(mortar, { scale: 0.28, normalScale: 0.8, env: 0.5 }),
    concrete: localMaterial(concrete, { scale: 1.3, normalScale: 0.9, env: 0.35, color: "#f4efe6" }),
    concreteFixed: localMaterial(concrete, { scale: 1.0, normalScale: 0.8, env: 0.35, fixed: true, color: "#cfc9bd" }),
    timber: localMaterial(timber, { scale: 1.1, normalScale: 0.8, env: 0.5 }),
    painted: localMaterial(null, { scale: 1, roughness: 0.42, env: 0.9 }),
    tile: localMaterial(tile, { scale: 0.45, normalScale: 0.8, env: 0.8 }),
    metal: localMaterial(metal, { scale: 1.2, normalScale: 0.6, metalness: 0.85, roughness: 0.9, env: 1.2 }),
    steel: localMaterial(metal, { scale: 1.2, normalScale: 0.5, metalness: 0.35, roughness: 1.4, env: 0.8 }),
    frame: localMaterial(null, { scale: 1, roughness: 0.42, env: 1 }),
    frameWhite: localMaterial(null, { scale: 1, roughness: 0.45, env: 1, fixed: true, color: "#efeee9" }),
    handle: localMaterial(null, { scale: 1, roughness: 0.25, metalness: 1, env: 1.4, fixed: true, color: "#c8a560" }),
    rubber: localMaterial(null, { scale: 1, roughness: 0.8, fixed: true, color: "#1c1d1f" }),
    glass: localMaterial(null, { scale: 1, roughness: 0.03, metalness: 0.1, env: 2.6, fixed: true, color: "#5f7880" }, true),
    glassBlock: localMaterial(null, { scale: 1, roughness: 0.15, env: 1.6 }, true),
  };
}

export type Mats = ReturnType<typeof build>;

/** The shared materials (made once: the textures take a moment to paint). */
export function materials(): Mats {
  if (!cache) {
    cache = build();
    for (const m of [cache.glass]) {
      m.transparent = true;
      m.opacity = 0.5;
      m.depthWrite = false;
    }
    cache.glassBlock.transparent = true;
    cache.glassBlock.opacity = 0.72;
  }
  return cache;
}
