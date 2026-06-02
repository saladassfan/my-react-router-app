import { useState, useEffect, useRef } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import {
  Vector3 as a,
  MeshPhysicalMaterial as c,
  InstancedMesh as d,
  Clock as e,
  AmbientLight as f,
  SphereGeometry as g,
  ShaderChunk as h,
  Scene as i,
  Color as l,
  Object3D as m,
  SRGBColorSpace as n,
  MathUtils as o,
  PMREMGenerator as p,
  Vector2 as r,
  WebGLRenderer as s,
  PerspectiveCamera as t,
  PointLight as u,
  ACESFilmicToneMapping as v,
  Plane as w,
  Raycaster as y
} from "three";
import { RoomEnvironment as z } from "three/examples/jsm/environments/RoomEnvironment.js";
import logoDark from "./logo-dark.svg";
import logoLight from "./logo-light.svg";
import PrismaticBurst from "../components/PrismaticBurst";
import LineWaves from "../components/LineWaves";
import SplashCursor from "../components/SplashCursor";

// --- BALATRO SHADER UTILS & SHADERS ---
function hexToVec4(hex: string) {
  let hexStr = hex.replace('#', '');
  let r = 0, g = 0, b = 0, a = 1;
  if (hexStr.length === 6) {
    r = parseInt(hexStr.slice(0, 2), 16) / 255;
    g = parseInt(hexStr.slice(2, 4), 16) / 255;
    b = parseInt(hexStr.slice(4, 6), 16) / 255;
  } else if (hexStr.length === 8) {
    r = parseInt(hexStr.slice(0, 2), 16) / 255;
    g = parseInt(hexStr.slice(2, 4), 16) / 255;
    b = parseInt(hexStr.slice(4, 6), 16) / 255;
    a = parseInt(hexStr.slice(6, 8), 16) / 255;
  }
  return [r, g, b, a];
}

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

const fragmentShader = `
precision highp float;
#define PI 3.14159265359

uniform float iTime;
uniform vec3 iResolution;
uniform float uSpinRotation;
uniform float uSpinSpeed;
uniform vec2 uOffset;
uniform vec4 uColor1;
uniform vec4 uColor2;
uniform vec4 uColor3;
uniform float uContrast;
uniform float uLighting;
uniform float uSpinAmount;
uniform float uPixelFilter;
uniform float uSpinEase;
uniform bool uIsRotate;
uniform vec2 uMouse;

varying vec2 vUv;

vec4 effect(vec2 screenSize, vec2 screen_coords) {
    float pixel_size = length(screenSize.xy) / uPixelFilter;
    vec2 uv = (floor(screen_coords.xy * (1.0 / pixel_size)) * pixel_size - 0.5 * screenSize.xy) / length(screenSize.xy) - uOffset;
    float uv_len = length(uv);
    
    float speed = (uSpinRotation * uSpinEase * 0.2);
    if(uIsRotate){
       speed = iTime * speed;
    }
    speed += 302.2;
    
    float mouseInfluence = (uMouse.x * 2.0 - 1.0);
    speed += mouseInfluence * 0.1;
    
    float new_pixel_angle = atan(uv.y, uv.x) + speed - uSpinEase * 20.0 * (uSpinAmount * uv_len + (1.0 - uSpinAmount));
    vec2 mid = (screenSize.xy / length(screenSize.xy)) / 2.0;
    uv = (vec2(uv_len * cos(new_pixel_angle) + mid.x, uv_len * sin(new_pixel_angle) + mid.y) - mid);
    
    uv *= 30.0;
    float baseSpeed = iTime * uSpinSpeed;
    speed = baseSpeed + mouseInfluence * 2.0;
    
    vec2 uv2 = vec2(uv.x + uv.y);
    
    for(int i = 0; i < 5; i++) {
        uv2 += sin(max(uv.x, uv.y)) + uv;
        uv += 0.5 * vec2(
            cos(5.1123314 + 0.353 * uv2.y + speed * 0.131121),
            sin(uv2.x - 0.113 * speed)
        );
        uv -= cos(uv.x + uv.y) - sin(uv.x * 0.711 - uv.y);
    }
    
    float contrast_mod = (0.25 * uContrast + 0.5 * uSpinAmount + 1.2);
    float paint_res = min(2.0, max(0.0, length(uv) * 0.035 * contrast_mod));
    float c1p = max(0.0, 1.0 - contrast_mod * abs(1.0 - paint_res));
    float c2p = max(0.0, 1.0 - contrast_mod * abs(paint_res));
    float c3p = 1.0 - min(1.0, c1p + c2p);
    float light = (uLighting - 0.2) * max(c1p * 5.0 - 4.0, 0.0) + uLighting * max(c2p * 5.0 - 4.0, 0.0);
    
    return (0.3 / uContrast) * uColor1 + (1.0 - 0.3 / uContrast) * (uColor1 * c1p + uColor2 * c2p + vec4(c3p * uColor3.rgb, c3p * uColor1.a)) + light;
}

void main() {
    vec2 uv = vUv * iResolution.xy;
    gl_FragColor = effect(iResolution.xy, uv);
}
`;

