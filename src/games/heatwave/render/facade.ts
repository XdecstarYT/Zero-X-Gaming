import * as THREE from "three";

/**
 * The building facade: one physically lit material that draws every wall in the city procedurally,
 * per pixel, from a few numbers per vertex. Glass curtain walls with mullions and spandrels;
 * concrete grids; Victorian sandstone with arched windows and cornices; red brick in running bond;
 * pastel render with art-deco banding; weatherboard; corrugated iron; bluestone. Shopfronts at
 * street level, and behind every window a room (interior mapping): floor, ceiling, walls and a
 * back wall at the right depth for where you stand, with blinds, and the lights on at night in
 * some of them. Far off, the pattern melts to its average so it never shimmers.
 *
 * Vertex inputs: `color` (the wall colour), `aFac` (type, storey height, ground-floor height,
 * seed) and `aAcc` (trim colour, shopfront flag).
 */

export const FACADE_UNIFORMS = {
  uNight: { value: 0 },
  uDay: { value: 1 },
  uTime: { value: 0 },
  uWet: { value: 0 },
};

const VERT_PARS = `
attribute vec4 aFac;
attribute vec4 aAcc;
varying vec3 vWP;
varying vec3 vWN;
varying vec4 vFac;
varying vec4 vAcc;
`;

const VERT_MAIN = `
vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWN = normalize(mat3(modelMatrix) * objectNormal);
vFac = aFac;
vAcc = aAcc;
`;

