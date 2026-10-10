"use client"

import * as React from "react"
import * as THREE from "three"

import { cssVarToHex } from "@/lib/css-color"
import { landPoints } from "./land-mask"

/**
 * The landing page's centrepiece: a globe drawn from real land data, with trip routes arcing
 * between cities and lights running along them. Square dots and lime, like the rest of the app.
 * It turns slowly, follows the pointer, can be dragged, pauses when off screen, stands still
 * for people who prefer reduced motion, and follows the light/dark theme.
 */

type City = { name: string; code: string; lat: number; lng: number }

const CITIES: City[] = [
  { name: "Bengaluru", code: "BLR", lat: 12.97, lng: 77.59 },
  { name: "Colombo", code: "CMB", lat: 6.93, lng: 79.86 },
  { name: "Goa", code: "GOI", lat: 15.38, lng: 73.83 },
  { name: "Dubai", code: "DXB", lat: 25.2, lng: 55.27 },
  { name: "Singapore", code: "SIN", lat: 1.35, lng: 103.82 },
  { name: "Bangkok", code: "BKK", lat: 13.69, lng: 100.75 },
  { name: "Tokyo", code: "HND", lat: 35.55, lng: 139.78 },
  { name: "Paris", code: "CDG", lat: 49.01, lng: 2.55 },
]
// Pairs of city indexes joined by a route.
const ROUTES: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [4, 5],
  [5, 6],
  [3, 7],
]
const LABELLED = [0, 1, 4, 3]

const DEG = Math.PI / 180

function toVec(lat: number, lng: number, r = 1) {
  const phi = (90 - lat) * DEG
  const theta = (lng + 180) * DEG
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta))
}

/** Points along the great circle between two places, lifted off the surface in the middle. */
function arcPoints(a: THREE.Vector3, b: THREE.Vector3, lift: number, steps = 64) {
  const pts: THREE.Vector3[] = []
  const angle = a.angleTo(b)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const p = new THREE.Vector3().copy(a).lerp(b, t).normalize()
    pts.push(p.multiplyScalar(1 + Math.sin(Math.PI * t) * lift * Math.min(1, angle / 1.2)))
  }
  return pts
}

type Palette = { land: THREE.Color; ocean: THREE.Color; oceanAlpha: number; rim: THREE.Color; arc: THREE.Color; grid: THREE.Color; gridAlpha: number; dark: boolean }

function readPalette(): Palette {
  const dark = document.documentElement.classList.contains("dark")
  const lime = new THREE.Color(cssVarToHex("--primary"))
  return dark
    ? { land: lime.clone().lerp(new THREE.Color("#ffffff"), 0.1), ocean: new THREE.Color("#0c1707"), oceanAlpha: 0.72, rim: lime, arc: lime.clone().lerp(new THREE.Color("#ffffff"), 0.35), grid: lime, gridAlpha: 0.1, dark }
    : { land: new THREE.Color("#2f5d00"), ocean: new THREE.Color("#ffffff"), oceanAlpha: 0.5, rim: lime.clone().lerp(new THREE.Color("#4d8f00"), 0.35), arc: new THREE.Color("#2f6b00"), grid: new THREE.Color("#2f5d00"), gridAlpha: 0.13, dark }
}

const LAND_VERT = /* glsl */ `
  uniform float uSize;
  uniform float uPixel;
  varying float vFacing;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFacing = dot(normalize(normalMatrix * normalize(position)), vec3(0.0, 0.0, 1.0));
    gl_PointSize = uSize * uPixel * (3.4 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`
const LAND_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uDark;
  varying float vFacing;
  void main() {
    float a = smoothstep(-0.05, 0.35, vFacing);
    float back = (1.0 - smoothstep(-0.05, 0.1, vFacing)) * 0.14;
    gl_FragColor = vec4(uColor, a * (0.5 + 0.5 * vFacing) + back * 0.35);
  }