// --- INNER BALATRO BACKGROUND COMPONENT ---
function Balatro({
  spinRotation = -2.0,
  spinSpeed = 7.0,
  offset = [0.0, 0.0],
  color1 = '#DE443B',
  color2 = '#006BB4',
  color3 = '#162325',
  contrast = 3.5,
  lighting = 0.4,
  spinAmount = 0.25,
  pixelFilter = 700.0,
  spinEase = 1.0,
  isRotate = false,
  mouseInteraction = true
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const renderer = new Renderer();
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 1);

    let program: Program;

    function resize() {
      renderer.setSize(container.offsetWidth, container.offsetHeight);
      if (program) {
        program.uniforms.iResolution.value = [gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height];
      }
    }
    window.addEventListener('resize', resize);
    resize();

    const geometry = new Triangle(gl);
    program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: [gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height] },
        uSpinRotation: { value: spinRotation },
        uSpinSpeed: { value: spinSpeed },
        uOffset: { value: offset },
        uColor1: { value: hexToVec4(color1) },
        uColor2: { value: hexToVec4(color2) },
        uColor3: { value: hexToVec4(color3) },
        uContrast: { value: contrast },
        uLighting: { value: lighting },
        uSpinAmount: { value: spinAmount },
        uPixelFilter: { value: pixelFilter },
        uSpinEase: { value: spinEase },
        uIsRotate: { value: isRotate },
        uMouse: { value: [0.5, 0.5] }
      }
    });

    const mesh = new Mesh(gl, { geometry, program });
    let animationFrameId: number;

    function update(time: number) {
      animationFrameId = requestAnimationFrame(update);
      program.uniforms.iTime.value = time * 0.001;
      renderer.render({ scene: mesh });
    }
    animationFrameId = requestAnimationFrame(update);
    container.appendChild(gl.canvas);

    function handleMouseMove(e: MouseEvent) {
      if (!mouseInteraction) return;
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = 1.0 - (e.clientY - rect.top) / rect.height;
      program.uniforms.uMouse.value = [x, y];
    }
    container.addEventListener('mousemove', handleMouseMove);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
      container.removeEventListener('mousemove', handleMouseMove);
      if (container.contains(gl.canvas)) {
        container.removeChild(gl.canvas);
      }
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [spinRotation, spinSpeed, offset, color1, color2, color3, contrast, lighting, spinAmount, pixelFilter, spinEase, isRotate, mouseInteraction]);

  return <div ref={containerRef} className="absolute inset-0 w-full h-full pointer-events-none rounded-2xl overflow-hidden z-0" />;
}

// --- THREE.JS BALLPIT SOURCE ENGINE FROM REACT BITS ---
class ThreeEngine {
  #e: any; canvas: any; camera: any; cameraMinAspect: any; cameraMaxAspect: any;
  cameraFov: any; maxPixelRatio: any; minPixelRatio: any; scene: any; renderer: any;
  #t: any; size = { width: 0, height: 0, wWidth: 0, wHeight: 0, ratio: 0, pixelRatio: 0 };
  render = this.#i; onBeforeRender = (_h: any) => {}; onAfterRender = (_h: any) => {};
  onAfterResize = (_size: any) => {}; #s = false; #n = false; isDisposed = false;
  #o: any; #r: any; #a: any; #c = new e(); #h = { elapsed: 0, delta: 0 }; #l: any;

