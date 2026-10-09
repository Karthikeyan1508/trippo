"use client"

import * as React from "react"

import { cssVarToHex } from "@/lib/css-color"

/**
 * A very mild, slow-moving shader behind the whole app: soft domain-warped
 * noise tinted with the theme's greens, so the glass surfaces have something
 * gentle to blur. It renders at half resolution, caps its frame rate, pauses
 * while the tab is hidden, and holds a single still frame for people who
 * prefer reduced motion. If WebGL isn't available the plain page background
 * simply shows through.
 */

const VERTEX = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

const FRAGMENT = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_bg;
uniform vec3 u_a;
uniform vec3 u_b;
uniform float u_strength;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = uv * vec2(u_res.x / u_res.y, 1.0) * 1.5;
  float t = u_time * 0.035;

  // Domain-warped noise: slow, organic drifting.
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  float f = fbm(p + 3.0 * q + t * 0.5);

  vec3 tint = mix(u_a, u_b, smoothstep(0.25, 0.85, f));

  // A faint pool of light from the top-left keeps the page from feeling flat.
  float glow = smoothstep(1.25, 0.0, length(uv - vec2(0.12, 0.02)));
  float amount = u_strength * (0.35 + 0.65 * f) * (0.55 + 0.45 * glow);

  vec3 col = mix(u_bg, tint, amount);
  col += (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) * 0.01; // fine grain
  gl_FragColor = vec4(col, 1.0);
}
`

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile failed:", gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function ShaderBackground() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, powerPreference: "low-power" })
    const fail = () => {
      canvas.style.display = "none"
    }
    if (!gl) return fail()
    canvas.style.display = ""

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
    const program = gl.createProgram()
    if (!vs || !fs || !program) return fail()
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return fail()
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(program, "a_pos")
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const u = {
      res: gl.getUniformLocation(program, "u_res"),
      time: gl.getUniformLocation(program, "u_time"),
      bg: gl.getUniformLocation(program, "u_bg"),
      a: gl.getUniformLocation(program, "u_a"),
      b: gl.getUniformLocation(program, "u_b"),
      strength: gl.getUniformLocation(program, "u_strength"),
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    const SCALE = 0.5 // render at half resolution — it's a soft blur anyway
    const FRAME_MS = 1000 / 24
    let raf = 0
    let last = 0
    const start = performance.now()

    function applyTheme() {
      const dark = document.documentElement.classList.contains("dark")
      gl!.uniform3fv(u.bg, hexToRgb(cssVarToHex("--background", dark ? "#0d1214" : "#ffffff")))
      gl!.uniform3fv(u.a, hexToRgb(cssVarToHex("--primary", "#84cc16")))
      gl!.uniform3fv(u.b, hexToRgb(cssVarToHex("--chart-4", "#4d7c0f")))
      // Mild on purpose; a touch stronger on dark where it reads as depth.
      gl!.uniform1f(u.strength, dark ? 0.2 : 0.16)
    }

    function resize() {
      const w = Math.max(1, Math.floor(window.innerWidth * SCALE))
      const h = Math.max(1, Math.floor(window.innerHeight * SCALE))
      canvas!.width = w
      canvas!.height = h
      gl!.viewport(0, 0, w, h)
      gl!.uniform2f(u.res, w, h)
    }

    function draw(now: number) {
      gl!.uniform1f(u.time, (now - start) / 1000)
      gl!.drawArrays(gl!.TRIANGLES, 0, 3)
    }

    function loop(now: number) {
      raf = requestAnimationFrame(loop)
      if (now - last < FRAME_MS) return
      last = now
      draw(now)
    }

    function play() {
      cancelAnimationFrame(raf)
      if (reduceMotion.matches || document.hidden) {
        draw(performance.now()) // one still frame
        return
      }
      raf = requestAnimationFrame(loop)
    }

    applyTheme()
    resize()
    play()

    // Re-tint when the theme class flips; re-fit on resize; pause when hidden.
    const observer = new MutationObserver(() => {
      applyTheme()
      draw(performance.now())
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    const onResize = () => {
      resize()
      draw(performance.now())
    }
    window.addEventListener("resize", onResize)
    document.addEventListener("visibilitychange", play)
    reduceMotion.addEventListener("change", play)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener("resize", onResize)
      document.removeEventListener("visibilitychange", play)
      reduceMotion.removeEventListener("change", play)
      // Free GPU objects, but keep the context: StrictMode re-runs this effect
      // on the same canvas, and a lost context can never be revived.
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.deleteBuffer(buffer)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 size-full print:hidden"
    />
  )
}
