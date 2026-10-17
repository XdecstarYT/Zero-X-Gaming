import * as THREE from "three";
import { SkyEnvironment, skyFor, type SkyLight } from "@/nextx/look";
import { light } from "../traffic";
import { player, playerPos, type State } from "../state";
import { BOUNDS, WATER_Y } from "../world";
import { Actors } from "./actors";
import { CamRig } from "./camera";
import { CityView, glowTex, type Quality } from "./city";
import { FACADE_UNIFORMS } from "./facade";
import { Fx } from "./fx";
import { Post } from "./post";
import { makeMelbSky, type SkyMesh } from "./sky";
import { puff, rippleNormal, shoreMask } from "./textures";

/**
 * Heatwave in 3D: the renderer, Melbourne, people, traffic and trams, effects, a scattering sky
 * with lit clouds that runs from dawn to dusk with the game clock (storms darken it, rain wets the
 * roads), the bay and the Yarra, traffic lights that change, and the post chain: height fog lit by
 * the sun, light shafts, heat shimmer, ambient occlusion, bloom and a filmic grade.
 */

const SEA_VS = `
varying vec3 vWorld;
#include <fog_pars_vertex>
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const SEA_FS = `
uniform sampler2D uNormal; uniform sampler2D uShore; uniform vec4 uBounds;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSky; uniform vec3 uHorizon;
uniform float uTime; uniform float uNight; uniform float uStorm;
varying vec3 vWorld;
#include <fog_pars_fragment>
void main(){
  vec2 p = vWorld.xz;
  vec3 n1 = texture2D(uNormal, p * 0.045 + vec2(uTime * 0.012, uTime * 0.007)).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(uNormal, p * 0.11 - vec2(uTime * 0.017, -uTime * 0.01)).xyz * 2.0 - 1.0;
  vec3 n = normalize(vec3(n1.x + n2.x * 0.6, 3.2 - uStorm * 1.4, n1.y + n2.y * 0.6));
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0) * 0.85 + 0.06;
  vec2 suv = (p - uBounds.xy) / uBounds.zw;
  vec2 shore = texture2D(uShore, clamp(suv, 0.001, 0.999)).rg;
  float shallow = shore.r;
  vec3 deep = mix(vec3(0.015, 0.09, 0.13), vec3(0.03, 0.06, 0.08), uStorm);
  vec3 shal = mix(vec3(0.07, 0.36, 0.36), vec3(0.14, 0.24, 0.24), uStorm);
  vec3 col = mix(deep, shal, smoothstep(0.0, 1.0, shallow));
  vec3 refl = mix(uHorizon, uSky, clamp(v.y * 2.0, 0.0, 1.0));
  col = mix(col, refl, fres);
  vec3 h = normalize(normalize(uSunDir) + v);
  col += uSunColor * pow(max(dot(n, h), 0.0), 320.0) * 9.0 * (1.0 - uNight);
  // A wide glitter path under a low sun.
  col += uSunColor * pow(max(dot(n, h), 0.0), 40.0) * 0.35 * (1.0 - uNight);
  // Surf where it shoals onto the sand.
  // (Only on the bay's beaches, not along the river and the lakes.)
  // Surf only on the bay side of the Port Melbourne to St Kilda shore (not the river or the lake).
  float bay = -dot(p - vec2(-2280.0, 2940.0), vec2(0.5746, -0.8183));
  float edge = smoothstep(0.82, 0.97, shallow) * smoothstep(-120.0, -40.0, bay);
  float wave = 0.5 + 0.5 * sin(dot(p, vec2(0.13, 0.21)) - uTime * 1.6 + n1.x * 3.0);
  float foam = edge * smoothstep(0.35, 0.9, wave + n2.y * 0.6);
  col = mix(col, vec3(0.95, 0.97, 0.98) * (1.0 - uNight * 0.7), foam * 0.75);
  col *= 1.0 - uNight * 0.78;
  float a = mix(0.82, 0.96, 1.0 - shallow) ;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export interface Markers {
  goals: { x: number; z: number; r: number }[];
}

const MOON = new THREE.Color("#c4d2f2");
const RED = new THREE.Color("#ff2a1a");
const AMBER = new THREE.Color("#ffb21a");
const GREEN = new THREE.Color("#2aff7a");
const OFF = new THREE.Color("#181818");
const FILL = new THREE.Color();