  constructor(eOpts: any) {
    this.#e = { ...eOpts };
    this.#m();
    this.#d();
    this.#p();
    this.resize();
    this.#g();
  }
  #m() { this.camera = new t(); this.cameraFov = this.camera.fov; }
  #d() { this.scene = new i(); }
  #p() {
    if (this.#e.canvas) { this.canvas = this.#e.canvas; } 
    else if (this.#e.id) { this.canvas = document.getElementById(this.#e.id); }
    this.canvas.style.display = 'block';
    const rendererOpts = { canvas: this.canvas, powerPreference: 'high-performance', ...(this.#e.rendererOptions ?? {}) };
    this.renderer = new s(rendererOpts);
    this.renderer.outputColorSpace = n;
  }
  #g() {
    if (!(this.#e.size instanceof Object)) {
      window.addEventListener('resize', this.#f.bind(this));
      if (this.#e.size === 'parent' && this.canvas.parentNode) {
        this.#r = new ResizeObserver(this.#f.bind(this));
        this.#r.observe(this.canvas.parentNode);
      }
    }
    this.#o = new IntersectionObserver(this.#u.bind(this), { root: null, rootMargin: '0px', threshold: 0 });
    this.#o.observe(this.canvas);
    document.addEventListener('visibilitychange', this.#v.bind(this));
  }
  #y() {
    window.removeEventListener('resize', this.#f.bind(this));
    this.#r?.disconnect();
    this.#o?.disconnect();
    document.removeEventListener('visibilitychange', this.#v.bind(this));
  }
  #u(entries: any) { this.#s = entries[0].isIntersecting; this.#s ? this.#w() : this.#z(); }
  #v() { if (this.#s) { document.hidden ? this.#z() : this.#w(); } }
  #f() { if (this.#a) clearTimeout(this.#a); this.#a = setTimeout(this.resize.bind(this), 100); }
  resize() {
    let wWidth, hHeight;
    if (this.#e.size instanceof Object) {
      wWidth = this.#e.size.width; hHeight = this.#e.size.height;
    } else if (this.#e.size === 'parent' && this.canvas.parentNode) {
      wWidth = this.canvas.parentNode.offsetWidth; hHeight = this.canvas.parentNode.offsetHeight;
    } else {
      wWidth = window.innerWidth; hHeight = window.innerHeight;
    }
    this.size.width = wWidth; this.size.height = hHeight; this.size.ratio = wWidth / hHeight;
    this.#x(); this.#b(); this.onAfterResize(this.size);
  }
  #x() {
    this.camera.aspect = this.size.width / this.size.height;
    if (this.camera.isPerspectiveCamera && this.cameraFov) {
      if (this.cameraMinAspect && this.camera.aspect < this.cameraMinAspect) { this.#A(this.cameraMinAspect); } 
      else if (this.cameraMaxAspect && this.camera.aspect > this.cameraMaxAspect) { this.#A(this.cameraMaxAspect); } 
      else { this.camera.fov = this.cameraFov; }
    }
    this.camera.updateProjectionMatrix();
    this.updateWorldSize();
  }
  #A(aspect: any) {
    const val = Math.tan(o.degToRad(this.cameraFov / 2)) / (this.camera.aspect / aspect);
    this.camera.fov = 2 * o.radToDeg(Math.atan(val));
  }
  updateWorldSize() {
    if (this.camera.isPerspectiveCamera) {
      const fovRad = (this.camera.fov * Math.PI) / 180;
      this.size.wHeight = 2 * Math.tan(fovRad / 2) * this.camera.position.length();
      this.size.wWidth = this.size.wHeight * this.camera.aspect;
    }
  }
  #b() {
    this.renderer.setSize(this.size.width, this.size.height);
    this.#t?.setSize(this.size.width, this.size.height);
    let dpr = window.devicePixelRatio;
    if (this.maxPixelRatio && dpr > this.maxPixelRatio) { dpr = this.maxPixelRatio; } 
    else if (this.minPixelRatio && dpr < this.minPixelRatio) { dpr = this.minPixelRatio; }
    this.renderer.setPixelRatio(dpr);
    this.size.pixelRatio = dpr;
  }
  #w() {
    if (this.#n) return;
    const animate = () => {
      this.#l = requestAnimationFrame(animate);
      this.#h.delta = this.#c.getDelta();
      this.#h.elapsed += this.#h.delta;
      this.onBeforeRender(this.#h);
      this.render();
      this.onAfterRender(this.#h);
    };
    this.#n = true; this.#c.start(); animate();
  }
  #z() { if (this.#n) { cancelAnimationFrame(this.#l); this.#n = false; this.#c.stop(); } }
  #i() { this.renderer.render(this.scene, this.camera); }
  clear() {
    this.scene.traverse((node: any) => {
      if (node.isMesh && typeof node.material === 'object' && node.material !== null) {
        Object.keys(node.material).forEach(key => {
          const matProp = node.material[key];
          if (matProp !== null && typeof matProp === 'object' && typeof matProp.dispose === 'function') { matProp.dispose(); }
        });
        node.material.dispose(); node.geometry.dispose();
      }
    });
    this.scene.clear();
  }
  dispose() { this.#y(); this.#z(); this.clear(); this.#t?.dispose(); this.renderer.dispose(); this.isDisposed = true; }
}

const interactionMap = new Map(), mouseCoords = new r();
let hasGlobalEvents = false;

function setupInteraction(instance: any) {
  const data = {
    position: new r(), nPosition: new r(), hover: false, touching: false,
    onEnter() {}, onMove() {}, onClick() {}, onLeave() {}, ...instance
  };
  if (!interactionMap.has(instance.domElement)) {
    interactionMap.set(instance.domElement, data);
    if (!hasGlobalEvents) {
      document.body.addEventListener('pointermove', onGlobalPointerMove);
      document.body.addEventListener('pointerleave', onGlobalPointerLeave);
      document.body.addEventListener('touchstart', onGlobalTouchStart, { passive: false });
      document.body.addEventListener('touchmove', onGlobalTouchMove, { passive: false });
      document.body.addEventListener('touchend', onGlobalTouchEnd, { passive: false });
      hasGlobalEvents = true;
    }
  }
  data.dispose = () => {
    interactionMap.delete(instance.domElement);
    if (interactionMap.size === 0 && hasGlobalEvents) {
      document.body.removeEventListener('pointermove', onGlobalPointerMove);
      document.body.removeEventListener('pointerleave', onGlobalPointerLeave);
      document.body.removeEventListener('touchstart', onGlobalTouchStart);
      document.body.removeEventListener('touchmove', onGlobalTouchMove);
      document.body.removeEventListener('touchend', onGlobalTouchEnd);
      hasGlobalEvents = false;
    }
  };
  return data;
}

function onGlobalPointerMove(e: PointerEvent) { mouseCoords.x = e.clientX; mouseCoords.y = e.clientY; runInteractions(); }
function runInteractions() {
  for (const [elem, data] of interactionMap) {
    const rect = elem.getBoundingClientRect();
    if (checkBounds(rect)) {
      updateInteractionCoords(data, rect);
      if (!data.hover) { data.hover = true; data.onEnter(data); }
      data.onMove(data);
    } else if (data.hover && !data.touching) {
      data.hover = false; data.onLeave(data);
    }
  }
}
function onGlobalPointerLeave() { for (const d of interactionMap.values()) { if (d.hover) { d.hover = false; d.onLeave(d); } } }
function onGlobalTouchStart(e: TouchEvent) {
  if (e.touches.length > 0) {
    mouseCoords.x = e.touches[0].clientX; mouseCoords.y = e.touches[0].clientY;
    for (const [elem, data] of interactionMap) {
      const rect = elem.getBoundingClientRect();
      if (checkBounds(rect)) {
        data.touching = true; updateInteractionCoords(data, rect);
        if (!data.hover) { data.hover = true; data.onEnter(data); }
        data.onMove(data);
      }
    }
  }
}
function onGlobalTouchMove(e: TouchEvent) {
  if (e.touches.length > 0) {
    mouseCoords.x = e.touches[0].clientX; mouseCoords.y = e.touches[0].clientY;
    for (const [elem, data] of interactionMap) {
      const rect = elem.getBoundingClientRect();
      updateInteractionCoords(data, rect);
      if (checkBounds(rect)) {
        if (!data.hover) { data.hover = true; data.touching = true; data.onEnter(data); }
        data.onMove(data);
      } else if (data.hover && data.touching) { data.onMove(data); }
    }
  }
}
function onGlobalTouchEnd() { for (const [, d] of interactionMap) { if (d.touching) { d.touching = false; if (d.hover) { d.hover = false; d.onLeave(d); } } } }
function updateInteractionCoords(data: any, rect: DOMRect) {
  data.position.x = mouseCoords.x - rect.left; data.position.y = mouseCoords.y - rect.top;
  data.nPosition.x = (data.position.x / rect.width) * 2 - 1; data.nPosition.y = (-data.position.y / rect.height) * 2 + 1;
}
function checkBounds(rect: DOMRect) { return mouseCoords.x >= rect.left && mouseCoords.x <= rect.left + rect.width && mouseCoords.y >= rect.top && mouseCoords.y <= rect.top + rect.height; }

const { randFloat, randFloatSpread } = o;
const vecF = new a(), vecI = new a(), vecO = new a(), vecV = new a(), vecB = new a(), vecN = new a(), vec_ = new a(), vecJ = new a(), vecH = new a(), vecT = new a();

class PhysicsSimulation {
  config: any; positionData: Float32Array; velocityData: Float32Array; sizeData: Float32Array; center = new a();
  constructor(config: any) {
    this.config = config;
    this.positionData = new Float32Array(3 * config.count).fill(0);
    this.velocityData = new Float32Array(3 * config.count).fill(0);
    this.sizeData = new Float32Array(config.count).fill(1);
    this.#R(); this.setSizes();
  }
  #R() {
    this.center.toArray(this.positionData, 0);
    for (let idx = 1; idx < this.config.count; idx++) {
      const base = 3 * idx;
      this.positionData[base] = randFloatSpread(2 * this.config.maxX);
      this.positionData[base + 1] = randFloatSpread(2 * this.config.maxY);
      this.positionData[base + 2] = randFloatSpread(2 * this.config.maxZ);
    }
  }
  setSizes() {
    this.sizeData[0] = this.config.size0;
    for (let idx = 1; idx < this.config.count; idx++) { this.sizeData[idx] = randFloat(this.config.minSize, this.config.maxSize); }
  }
  update(e: any) {
    let startIdx = 0;
    if (this.config.controlSphere0) {
      startIdx = 1; vecF.fromArray(this.positionData, 0); vecF.lerp(this.center, 0.1).toArray(this.positionData, 0); vecV.set(0, 0, 0).toArray(this.velocityData, 0);
    }
    for (let idx = startIdx; idx < this.config.count; idx++) {
      const base = 3 * idx; vecI.fromArray(this.positionData, base); vecB.fromArray(this.velocityData, base);
      vecB.y -= e.delta * this.config.gravity * this.sizeData[idx]; vecB.multiplyScalar(this.config.friction); vecB.clampLength(0, this.config.maxVelocity);
      vecI.add(vecB); vecI.toArray(this.positionData, base); vecB.toArray(this.velocityData, base);
    }
    for (let idx = startIdx; idx < this.config.count; idx++) {
      const base = 3 * idx; vecI.fromArray(this.positionData, base); vecB.fromArray(this.velocityData, base);
      const radius = this.sizeData[idx];
      for (let jdx = idx + 1; jdx < this.config.count; jdx++) {
        const otherBase = 3 * jdx; vecO.fromArray(this.positionData, otherBase); vecN.fromArray(this.velocityData, otherBase);
        const otherRadius = this.sizeData[jdx]; vec_.copy(vecO).sub(vecI);
        const dist = vec_.length(), sumRadius = radius + otherRadius;
        if (dist < sumRadius) {
          const overlap = sumRadius - dist; vecJ.copy(vec_).normalize().multiplyScalar(0.5 * overlap);
          vecH.copy(vecJ).multiplyScalar(Math.max(vecB.length(), 1)); vecT.copy(vecJ).multiplyScalar(Math.max(vecN.length(), 1));
          vecI.sub(vecJ); vecB.sub(vecH); vecI.toArray(this.positionData, base); vecB.toArray(this.velocityData, base);
          vecO.add(vecJ); vecN.add(vecT); vecO.toArray(this.positionData, otherBase); vecN.toArray(this.velocityData, otherBase);
        }
      }
      if (this.config.controlSphere0) {
        vec_.copy(vecF).sub(vecI); const dist = vec_.length(), sumRadius0 = radius + this.sizeData[0];
        if (dist < sumRadius0) {
          const diff = sumRadius0 - dist; vecJ.copy(vec_.normalize()).multiplyScalar(diff);
          vecH.copy(vecJ).multiplyScalar(Math.max(vecB.length(), 2)); vecI.sub(vecJ); vecB.sub(vecH);
        }
      }
      if (Math.abs(vecI.x) + radius > this.config.maxX) { vecI.x = Math.sign(vecI.x) * (this.config.maxX - radius); vecB.x = -vecB.x * this.config.wallBounce; }
      if (this.config.gravity === 0) {
        if (Math.abs(vecI.y) + radius > this.config.maxY) { vecI.y = Math.sign(vecI.y) * (this.config.maxY - radius); vecB.y = -vecB.y * this.config.wallBounce; }
      } else if (vecI.y - radius < -this.config.maxY) { vecI.y = -this.config.maxY + radius; vecB.y = -vecB.y * this.config.wallBounce; }
      const maxB = Math.max(this.config.maxZ, this.config.maxSize);
      if (Math.abs(vecI.z) + radius > maxB) { vecI.z = Math.sign(vecI.z) * (this.config.maxZ - radius); vecB.z = -vecB.z * this.config.wallBounce; }
      vecI.toArray(this.positionData, base); vecB.toArray(this.velocityData, base);
    }
  }
}

class ScatteredMaterial extends c {
  uniforms: any;
  constructor(eOpts: any) {
    super(eOpts);
    this.uniforms = { thicknessDistortion: { value: 0.1 }, thicknessAmbient: { value: 0 }, thicknessAttenuation: { value: 0.1 }, thicknessPower: { value: 2 }, thicknessScale: { value: 10 } };
    this.defines.USE_UV = '';
    this.onBeforeCompile = (shader: any) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.fragmentShader = '\n uniform float thicknessPower;\n uniform float thicknessScale;\n uniform float thicknessDistortion;\n uniform float thicknessAmbient;\n uniform float thicknessAttenuation;\n ' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('void main() {', '\n void RE_Direct_Scattering(const in IncidentLight directLight, const in vec2 uv, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, inout ReflectedLight reflectedLight) {\n vec3 scatteringHalf = normalize(directLight.direction + (geometryNormal * thicknessDistortion));\n float scatteringDot = pow(saturate(dot(geometryViewDir, -scatteringHalf)), thicknessPower) * thicknessScale;\n #ifdef USE_COLOR\n vec3 scatteringIllu = (scatteringDot + thicknessAmbient) * vColor;\n #else\n vec3 scatteringIllu = (scatteringDot + thicknessAmbient) * diffuse;\n #endif\n reflectedLight.directDiffuse += scatteringIllu * thicknessAttenuation * directLight.color;\n }\n\n void main() {\n ');
      const replacedChunk = h.lights_fragment_begin.replaceAll('RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );', '\n RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n RE_Direct_Scattering(directLight, vUv, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, reflectedLight);\n ');
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', replacedChunk);
    };
  }
}

const DEFAULT_BALLPIT_CONFIG = {
  count: 200, colors: [0, 0, 0], ambientColor: 16777215, ambientIntensity: 1, lightIntensity: 200,
  materialParams: { metalness: 0.5, roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.15 },
  minSize: 0.5, maxSize: 1, size0: 1, gravity: 0.5, friction: 0.9975, wallBounce: 0.95, maxVelocity: 0.15, maxX: 5, maxY: 5, maxZ: 2, controlSphere0: false, followCursor: true
};

const objectHelper = new m();

class BallMeshInstance extends d {
  config: any; physics: PhysicsSimulation; ambientLight: any; light: any;
  constructor(renderer: any, tOpts = {}) {
    const combinedConfig = { ...DEFAULT_BALLPIT_CONFIG, ...tOpts };
    const envRoom = new z();
    const envTex = new p(renderer, 0.04).fromScene(envRoom).texture;
    const geo = new g();
    const mat = new ScatteredMaterial({ envMap: envTex, ...combinedConfig.materialParams });
    mat.envMapRotation.x = -Math.PI / 2;
    super(geo, mat, combinedConfig.count);
    this.config = combinedConfig; this.physics = new PhysicsSimulation(combinedConfig);
    this.#S(); this.setColors(combinedConfig.colors);
  }
  #S() {
    this.ambientLight = new f(this.config.ambientColor, this.config.ambientIntensity); this.add(this.ambientLight);
    this.light = new u(this.config.colors[0], this.config.lightIntensity); this.add(this.light);
  }
  setColors(colorsArr: any) {
    if (Array.isArray(colorsArr) && colorsArr.length > 1) {
      const palette = ((arr: any) => {
        let colors: any[], instances: any[];
        function build(cArr: any) { colors = cArr; instances = []; colors.forEach(col => { instances.push(new l(col)); }); }
        build(arr);
        return {
          getColorAt: function (ratio: number, out = new l()) {
            const scaled = Math.max(0, Math.min(1, ratio)) * (colors.length - 1);
            const idx = Math.floor(scaled); const start = instances[idx];
            if (idx >= colors.length - 1) return start.clone();
            const alpha = scaled - idx; const end = instances[idx + 1];
            out.r = start.r + alpha * (end.r - start.r); out.g = start.g + alpha * (end.g - start.g); out.b = start.b + alpha * (end.b - start.b);
            return out;
          }
        };
      })(colorsArr);
      for (let idx = 0; idx < this.count; idx++) {
        this.setColorAt(idx, palette.getColorAt(idx / this.count));
        if (idx === 0) { this.light.color.copy(palette.getColorAt(idx / this.count)); }
      }
      if (this.instanceColor) this.instanceColor.needsUpdate = true;
    }
  }
  update(e: any) {
    this.physics.update(e);
    for (let idx = 0; idx < this.count; idx++) {
      objectHelper.position.fromArray(this.physics.positionData, 3 * idx);
      if (idx === 0 && this.config.followCursor === false) { objectHelper.scale.setScalar(0); } 
      else { objectHelper.scale.setScalar(this.physics.sizeData[idx]); }
      objectHelper.updateMatrix(); this.setMatrixAt(idx, objectHelper.matrix);
      if (idx === 0) this.light.position.copy(objectHelper.position);
    }
    this.instanceMatrix.needsUpdate = true;
  }
}

function createBallpit(canvasElem: HTMLCanvasElement, customProps = {}) {
  const engine = new ThreeEngine({ canvas: canvasElem, size: 'parent', rendererOptions: { antialias: true, alpha: true } });
  let ballInstances: BallMeshInstance;
  engine.renderer.toneMapping = v; engine.camera.position.set(0, 0, 20); engine.camera.lookAt(0, 0, 0); engine.cameraMaxAspect = 1.5; engine.resize();
  
  function initialize(cfg: any) {
    if (ballInstances) { engine.clear(); engine.scene.remove(ballInstances); }
    ballInstances = new BallMeshInstance(engine.renderer, cfg); engine.scene.add(ballInstances);
  }
  initialize(customProps);
  
  const ray = new y(), trackingPlane = new w(new a(0, 0, 1), 0), computedIntersection = new a();
  let paused = false;
  canvasElem.style.touchAction = 'none'; canvasElem.style.userSelect = 'none';
  
  const interaction = setupInteraction({
    domElement: canvasElem,
    onMove() {
      ray.setFromCamera(interaction.nPosition, engine.camera); engine.camera.getWorldDirection(trackingPlane.normal);
      ray.ray.intersectPlane(trackingPlane, computedIntersection); ballInstances.physics.center.copy(computedIntersection);
      ballInstances.config.controlSphere0 = true;
    },
    onLeave() { ballInstances.config.controlSphere0 = false; }
  });
  
  engine.onBeforeRender = e => { if (!paused) ballInstances.update(e); };
  engine.onAfterResize = size => { ballInstances.config.maxX = size.wWidth / 2; ballInstances.config.maxY = size.wHeight / 2; };
  
  return {
    dispose() { interaction.dispose(); engine.dispose(); }
  };
}

function Ballpit({ className = '', followCursor = true, ...props }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<any>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    instanceRef.current = createBallpit(canvasRef.current, { followCursor, ...props });
    return () => { instanceRef.current?.dispose(); };
  }, [followCursor, props]);

  return <canvas className={className} ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
}

// --- STATIC APPLICATION PEOPLE RECORD DATA ---
const peopleData = {
  luis: {
    name: "Luis Reyna",
    age: 26,
    nationality: "Mexican",
    major: "Chemical Engineering",
    location: "Germany",
    hobbies: [
      "🎮 Videogames",
      "🧱 Building Lego",
      "📸 Collecting old electronic devices like Polaroids",
      "📚 Manga",
      "🌱 Gardening",
      "⚽ Watching football"
    ],
    video: {
      title: "DougDoug - I forced an Ai to play a kids adventure game",
      url: "https://www.youtube.com/watch?v=W3id8E34cRQ&t=1s"
    },
    socials: []
  },
  nahyun: {
    name: "Nahyun Park",
    age: 21,
    nationality: "South Korean",
    major: "Mechanical Engineering",
    location: "DHBW Mosbach in Germany",
    hobbies: [
      "🏎️ Watching Sports (Motorsports, Baseball)",
      "🎧 Listening to music"
    ],
    socials: []
  },
  adrian: {
    name: "Adrián Moreno Gil",
    age: null,
    nationality: "",
    major: "Electronics & Web Developer",
    location: "",
    customBio: (
      <div className="text-left space-y-4 text-white z-10 relative">
        <p>Hi I'm Adrián, a person who loves building things and experimenting with electronics like Arduino. I enjoy taking ideas and translating them into reality through code and hardware projects.</p>
        <div>
          <h4 className="font-semibold text-white">Electronics & Coding 🤖</h4>
          <p className="text-sm text-white/90">I love tinkering with microcontrollers, writing automated programs, hooking up sensors (like ultrasonic and temperature modules), and designing logic to make hardware react to the real world.</p>
        </div>
        <div>
          <h4 className="font-semibold text-white">Web Technologies 🃏</h4>
          <p className="text-sm text-white/90">Exploring frontend architectures, testing vulnerabilities in staging labs, and understanding how applications handle security parameters and validation tricks between the server and client.</p>
        </div>
      </div>
    ),
    hobbies: [],
    socials: [
      { platform: "LinkedIn", url: "https://www.linkedin.com/in/adrianmorenogil/" }
    ]
  },
  laila: {
    name: "Laila Atkins",
    age: 21,
    nationality: "Mexican",
    major: "Industrial and Systems Engineering",
    location: "DHBW in Germany",
    hobbies: [
      "Going to concerts 🎵",
      "Watching NFL games 🏈",
      "Traveling ✈️",
      "Listening to music 🎧",
      "Watching TV shows 🎬",
      "Spending time with friends 😊"
    ],
    socials: [
      { platform: "Instagram", url: "https://www.instagram.com/laila.atks?igsh=a2hyMm1scDA1M3gx&utm_source=qr" },
      { platform: "Spotify", url: "https://open.spotify.com/user/lailaatk?si=5mHTSwFIS2mkuSvnJom_gw" }
    ]
  }
};

type PersonKey = keyof typeof peopleData;

export function Welcome() {
  const [selectedPerson, setSelectedPerson] = useState<PersonKey | null>(null);
  const closeModal = () => setSelectedPerson(null);

  return (
    <main className="flex flex-col items-center justify-start min-h-screen pt-16 pb-4 gap-8 text-center px-4 relative bg-black text-white">
      <div className="absolute inset-0 w-full h-full rounded-2xl overflow-hidden z-0 pointer-events-none flex items-center justify-center">
        <div style={{ width: '1080px', height: '1080px', position: 'relative' }}>
          <SplashCursor
            SIM_RESOLUTION={128}
            DYE_RESOLUTION={1440}
            DENSITY_DISSIPATION={3.5}
            VELOCITY_DISSIPATION={2}
            PRESSURE={0.1}
            CURL={3}
            SPLAT_RADIUS={0.2}
            SPLAT_FORCE={6000}
            COLOR_UPDATE_SPEED={10}
          />
        </div>
      </div>
      <div className="relative z-10 w-full">

      {/* Navigation Member Buttons */}
      <nav className="mx-auto flex flex-wrap gap-4 justify-center w-full max-w-lg">
        {(Object.keys(peopleData) as PersonKey[]).map((key) => (
          <button 
            key={key}
            onClick={() => setSelectedPerson(key)}
            className="px-5 py-2 bg-black text-white font-medium rounded-lg transition-colors shadow-sm capitalize border border-transparent animated-border-cycle"
          >
            {key}
          </button>
        ))}
      </nav>

      <header className="mt-4">
        <h1 className="text-4xl font-bold tracking-tight text-white">
          Welcome to Our Web Page
        </h1>
        <p className="text-white/70 mt-2 max-w-md mx-auto">
          Click on any team member's button at the top to discover their profile!
        </p>
        <section className="mt-6 max-w-lg mx-auto bg-white/5 border border-white/10 rounded-3xl p-5 text-left shadow-lg">
          <h2 className="text-2xl font-semibold text-white mb-3">
            Our embedded system
          </h2>
          <p className="text-white/70 leading-7">
            This project is an embedded smart home system that combines a light sensor and a sound sensor to automate lighting and security functions. Depending on the room brightness and detected sound, the system either turns on a white LED for illumination or activates a red LED and buzzer alarm for security purposes.
          </p>
        </section>
      </header>

      {/* POP-UP MODAL ENGINE */}
      {selectedPerson && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          
          {/* Dynamic Card Container changing styles based on active background overlay modules */}
          <div className={`rounded-2xl shadow-2xl max-w-md w-full p-6 text-center relative max-h-[90vh] overflow-y-auto transition-all duration-300 border overflow-hidden
            ${selectedPerson === 'luis' 
              ? 'bg-transparent text-white border-white/10 shadow-[0_0_50px_rgba(222,68,59,0.3)]' 
              : selectedPerson === 'laila'
              ? 'bg-transparent text-white border-white/10 shadow-[0_0_50px_rgba(82,39,255,0.3)]'
              : selectedPerson === 'adrian'
              ? 'bg-transparent text-white border-white/10 shadow-[0_0_50px_rgba(168,85,247,0.3)]'
              : 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white border-gray-200 dark:border-gray-800'
            }`}
          >
            {/* INJECT BALATRO MATRIX BACKDROP EXCLUSIVELY FOR LUIS */}
            {selectedPerson === 'luis' && (
              <Balatro isRotate={false} mouseInteraction={true} pixelFilter={700} />
            )}

            {/* INJECT BALLPIT ENVIRONMENT WRAPPER EXCLUSIVELY FOR LAILA WITH CUSTOM PROP VALUES */}
            {selectedPerson === 'laila' && (
              <div className="absolute inset-0 w-full h-full rounded-2xl overflow-hidden z-0 pointer-events-none flex items-center justify-center">
                <div style={{ width: '1080px', height: '1080px', position: 'relative' }}>
                  <Ballpit
                    count={100}
                    gravity={0.01}
                    friction={0.9975}
                    wallBounce={0.95}
                    followCursor={false}
                    colors={["#5227FF","#7cff67","#ff6b6b"]}
                  />
                </div>
              </div>
            )}

            {selectedPerson === 'nahyun' && (
              <div className="absolute inset-0 w-full h-full rounded-2xl overflow-hidden z-0 pointer-events-none flex items-center justify-center">
                <div style={{ width: '1080px', height: '1080px', position: 'relative' }}>
                  <LineWaves
                    speed={0.3}
                    innerLineCount={32}
                    outerLineCount={36}
                    warpIntensity={1}
                    rotation={-45}
                    edgeFadeWidth={0}
                    colorCycleSpeed={1}
                    brightness={0.2}
                    color1="#ffffff"
                    color2="#ffffff"
                    color3="#ffffff"
                    enableMouseInteraction
                    mouseInfluence={2}
                  />
                </div>
              </div>
            )}

            {/* INJECT PRISMATIC BACKDROP FOR ADRIAN */}
            {selectedPerson === 'adrian' && (
              <div className="absolute inset-0 w-full h-full rounded-2xl overflow-hidden z-0 pointer-events-none flex items-center justify-center">
                <div style={{ width: '1080px', height: '1080px', position: 'relative' }}>
                  <PrismaticBurst
                    intensity={2}
                    speed={0.5}
                    animationType="rotate3d"
                    colors={["#A855F7", "#7C3AED", "#6366F1"]}
                    distort={0}
                    hoverDampness={0}
                    rayCount={0}
                  />
                </div>
              </div>
            )}

            {/* Modal Exit Action */}
            <button 
              onClick={closeModal}
              className={`absolute top-4 right-4 text-xl font-bold p-1 z-20 transition-colors
                ${(selectedPerson === 'luis' || selectedPerson === 'laila' || selectedPerson === 'adrian') ? 'text-white/70 hover:text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
            >
              ✕
            </button>

            {/* Header Identity Elements */}
            <header className={`mb-4 border-b pb-3 z-10 relative ${(selectedPerson === 'luis' || selectedPerson === 'laila' || selectedPerson === 'adrian') ? 'border-white/20' : 'border-gray-100 dark:border-gray-800'}`}>
              <h2 className={`text-2xl font-bold tracking-tight ${(selectedPerson === 'luis' || selectedPerson === 'laila' || selectedPerson === 'adrian') ? 'text-white' : selectedPerson === 'nahyun' ? 'text-black' : 'text-gray-900 dark:text-white'}`}>
                {peopleData[selectedPerson].name}
              </h2>
              {peopleData[selectedPerson].major && (
                <p className={`text-sm font-medium ${selectedPerson === 'luis' ? 'text-red-300' : selectedPerson === 'laila' ? 'text-purple-300' : selectedPerson === 'adrian' ? 'text-white/70' : selectedPerson === 'nahyun' ? 'text-black' : 'text-blue-600 dark:text-blue-400'}`}>
                  {peopleData[selectedPerson].major}
                </p>
              )}
            </header>

            {/* Biography Content Wrapper */}
            <section className="mb-6 z-10 relative">
              <h3 className={`text-lg font-semibold mb-2 text-left ${(selectedPerson === 'luis' || selectedPerson === 'laila' || selectedPerson === 'adrian') ? 'text-white' : selectedPerson === 'nahyun' ? 'text-black' : 'text-gray-800 dark:text-gray-200'}`}>
                About Me
              </h3>
              {peopleData[selectedPerson].customBio ? (
                peopleData[selectedPerson].customBio
              ) : (
                <p className={`text-left leading-relaxed ${(selectedPerson === 'luis' || selectedPerson === 'laila' || selectedPerson === 'adrian') ? 'text-white/90' : selectedPerson === 'nahyun' ? 'text-black' : 'text-gray-600 dark:text-gray-400'}`}>
                  My name is {peopleData[selectedPerson].name}, I'm a {peopleData[selectedPerson].age}-year-old {peopleData[selectedPerson].nationality} studying {peopleData[selectedPerson].major} currently on an exchange program in {peopleData[selectedPerson].location}.
                </p>
              )}
            </section>
            
            {/* Dynamic Hobby rendering array list */}
            {peopleData[selectedPerson].hobbies.length > 0 && (
              <section className="mb-6 z-10 relative">
                <h3 className={`text-lg font-semibold mb-2 text-left ${(selectedPerson === 'luis' || selectedPerson === 'laila' || selectedPerson === 'adrian') ? 'text-white' : selectedPerson === 'nahyun' ? 'text-black' : 'text-gray-800 dark:text-gray-200'}`}>
                  Hobbies
                </h3>
                <ul className={`list-disc list-inside text-left space-y-1 ${(selectedPerson === 'luis' || selectedPerson === 'laila' || selectedPerson === 'adrian') ? 'text-white/90' : selectedPerson === 'nahyun' ? 'text-black' : 'text-gray-600 dark:text-gray-400'}`}>
                  {peopleData[selectedPerson].hobbies.map((hobby, index) => (
                    <li key={index} className="pl-1">{hobby}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* Favorite Embedded Video Layer (Specific to Luis) */}
            {'video' in peopleData[selectedPerson] && (peopleData[selectedPerson] as any).video && (
              <section className={`mb-6 p-3 rounded-xl text-left border z-10 relative 
                ${selectedPerson === 'luis' 
                  ? 'bg-black/40 border-white/10' 
                  : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-800'
                }`}
              >
                <h3 className={`text-sm font-semibold mb-1 ${selectedPerson === 'luis' ? 'text-red-300' : 'text-gray-700 dark:text-gray-300'}`}>
                  🎥 My favorite video
                </h3>
                <a 
                  href={(peopleData[selectedPerson] as any).video.url}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`text-xs block truncate underline ${selectedPerson === 'luis' ? 'text-blue-300 hover:text-blue-200' : 'text-blue-500 hover:text-blue-600'}`}
                >
                  {(peopleData[selectedPerson] as any).video.title}
                </a>
              </section>
            )}

            {/* Static Social Accounts mapping blocks */}
            {peopleData[selectedPerson].socials.length > 0 && (
              <section className={`mb-4 border-t pt-4 text-left z-10 relative ${(selectedPerson === 'luis' || selectedPerson === 'laila' || selectedPerson === 'adrian') ? 'border-white/20' : 'border-gray-100 dark:border-gray-800'}`}>
                <h3 className={`text-sm font-semibold mb-2 ${(selectedPerson === 'luis' || selectedPerson === 'laila' || selectedPerson === 'adrian') ? 'text-white' : selectedPerson === 'nahyun' ? 'text-black' : 'text-gray-800 dark:text-gray-200'}`}>
                  My socials!!
                </h3>
                <div className="flex flex-wrap gap-3">
                  {peopleData[selectedPerson].socials.map((social, idx) => (
                    <a
                      key={idx}
                      href={social.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`text-xs px-3 py-1.5 rounded-md transition-colors ${selectedPerson === 'adrian' ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                    >
                      {social.platform}
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* Lower UI Frame Close Trigger */}
            <button
              onClick={closeModal}
              className={`mt-2 w-full py-2 font-medium rounded-lg transition-colors text-sm z-10 relative
                ${(selectedPerson === 'luis' || selectedPerson === 'laila' || selectedPerson === 'adrian') 
                  ? 'bg-white/10 hover:bg-white/20 text-white border border-white/20' 
                  : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-white'
                }`}
            >
              Close Profile
            </button>
          </div>
        </div>
      )}

      <footer className="mt-auto pt-8 w-full text-center">
        <p className="text-sm text-white/70">
          © {new Date().getFullYear()} My Web Page. All rights reserved.
        </p>
      </footer>
      </div>
    </main>
  );
}