`
const MARK_VERT = /* glsl */ `
  uniform float uPixel;
  uniform float uTime;
  attribute float aPhase;
  varying float vFacing;
  varying float vPulse;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFacing = dot(normalize(normalMatrix * normalize(position)), vec3(0.0, 0.0, 1.0));
    vPulse = fract(uTime * 0.45 + aPhase);
    gl_PointSize = (9.0 + 26.0 * vPulse) * uPixel * (3.4 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`
const MARK_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vFacing;
  varying float vPulse;
  void main() {
    vec2 p = abs(gl_PointCoord - 0.5) * 2.0;
    float edge = max(p.x, p.y);
    float core = step(edge, 0.2 + 0.0 * vPulse);
    float ring = smoothstep(0.84, 0.94, edge) * (1.0 - smoothstep(0.94, 1.0, edge)) * (1.0 - vPulse);
    float vis = smoothstep(0.0, 0.25, vFacing);
    gl_FragColor = vec4(uColor, (core * 0.95 + ring * 0.9) * vis);
  }
`
const ARC_VERT = /* glsl */ `
  varying float vT;
  varying float vFacing;
  void main() {
    vT = uv.x;
    vFacing = dot(normalize(normalMatrix * normalize(position)), vec3(0.0, 0.0, 1.0));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const ARC_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOffset;
  varying float vT;
  varying float vFacing;
  void main() {
    float head = fract(uTime * 0.16 + uOffset);
    float d = head - vT;
    d = d < 0.0 ? d + 1.0 : d;
    float trail = exp(-d * 9.0) * step(d, 0.5);
    float base = 0.42;
    float vis = smoothstep(-0.15, 0.2, vFacing);
    gl_FragColor = vec4(uColor, (base + trail * 0.9) * vis);
  }
`

export function HeroGlobe({ className }: { className?: string }) {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const labelRefs = React.useRef<(HTMLDivElement | null)[]>([])

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" })
    } catch {
      return // no WebGL: the page simply shows its background
    }
    renderer.setClearColor(0x000000, 0)
    const pixel = Math.min(window.devicePixelRatio || 1, 2)
    renderer.setPixelRatio(pixel)
    host.appendChild(renderer.domElement)
    renderer.domElement.className = "block size-full touch-pan-y"

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50)
    camera.position.set(0, 0, 4.6)

    const tilt = new THREE.Group() // latitude tilt (parent) over spin (child)
    const spin = new THREE.Group()
    tilt.add(spin)
    scene.add(tilt)

    let palette = readPalette()

    // Ocean with a soft rim of light.
    const oceanMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { uOcean: { value: palette.ocean }, uAlpha: { value: palette.oceanAlpha }, uRim: { value: palette.rim } },
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uOcean; uniform vec3 uRim; uniform float uAlpha; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.6); gl_FragColor = vec4(mix(uOcean, uRim, f * 0.6), uAlpha * (0.55 + 0.45 * f) + f * 0.25); }`,
    })
    spin.add(new THREE.Mesh(new THREE.SphereGeometry(0.995, 64, 64), oceanMat))

    // Atmosphere glow.
    const glowMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: palette.rim } },
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(max(0.0, 0.55 - dot(vN, vV)), 2.0); gl_FragColor = vec4(uColor, f * 0.28); }`,
    })
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.1, 64, 64), glowMat))

    // Graticule.
    const gridPts: number[] = []
    const seg = (a: THREE.Vector3, b: THREE.Vector3) => gridPts.push(a.x, a.y, a.z, b.x, b.y, b.z)
    for (let lat = -60; lat <= 60; lat += 30) for (let lng = -180; lng < 180; lng += 6) seg(toVec(lat, lng, 1.002), toVec(lat, lng + 6, 1.002))
    for (let lng = -180; lng < 180; lng += 30) for (let lat = -84; lat < 84; lat += 6) seg(toVec(lat, lng, 1.002), toVec(lat + 6, lng, 1.002))
    const gridGeo = new THREE.BufferGeometry()
    gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(gridPts, 3))
    const gridMat = new THREE.LineBasicMaterial({ color: palette.grid, transparent: true, opacity: palette.gridAlpha, depthWrite: false })
    spin.add(new THREE.LineSegments(gridGeo, gridMat))

    // Land: one square dot per land cell.
    const land = landPoints()
    const landPos = new Float32Array(land.length * 3)
    land.forEach(([lat, lng], i) => toVec(lat, lng, 1.004).toArray(landPos, i * 3))
    const landGeo = new THREE.BufferGeometry()
    landGeo.setAttribute("position", new THREE.BufferAttribute(landPos, 3))
    const landMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uColor: { value: palette.land }, uSize: { value: 3.7 }, uPixel: { value: pixel }, uDark: { value: palette.dark ? 1 : 0 } },
      vertexShader: LAND_VERT,
      fragmentShader: LAND_FRAG,
    })
    spin.add(new THREE.Points(landGeo, landMat))

    // City markers.
    const markPos = new Float32Array(CITIES.length * 3)
    const phases = new Float32Array(CITIES.length)
    CITIES.forEach((c, i) => {
      toVec(c.lat, c.lng, 1.012).toArray(markPos, i * 3)
      phases[i] = (i * 0.37) % 1
    })
    const markGeo = new THREE.BufferGeometry()
    markGeo.setAttribute("position", new THREE.BufferAttribute(markPos, 3))
    markGeo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1))
    const markMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uColor: { value: palette.dark ? palette.rim : new THREE.Color("#3f7d00") }, uPixel: { value: pixel }, uTime: { value: 0 } },
      vertexShader: MARK_VERT,
      fragmentShader: MARK_FRAG,
    })
    spin.add(new THREE.Points(markGeo, markMat))

    // Routes.
    const arcMats: THREE.ShaderMaterial[] = []
    const arcGeos: THREE.BufferGeometry[] = []
    ROUTES.forEach(([from, to], i) => {
      const a = toVec(CITIES[from].lat, CITIES[from].lng, 1.012)
      const b = toVec(CITIES[to].lat, CITIES[to].lng, 1.012)
      const curve = new THREE.CatmullRomCurve3(arcPoints(a, b, 0.22))
      const geo = new THREE.TubeGeometry(curve, 72, 0.0058, 5, false)
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: palette.dark ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: { uColor: { value: palette.arc }, uTime: { value: 0 }, uOffset: { value: i * 0.19 } },
        vertexShader: ARC_VERT,
        fragmentShader: ARC_FRAG,
      })
      arcGeos.push(geo)
      arcMats.push(mat)
      spin.add(new THREE.Mesh(geo, mat))
    })

    // Aim the first view at the subcontinent, where the example trips start.
    const focus = toVec(CITIES[0].lat + 4, CITIES[0].lng, 1)
    let spinY = -Math.atan2(focus.x, focus.z)
    const baseTilt = (CITIES[0].lat + 4) * DEG * 0.8
    tilt.rotation.x = baseTilt

    // Size and layout.
    const size = { w: 1, h: 1 }
    const resize = () => {
      const rect = host.getBoundingClientRect()
      size.w = Math.max(1, rect.width)
      size.h = Math.max(1, rect.height)
      renderer.setSize(size.w, size.h, false)
      camera.aspect = size.w / size.h
      // Keep the whole globe in frame whatever the shape of the box.
      const fit = Math.min(1, camera.aspect)
      camera.position.z = 5.5 / Math.max(0.62, fit)
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    // Pointer: drag to spin, hover to lean.
    let dragging = false
    let lastX = 0
    let velocity = 0
    let lean = { x: 0, y: 0 }
    const target = { x: 0, y: 0 }
    const onDown = (e: PointerEvent) => {
      dragging = true
      lastX = e.clientX
      velocity = 0
      renderer.domElement.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect()
      target.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2
      target.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2
      if (dragging) {
        const dx = e.clientX - lastX
        lastX = e.clientX
        spinY += dx * 0.006
        velocity = dx * 0.006
        if (reduced) draw()
      }
    }
    const onUp = (e: PointerEvent) => {
      dragging = false
      renderer.domElement.releasePointerCapture?.(e.pointerId)
    }
    renderer.domElement.addEventListener("pointerdown", onDown)
    window.addEventListener("pointermove", onMove)
    renderer.domElement.addEventListener("pointerup", onUp)
    renderer.domElement.addEventListener("pointercancel", onUp)

    // Theme follows the app.
    const applyPalette = () => {
      palette = readPalette()
      oceanMat.uniforms.uOcean.value = palette.ocean
      oceanMat.uniforms.uAlpha.value = palette.oceanAlpha
      oceanMat.uniforms.uRim.value = palette.rim
      glowMat.uniforms.uColor.value = palette.rim
      gridMat.color = palette.grid
      gridMat.opacity = palette.gridAlpha
      landMat.uniforms.uColor.value = palette.land
      landMat.uniforms.uDark.value = palette.dark ? 1 : 0
      markMat.uniforms.uColor.value = palette.dark ? palette.rim : new THREE.Color("#3f7d00")
      for (const m of arcMats) {
        m.uniforms.uColor.value = palette.arc
        m.blending = palette.dark ? THREE.AdditiveBlending : THREE.NormalBlending
        m.needsUpdate = true
      }
      if (reduced) draw()
    }
    const mo = new MutationObserver(applyPalette)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })

    // City labels follow the globe.
    const tmp = new THREE.Vector3()
    const placeLabels = () => {
      LABELLED.forEach((cityIndex, i) => {
        const el = labelRefs.current[i]
        if (!el) return
        const c = CITIES[cityIndex]
        tmp.copy(toVec(c.lat, c.lng, 1.03))
        spin.localToWorld(tmp)
        const facing = tmp.clone().normalize().dot(new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion))
        const camDir = camera.position.clone().sub(tmp).normalize()
        const visible = tmp.clone().normalize().dot(camDir) > 0.18 && facing > 0
        tmp.project(camera)
        el.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * size.w}px, ${(-tmp.y * 0.5 + 0.5) * size.h}px)`
        el.style.opacity = visible ? "1" : "0"
      })
    }

    const clock = new THREE.Clock()
    let elapsed = 0
    let raf = 0
    let running = false
    function draw() {
      const delta = Math.min(clock.getDelta(), 0.05)
      elapsed += delta
      if (!dragging) {
        spinY += (reduced ? 0 : 0.07 * delta) + velocity
        velocity *= 0.94
      }
      lean = { x: lean.x + (target.x - lean.x) * 0.05, y: lean.y + (target.y - lean.y) * 0.05 }
      spin.rotation.y = spinY
      tilt.rotation.x = baseTilt + lean.y * 0.12
      tilt.rotation.y = lean.x * 0.18
      markMat.uniforms.uTime.value = elapsed
      for (const m of arcMats) m.uniforms.uTime.value = elapsed
      renderer.render(scene, camera)
      placeLabels()
    }
    const loop = () => {
      if (!running) return
      draw()
      raf = requestAnimationFrame(loop)
    }
    const start = () => {
      if (running || reduced) return
      running = true
      clock.getDelta()
      raf = requestAnimationFrame(loop)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(raf)
    }
    // Only work while it can be seen.
    const io = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()), { threshold: 0.05 })
    io.observe(host)
    const onVisibility = () => (document.hidden ? stop() : host.getBoundingClientRect().bottom > 0 && start())
    document.addEventListener("visibilitychange", onVisibility)
    draw()

    return () => {
      stop()
      io.disconnect()
      ro.disconnect()
      mo.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pointermove", onMove)
      renderer.domElement.removeEventListener("pointerdown", onDown)
      renderer.domElement.removeEventListener("pointerup", onUp)
      renderer.domElement.removeEventListener("pointercancel", onUp)
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose?.()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat?.dispose?.()
      })
      arcGeos.forEach((g) => g.dispose())
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return (
    <div className={className}>
      <div ref={hostRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" aria-hidden />
      {/* Labels sit above the canvas and are moved by the render loop. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {LABELLED.map((cityIndex, i) => (
          <div
            key={CITIES[cityIndex].code}
            ref={(el) => {
              labelRefs.current[i] = el
            }}
            className="absolute top-0 left-0 opacity-0 transition-opacity duration-300"
          >
            <span className="ml-3 -translate-y-1/2 inline-flex translate-y-[-50%] items-center gap-1.5 border bg-card px-1.5 py-0.5 text-[10px] font-medium tracking-wider whitespace-nowrap uppercase shadow-sm">
              <span className="text-brand">{CITIES[cityIndex].code}</span>
              <span className="hidden text-muted-foreground sm:inline">{CITIES[cityIndex].name}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