const FRAG_PARS = `
uniform float uNight;
uniform float uDay;
uniform float uTime;
uniform float uWet;
varying vec3 vWP;
varying vec3 vWN;
varying vec4 vFac;
varying vec4 vAcc;

vec3 fAlb; float fRough; float fMetal; vec3 fEmit; vec3 fBumpW;

float fh1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fh2(vec2 p) { return fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453); }
float fnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fh1(i), fh1(i + vec2(1.0, 0.0)), f.x), mix(fh1(i + vec2(0.0, 1.0)), fh1(i + vec2(1.0, 1.0)), f.x), f.y);
}

/* A room behind a window: cast the view ray into a box (bay wide, storey high, some way deep). */
vec3 fRoom(vec2 c, float bw, float fh, vec3 V, vec3 n, vec3 t, float r, out float lightK) {
  vec3 d = vec3(dot(V, t), V.y, dot(V, -n));
  d.z = max(d.z, 0.02);
  if (abs(d.x) < 1e-4) d.x = 1e-4;
  if (abs(d.y) < 1e-4) d.y = 1e-4;
  vec3 p = vec3(c.x * bw, c.y * fh, 0.0);
  float D = bw * 1.4 + 2.5;
  float tx = ((d.x > 0.0 ? bw : 0.0) - p.x) / d.x;
  float ty = ((d.y > 0.0 ? fh : 0.0) - p.y) / d.y;
  float tz = D / d.z;
  float tm = min(min(tx, ty), tz);
  vec3 h = p + d * tm;
  vec3 wall = mix(vec3(0.82, 0.78, 0.7), vec3(0.62 + r * 0.3, 0.68, 0.74 - r * 0.2), fract(r * 7.3));
  vec3 col;
  if (tm == tz) {
    col = wall;
    // A desk, a couch, a bookshelf: a dark band low on the back wall, a picture above.
    float u = h.x / bw;
    if (h.y < fh * 0.32 && abs(u - 0.5 + (r - 0.5) * 0.4) < 0.28) col *= 0.35;
    if (h.y > fh * 0.45 && h.y < fh * 0.7 && abs(u - 0.3 - r * 0.4) < 0.08) col = mix(col, vec3(0.7, 0.3 + r * 0.3, 0.2), 0.7);
  } else if (tm == ty) {
    col = d.y > 0.0 ? vec3(0.9, 0.9, 0.88) : mix(vec3(0.42, 0.3, 0.2), vec3(0.5, 0.52, 0.55), step(0.5, fract(r * 13.1)));
  } else {
    col = wall * 0.82;
  }
  // Further in is darker; the ceiling light pools under itself.
  float depth = h.z / D;
  lightK = 1.0 - depth * 0.55;
  if (tm == ty && d.y > 0.0) lightK += 0.6 * (1.0 - length(vec2(h.x / bw - 0.5, h.z / D - 0.5)) * 1.6);
  return col;
}

void fFacade(vec3 base) {
  vec3 n = normalize(vWN);
  fAlb = base; fRough = 0.86; fMetal = 0.0; fEmit = vec3(0.0); fBumpW = vec3(0.0);
  // Roofs and floors use their own materials; only vertical walls get windows.
  if (abs(n.y) > 0.5) return;
  vec3 t = vec3(-n.z, 0.0, n.x);
  float u = dot(vWP, t);
  float y = vWP.y;
  int type = int(vFac.x + 0.5);
  float floorH = vFac.y;
  float gf = vFac.z;
  float seed = vFac.w;
  vec3 acc = vAcc.rgb;
  bool shop = vAcc.w > 0.5;
  vec3 V = normalize(vWP - cameraPosition);
  float fres = pow(1.0 - clamp(dot(-V, n), 0.0, 1.0), 5.0);

  // Each material: bay width, window width and height (fractions), sill height.
  float bay = 2.6; vec2 win = vec2(0.42, 0.55); float sill = 0.3;
  if (type == 0) { bay = 1.6; win = vec2(0.96, 0.82); sill = 0.08; }
  else if (type == 1) { bay = 2.4; win = vec2(0.72, 0.56); sill = 0.3; }
  else if (type == 2) { bay = 3.2; win = vec2(0.4, 0.58); sill = 0.24; }
  else if (type == 3) { bay = 2.8; win = vec2(0.4, 0.52); sill = 0.28; }
  else if (type == 4) { bay = 3.0; win = vec2(0.5, 0.5); sill = 0.3; }
  else if (type == 5) { bay = 3.4; win = vec2(0.34, 0.5); sill = 0.32; }
  else if (type == 6) { bay = 6.0; win = vec2(0.6, 0.18); sill = 0.66; }
  else if (type == 7) { bay = 3.4; win = vec2(0.3, 0.4); sill = 0.36; }

  bool ground = y < gf;
  float fy = ground ? y : y - gf;
  float fhh = ground ? max(gf, 0.1) : floorH;
  float bw = ground && shop ? 5.2 : bay;
  vec2 cell = vec2(floor(u / bw), ground ? -1.0 : floor(fy / fhh));
  vec2 c = vec2(fract(u / bw), fract(fy / fhh));
  float r = fh1(cell + seed * 13.7);

  // How much wall one pixel covers (fine patterns fade out before they can shimmer).
  float fwp = max(fwidth(u), fwidth(y));
  // The wall itself: its texture and relief.
  vec3 wallc = base;
  float h0 = 0.0;
  float rough = 0.86;
  if (type == 3 || type == 7) {
    // Brick (running bond) or bluestone blocks.
    vec2 bs = type == 3 ? vec2(0.23, 0.076) : vec2(0.62, 0.3);
    float row = floor(y / bs.y);
    float bx = u / bs.x + (mod(row, 2.0) * 0.5);
    vec2 bc = vec2(floor(bx), row);
    vec2 bf = vec2(fract(bx), fract(y / bs.y));
    float mortar = (1.0 - smoothstep(0.0, 0.06, bf.x) * smoothstep(1.0, 0.94, bf.x) * smoothstep(0.0, 0.1, bf.y) * smoothstep(1.0, 0.9, bf.y));
    float fineK = 1.0 - smoothstep(bs.y * 0.2, bs.y * 0.8, fwp);
    mortar *= fineK;
    float v = mix(0.5, fh2(bc + seed), fineK);
    wallc = base * (0.82 + v * 0.3);
    if (type == 3 && v > 0.93) wallc *= 0.7;
    wallc = mix(wallc, type == 3 ? vec3(0.72, 0.68, 0.6) : base * 0.6, mortar * 0.85);
    h0 = -mortar * 0.6;
    rough = 0.92;
  } else if (type == 2) {
    // Sandstone ashlar with a cornice at every floor.
    float row = floor(y / 0.45);
    float bx = u / 0.9 + mod(row, 2.0) * 0.5;
    vec2 bf = vec2(fract(bx), fract(y / 0.45));
    float joint = 1.0 - smoothstep(0.0, 0.025, bf.x) * smoothstep(1.0, 0.975, bf.x) * smoothstep(0.0, 0.05, bf.y) * smoothstep(1.0, 0.95, bf.y);
    wallc = base * (0.9 + fh2(vec2(floor(bx), row) + seed) * 0.14);
    joint *= 1.0 - smoothstep(0.08, 0.3, fwp);
    wallc *= 1.0 - joint * 0.18;
    h0 = -joint * 0.3;
    float slab = ground ? 0.0 : smoothstep(0.06, 0.0, c.y) + smoothstep(0.92, 1.0, c.y) * 0.6;
    wallc = mix(wallc, base * 1.08, slab * 0.6);
    h0 += slab * 0.8;
  } else if (type == 4) {
    // Painted render: smooth, a little weathered, with deco lines round each floor.
    wallc = base * (0.94 + fnoise(vec2(u, y) * 0.7) * 0.08);
    float band = ground ? 0.0 : (smoothstep(0.035, 0.0, abs(c.y - 0.03)) + smoothstep(0.035, 0.0, abs(c.y - 0.1)));
    wallc *= 1.0 - band * 0.12;
    h0 = -band * 0.4;
  } else if (type == 5) {
    // Weatherboard: lapped boards, each casting a line of shadow on the one below.
    float b = mix(0.6, fract(y / 0.19), 1.0 - smoothstep(0.04, 0.14, fwp));
    wallc = base * (0.8 + 0.2 * smoothstep(0.0, 0.85, b));
    h0 = b * 0.6;
    rough = 0.75;
  } else if (type == 6) {
    // Corrugated iron, ribs running up.
    float k = sin(u / 0.076 * 3.14159) * (1.0 - smoothstep(0.02, 0.07, fwp));
    wallc = base * (0.86 + k * 0.08) * (0.9 + fnoise(vec2(u * 0.3, y * 0.2)) * 0.15);
    h0 = k * 0.5;
    rough = 0.48;
    fMetal = 0.5;
  } else if (type == 1) {
    // Concrete: board-marked panels, darker slab edges.
    wallc = base * (0.92 + fnoise(vec2(u, y) * 0.5) * 0.1);
    float slab = ground ? 0.0 : smoothstep(0.08, 0.0, c.y);
    wallc *= 1.0 - slab * 0.15;
  } else {
    // Glass towers: the spandrel at each slab, mullions in the trim colour.
    wallc = acc;
    rough = 0.4;
  }

  // Windows.
  float wx = abs(c.x - 0.5) * 2.0;
  float wy0 = sill;
  float wy1 = sill + win.y;
  float ww = win.x;
  float wy1g = wy1;
  if (ground) {
    if (shop) { ww = 0.86; wy0 = 0.04; wy1 = 0.74; }
    else if (type == 0 || type == 1) { ww = 0.9; wy0 = 0.0; wy1 = 0.8; }
    else { ww = 0.36; wy0 = 0.0; wy1 = 0.72; }
    wy1g = wy1;
  }
  bool inWin = wx < ww && c.y > wy0 && c.y < wy1 && floorH < 50.0;
  // Arched heads on the Victorian stone.
  if (type == 2 && !ground && inWin) {
    float ar = ww * 0.5 * bw / fhh;
    float top = wy1 - ar;
    if (c.y > top) inWin = length(vec2((c.x - 0.5) * bw / fhh, c.y - top)) < ar;
  }
  // The frame round each window.
  float fx = smoothstep(ww, ww - 0.04, wx) * smoothstep(wy0 - 0.03, wy0, c.y) * smoothstep(wy1g + 0.03, wy1g, c.y);
  float frame = clamp(fx - (inWin ? 1.0 : 0.0) + (inWin && (wx > ww - 0.05 || c.y < wy0 + 0.04 || c.y > wy1g - 0.04) ? 1.0 : 0.0), 0.0, 1.0);
  // Glass curtain walls: thin mullions, a spandrel band at each slab.
  if (type == 0 && !ground) {
    inWin = c.y > 0.12 && c.y < 0.98 && wx < 0.95;
    frame = (wx > 0.95 ? 1.0 : 0.0) + (c.y < 0.12 ? 0.6 : 0.0);
  }

  // Where the pattern's finer than a pixel, melt it to its average.
  float fw = max(fwidth(u), fwidth(y));
  float lod = smoothstep(bw * 0.05, bw * 0.22, fw);

  vec3 alb = wallc;
  vec3 emit = vec3(0.0);
  if (inWin) {
    // Blinds part-way down some windows; a lit room or a dark one at night.
    float blind = fh2(cell + seed);
    float lit = step(fh1(cell * 1.7 + seed * 3.1 + 5.0), type == 0 ? 0.5 : type == 6 ? 0.3 : 0.42);
    float lk = 1.0;
#ifdef FACADE_ROOMS
    vec3 room = fRoom(vec2((c.x - (0.5 - ww * 0.5)) / ww, (c.y - wy0) / (wy1 - wy0)), bw * ww, fhh * (wy1 - wy0), V, n, t, r, lk);
#else
    vec3 room = mix(vec3(0.75, 0.72, 0.66), vec3(0.6, 0.66, 0.72), r) * (0.7 + 0.3 * c.y);
#endif
    // Blinds part-way down some upstairs windows (never the shopfronts and lobbies).
    float blindH = 1.0 - clamp((blind - 0.45) * 1.3, 0.0, 0.6);
    float wv = (c.y - wy0) / (wy1 - wy0);
    bool blinds = wv > blindH && !ground;
    vec3 warm = mix(vec3(1.0, 0.82, 0.58), vec3(0.85, 0.92, 1.0), step(0.75, fh2(cell + 2.0)));
    float dayIn = 0.1 * uDay;
    float nightIn = lit * 1.35;
    if (ground && shop) { dayIn = 0.26 * uDay; nightIn = 1.6; warm = vec3(1.0, 0.92, 0.8); }
    float L = mix(dayIn, nightIn, uNight) * lk;
    if (blinds) {
      vec3 bc = mix(vec3(0.86, 0.82, 0.74), vec3(0.6, 0.62, 0.66), step(0.6, blind));
      bc *= 0.85 + 0.15 * step(0.5, fract(wv * 30.0));
      // Seen through the glass, in the room's shade.
      alb = bc * 0.3;
      emit = bc * warm * L * 0.55 * uNight;
      rough = 0.22;
      fMetal = 0.2;
    } else {
      alb = vec3(0.02, 0.025, 0.03);
      emit = room * warm * L * (1.0 - fres * 0.85);
      rough = 0.06;
      fMetal = type == 0 ? 0.72 : 0.35;
    }
  } else if (frame > 0.0) {
    alb = mix(wallc, acc, clamp(frame, 0.0, 1.0));
    h0 += frame * 0.5;
  }
  // The sign band over a shopfront.
  if (ground && shop && c.y > 0.8) {
    alb = mix(acc, acc * 0.6, step(0.92, c.y));
    emit += acc * 0.35 * uNight;
  }

  // Average look for far away: wall and glass mixed, the lit-window glow spread out.
  float glassFrac = type == 0 ? 0.8 : ww * win.y;
  // Curtain walls keep their tinted glass (it's the sky they mirror that lights them).
  vec3 tint = wallc * 0.34 + vec3(0.015, 0.02, 0.03);
  vec3 avgAlb = type == 0 ? mix(acc, tint, 0.84) : mix(wallc, vec3(0.16, 0.19, 0.23), glassFrac * 0.85);
  vec3 avgEmit = vec3(1.0, 0.82, 0.58) * glassFrac * (type == 0 ? 0.5 : 0.42) * 0.3 * uNight + vec3(0.6, 0.66, 0.72) * glassFrac * (type == 0 ? 0.04 : 0.12) * uDay;
  // Further still, keep the storeys: a band of glass and a band of wall per floor, which only
  // melts away once a floor is a couple of pixels tall.
  if (!ground && type != 0) {
    float band = smoothstep(sill - 0.06, sill + 0.06, c.y) * (1.0 - smoothstep(sill + win.y - 0.06, sill + win.y + 0.06, c.y));
    float lod2 = smoothstep(fhh * 0.12, fhh * 0.45, fw);
    vec3 bandAlb = mix(wallc, vec3(0.13, 0.16, 0.2), band * min(1.0, ww * 1.5));
    avgAlb = mix(bandAlb, avgAlb, lod2);
    avgEmit *= mix(band * 1.6, 1.0, lod2);
  } else if (!ground) {
    // Glass towers: the darker spandrel line at each slab.
    float slabL = 1.0 - smoothstep(0.0, 0.14, c.y);
    float lod2 = smoothstep(fhh * 0.12, fhh * 0.45, fw);
    float mull = 1.0 - smoothstep(0.0, 0.1, abs(c.x - 0.5) * 2.0 - 0.88);
    vec3 farGlass = mix(tint, acc * 1.15, max(slabL, mull * 0.5));
    avgAlb = mix(farGlass, avgAlb, lod2);
  }
  fAlb = mix(alb, avgAlb, lod);
  fEmit = mix(emit, avgEmit, lod);
  fRough = mix(rough, type == 0 ? 0.16 : 0.5, lod);
  fMetal = mix(fMetal, type == 0 ? 0.8 : 0.15, lod);
  // Rain darkens and slicks the walls a little.
  fAlb *= 1.0 - uWet * 0.18;
  fRough = mix(fRough, fRough * 0.6, uWet);
  // Darker where the wall meets the footpath.
  fAlb *= 0.72 + 0.28 * smoothstep(0.0, 2.2, y);
  // Relief, as a nudge to the normal: the height's slope along the wall and up it, per metre.
  float du = max(length(dFdx(vWP)), 1e-4);
  float dv = max(length(dFdy(vWP)), 1e-4);
#ifdef FACADE_ROOMS
  fBumpW = (-t * (dFdx(h0) / du) - vec3(0.0, dFdy(h0) / dv, 0.0)) * 0.025 * (1.0 - lod);
#endif
}
`;