export class HeatwaveView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig = new CamRig();
  readonly city: CityView;
  readonly actors: Actors;
  readonly fx: Fx;
  private sky: SkyMesh;
  private env: SkyEnvironment;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  /** After dark: a warm streetlight fill from over the camera's shoulder, so paintwork reads. */
  private fill = new THREE.DirectionalLight("#ffcf9a", 0);
  private sea: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private post: Post;
  private fogColor = new THREE.Color();
  private bulbs: THREE.InstancedMesh;
  private bulbList: { x: number; y: number; z: number; ry: number; node: import("../world").Node; ph: number }[] = [];
  private bulbT = 0;
  private skyL: SkyLight = skyFor(1);
  private sunDir = new THREE.Vector3();
  private t = 0;
  night = 0;
  scale = 1;
  /** Roads stay wet a while after the rain stops. */
  private wet = 0;
  /** A cinematic orbit (the NextX app's backdrop) instead of the third-person camera. */
  cinema: { x: number; z: number; dist: number; height: number; speed: number; a: number; ty?: number } | null = null;
  private w = 1;
  private h = 1;

  constructor(
    canvas: HTMLCanvasElement,
    s: State,
    readonly quality: Quality,
    opts: { defer?: boolean } = {},
  ) {
    const high = quality === "high";
    // Antialiasing happens in the post chain's multisampled target.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    // Stats cover the whole frame (the composer's passes would otherwise reset them).
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = quality !== "low";
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Low draws three's own fog; the others fog in the post chain (by height, lit by the sun).
    if (quality === "low") this.scene.fog = new THREE.Fog("#bcd7ef", 200, 480);
    this.scene.background = new THREE.Color("#bcd7ef");
    this.sky = makeMelbSky();
    this.sky.scale.setScalar(1800);
    this.scene.add(this.sky);
    this.env = new SkyEnvironment(this.renderer, this.sky, 64);
    this.hemi = new THREE.HemisphereLight("#dce9ff", "#8d8c78", 0.5);
    this.scene.add(this.hemi);
    this.scene.add(this.fill, this.fill.target);
    this.sun = new THREE.DirectionalLight("#fff1d8", 3);
    this.sun.castShadow = quality !== "low";
    const sm = high ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm, sm);
    const R = high ? 70 : 50;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -R;
    sc.right = sc.top = R;
    sc.near = 10;
    sc.far = 400;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target);
    // The sea.
    const B = BOUNDS;
    this.sea = new THREE.Mesh(
      new THREE.PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        vertexShader: SEA_VS,
        fragmentShader: SEA_FS,
        transparent: true,
        fog: true,
        depthWrite: false,
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          {
            uNormal: { value: rippleNormal() },
            uShore: { value: shoreMask(B.x0, B.z0, B.x1, B.z1, quality === "low" ? 384 : 512) },
            uBounds: { value: new THREE.Vector4(B.x0, B.z0, B.x1 - B.x0, B.z1 - B.z0) },
            uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.5) },
            uSunColor: { value: new THREE.Color("#fff3dc") },
            uSky: { value: new THREE.Color("#3f86d6") },
            uHorizon: { value: new THREE.Color("#bcd7ef") },
            uTime: { value: 0 },
            uNight: { value: 0 },
            uStorm: { value: 0 },
          },
        ]),
      }),
    );
    this.sea.position.y = WATER_Y;
    this.sea.renderOrder = 2;
    // It writes depth so the fog knows where the water is.
    this.sea.material.depthWrite = true;
    this.scene.add(this.sea);
    this.city = new CityView(s.city, quality, s);
    this.scene.add(this.city.root);
    const smoke = puff();
    this.actors = new Actors(this.scene, quality, smoke);
    this.fx = new Fx(this.scene, glowTex(), smoke, quality);
    // Traffic light bulbs (three per head), coloured each frame.
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), 900);
    this.bulbs.count = 0;
    this.bulbs.frustumCulled = false;
    this.scene.add(this.bulbs);
    this.post = new Post(this.renderer, quality);
    // Load the city round the player before the first frame (or leave it to `warm`).
    const pos = playerPos(s);
    if (!opts.defer) this.city.update(pos.x, pos.z, true);
  }

  /** Load the city round (x, z) a chunk a step, for a loading bar; yields how many are left. */
  *warm(x: number, z: number): Generator<number, void> {
    for (let need = this.city.update(x, z); need > 1; need = this.city.update(x, z)) yield need - 1;
  }

  /** Compile the scene's shaders before the first frame, off the main thread where the GPU allows. */
  compile() {
    return this.post.compile(this.scene, this.rig.camera);
  }

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    const cap = this.quality === "high" ? 2 : this.quality === "medium" ? 1.5 : 1.25;
    const pr = Math.min(dpr, cap) * this.scale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(Math.max(1, Math.round(w * pr)), Math.max(1, Math.round(h * pr)));
    this.rig.resize(w, h);
  }

  /** Adaptive resolution: step down when frames run slow. */
  setScale(k: number) {
    if (Math.abs(k - this.scale) < 0.01) return;
    this.scale = k;
    this.resize(this.w, this.h, window.devicePixelRatio || 1);
  }

  frame(s: State, dt: number, markers: Markers, now: number, aiming: boolean) {
    this.t += dt;
    const cam = this.rig.camera;
    if (this.cinema) {
      const c = this.cinema;
      c.a += dt * c.speed;
      cam.position.set(c.x + Math.cos(c.a) * c.dist, c.height, c.z + Math.sin(c.a) * c.dist);
      cam.lookAt(c.x, c.ty ?? 8, c.z);
    } else this.rig.update(s, dt, now, aiming);
    const pos = this.cinema ? { x: this.cinema.x, z: this.cinema.z } : playerPos(s);
    this.daylight(s, pos.x, pos.z);
    this.fill.intensity = this.night * 0.9;
    this.fill.position.set(cam.position.x, cam.position.y + 6, cam.position.z);
    this.fill.target.position.set(pos.x, 0, pos.z);
    this.city.update(cam.position.x, cam.position.z);
    this.city.setNight(this.night);
    this.city.setWet(Math.max(s.weather.rain, this.wet * 0.999));
    this.wet = Math.max(s.weather.rain, this.wet - dt * 0.004);
    this.city.tick(dt);
    FACADE_UNIFORMS.uTime.value = this.t;
    this.actors.sync(s, cam.position.x, cam.position.z, dt, this.night);
    this.fx.update(s, cam, dt, markers.goals);
    this.signals(s, cam.position.x, cam.position.z, dt);
    this.sky.position.copy(cam.position);
    this.sky.material.uniforms.uTime.value += dt;
    this.sea.position.x = Math.round(cam.position.x / 50) * 50;
    this.sea.position.z = Math.round(cam.position.z / 50) * 50;
    const u = this.sea.material.uniforms;
    u.uTime.value = this.t;
    this.renderer.info.reset();
    const storm = s.weather.rain;
    const h = s.clock / 60;
    const midday = Math.max(0, Math.sin((Math.PI * (h - 6)) / 12));
    this.post.render(this.scene, cam, {
      sunDir: this.sunDir,
      sunColor: this.sun.color,
      fogColor: this.fogColor,
      // Clear summer air: a city several kilometres across stays in view, softened by distance.
      density: 0.00055 + storm * 0.0045 + (s.weather.kind === "cloudy" ? 0.0005 : 0) + this.night * 0.0003,
      night: this.night,
      haze: this.quality === "low" ? 0 : (1 - storm) * (s.weather.kind === "clear" ? 1 : 0.3) * Math.max(0, midday - 0.4) * 1.6,
      time: this.t,
      exposure: this.renderer.toneMappingExposure,
    });
    void player;
  }

  /** The sun and sky for the clock (and the weather). */
  private daylight(s: State, px: number, pz: number) {
    const h = s.clock / 60;
    const el = Math.sin((Math.PI * (h - 6)) / 12);
    const storm = s.weather.rain;
    const cloudy = s.weather.kind === "cloudy" ? 0.5 : 0;
    const L = skyFor(el, this.skyL);
    if (storm > 0.01) {
      const g = new THREE.Color("#7d8696");
      L.zenith.lerp(g, 0.7 * storm);
      L.horizon.lerp(g, 0.6 * storm);
      L.sunI *= 1 - 0.6 * storm;
    }
    // Full day until the sun's low; dark by the end of civil twilight.
    const day = Math.min(1, Math.max(0, el * 2.6 + 0.32));
    this.night = 1 - day;
    const az = (Math.PI * (h - 6)) / 12;
    const sunUp = el > -0.05;
    // Southern hemisphere: up in the east, across the north (−z), down in the west.
    if (sunUp) this.sunDir.set(Math.cos(az) * 0.9, 0.25 + Math.max(0, el) * 0.9, -0.45).normalize();
    else this.sunDir.set(0.3, 0.8, -0.4).normalize();
    this.sun.position.set(px + this.sunDir.x * 200, this.sunDir.y * 200, pz + this.sunDir.z * 200);
    this.sun.target.position.set(px, 0, pz);
    this.sun.color.copy(L.sun);
    // After dark a cool moon and a bluish sky fill keep the streets readable.
    this.sun.intensity = sunUp ? L.sunI : 0.55;
    if (!sunUp) this.sun.color.set("#9fb4e8");
    this.hemi.intensity = Math.max(L.hemiI * 0.6, this.night * 0.5);
    this.hemi.color.copy(L.zenith).lerp(FILL.setScalar(1).lerp(MOON, this.night), 0.55 + this.night * 0.2);
    const su = this.sky.material.uniforms;
    su.uZenith.value.copy(L.zenith);
    su.uHorizon.value.copy(L.horizon);
    su.uSunDir.value.copy(sunUp ? this.sunDir : new THREE.Vector3(0, -1, 0));
    su.uSunColor.value.copy(L.sun).multiplyScalar(sunUp ? 1 : 0.1);
    su.uNight.value = this.night;
    su.uCloud.value = Math.max(storm, cloudy, 0.15);
    su.uRain.value = storm;
    su.uSunH.value = el;
    this.fogColor.copy(L.horizon).lerp(L.zenith, 0.12);
    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.color.copy(this.fogColor);
      fog.near = 200 - storm * 140;
    }
    (this.scene.background as THREE.Color).copy(this.fogColor);
    this.scene.environment = this.env.update(`${Math.round(el * 12)}|${Math.round(storm * 4)}`);
    // More sky reflection after dark, so paintwork still reads under the lamps.
    this.scene.environmentIntensity = 0.8 + this.night * 0.7;
    const w = this.sea.material.uniforms;
    w.uSunDir.value.copy(this.sunDir);
    w.uSunColor.value.copy(L.sun);
    w.uSky.value.copy(L.zenith);
    w.uHorizon.value.copy(L.horizon);
    w.uNight.value = this.night;
    w.uStorm.value = storm;
    this.post.bloomStrength = 0.14 + this.night * 0.5;
    this.renderer.toneMappingExposure = 1.05 + this.night * 0.25;
  }

  /** Traffic lights near the camera, lit red, amber or green. */
  private signals(s: State, cx: number, cz: number, dt: number) {
    this.bulbT -= dt;
    if (this.bulbT <= 0) {
      this.bulbT = 0.5;
      this.bulbList = this.city.signals.filter((h) => Math.abs(h.x - cx) < 180 && Math.abs(h.z - cz) < 180);
      const m4 = new THREE.Matrix4();
      const n = Math.min(300, this.bulbList.length);
      for (let i = 0; i < n; i++) {
        const h = this.bulbList[i];
        for (let k = 0; k < 3; k++) {
          m4.makeTranslation(h.x, h.y - k * 0.36, h.z);
          this.bulbs.setMatrixAt(i * 3 + k, m4);
        }
      }
      this.bulbs.count = n * 3;
      this.bulbs.instanceMatrix.needsUpdate = true;
    }
    const n = this.bulbs.count / 3;
    for (let i = 0; i < n; i++) {
      const h = this.bulbList[i];
      const st = light(s, h.node, h.ph);
      this.bulbs.setColorAt(i * 3, st === "red" ? RED : OFF);
      this.bulbs.setColorAt(i * 3 + 1, st === "amber" ? AMBER : OFF);
      this.bulbs.setColorAt(i * 3 + 2, st === "green" ? GREEN : OFF);
    }
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.city.dispose();
    this.actors.dispose();
    this.fx.dispose();
    this.env.dispose();
    this.post.dispose();
    this.renderer.dispose();
  }
}