/** The far skyline hides the buildings the streamed chunks already draw (inside this radius). */
export const LOD_UNIFORMS = {
  uHideC: { value: new THREE.Vector2() },
  uHideR: { value: 0 },
};

const shared = new Map<string, THREE.MeshStandardMaterial>();

/**
 * The facade material (shared by every building). `rooms` turns on interior mapping and relief
 * (off on low-end phones); `lod` is the far-skyline variant, which reads a building centre per
 * vertex (`aCtr`) and drops the buildings near the camera.
 */
export function facadeMaterial(rooms = true, lod = false) {
  const key = `${rooms}|${lod}`;
  const hit = shared.get(key);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  if (rooms) m.defines = { FACADE_ROOMS: "" };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, FACADE_UNIFORMS);
    if (lod) Object.assign(sh.uniforms, LOD_UNIFORMS);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\n${VERT_PARS}${lod ? "attribute vec2 aCtr;\nuniform vec2 uHideC;\nuniform float uHideR;\n" : ""}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERT_MAIN}`);
    if (lod) sh.vertexShader = sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\nif (distance(aCtr, uHideC) < uHideR) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAG_PARS}`)
      .replace("#include <color_fragment>", "#include <color_fragment>\nfFacade(diffuseColor.rgb);\ndiffuseColor.rgb = fAlb;")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = fRough;")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = fMetal;")
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = normalize(normal + (viewMatrix * vec4(fBumpW, 0.0)).xyz);")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += fEmit;");
  };
  m.customProgramCacheKey = () => `hw-facade-2-${key}`;
  shared.set(key, m);
  return m;
}
