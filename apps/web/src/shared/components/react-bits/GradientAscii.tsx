import { useEffect, useRef } from 'react';
import { gradientAsciiStyles } from './styles.js';

const characters = [' ', '.', '·', ':', '+'];
const cellHeight = 14;
const cellAspect = 0.6;

const vertexSource = `#version 300 es
void main() {
  vec2 point = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(point * 2.0 - 1.0, 0.0, 1.0);
}`;

const fragmentSource = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uAtlas;
uniform ivec2 uCell;
uniform vec2 uResolution;
uniform float uTime;
uniform float uCount;
uniform vec3 uColor;
out vec4 outColor;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

vec2 gradient(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.103, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy) * 2.0 - 1.0;
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(gradient(i), f);
  float b = dot(gradient(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(gradient(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(gradient(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return 0.5 + 0.5 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  ivec2 cell = pixel / uCell;
  ivec2 local = pixel - cell * uCell;
  vec2 uv = (vec2(cell) + 0.5) * vec2(uCell) / uResolution;
  vec2 p = (uv - 1.0) * vec2(uResolution.x / uResolution.y, 1.0);
  p += (vec2(noise(p * 1.6 + vec2(0.0, uTime)), noise(p * 1.6 + vec2(4.3, -uTime * 0.8))) - 0.5) * 0.28;
  float angle = atan(p.y, p.x);
  float reach = 0.62 + 0.26 * noise(vec2(cos(angle), sin(angle)) * 2.2 + uTime * 0.8);
  float glow = pow(clamp(1.0 - length(p) / reach, 0.0, 1.0), 1.3);
  float wave = 0.5 + 0.5 * sin(length(p) * 16.0 - uTime * 30.0);
  float level = hash(vec2(cell) + 0.37);
  float tick = floor(uTime * 25.0 + level * 25.0);
  float twinkle = (hash(vec2(cell) * 2.31 + tick * 17.7) - 0.5) * 0.18;
  float tone = clamp(pow(glow, 0.7) * (0.7 + 0.45 * wave) + twinkle, 0.0, 1.0);
  int index = int(floor(tone * (uCount - 1.0) + 0.5));
  float present = step(hash(vec2(cell) * 1.73 + 4.1), 0.25 + glow * 1.2);
  float coverage = texelFetch(uAtlas, ivec2(index * uCell.x + local.x, uCell.y - 1 - local.y), 0).a;
  float alpha = coverage * present * smoothstep(0.02, 0.2, glow) * (0.35 + 0.65 * glow) + glow * glow * 0.22;
  outColor = vec4(uColor * alpha, alpha);
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

/**
 * 字符图集按设备像素逐格绘制，着色器用 `texelFetch` 取样，字形不经缩放滤波；
 * 只用 alpha 通道作覆盖率，颜色统一由 `--brand` 着色。
 */
function drawAtlas(width: number, height: number, font: string) {
  const atlas = document.createElement('canvas');
  atlas.width = width * characters.length;
  atlas.height = height;
  const context = atlas.getContext('2d');
  if (!context) return null;
  context.font = `${Math.round(height * 0.8)}px ${font}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  characters.forEach((character, index) =>
    context.fillText(character, (index + 0.5) * width, height / 2),
  );
  return atlas;
}

/** 装饰画布独立于登录流程；不可用时透出底色，隐藏或暂停时不持续绘制。光晕固定在右上角，避开左侧标题。 */
export function GradientAscii({ paused = false }: { paused?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  const syncRef = useRef<(() => void) | null>(null);
  pausedRef.current = paused;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof WebGL2RenderingContext === 'undefined') return;
    let gl: WebGL2RenderingContext | null;
    try {
      gl = canvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power',
      });
    } catch {
      return;
    }
    if (!gl) return;
    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    const texture = gl.createTexture();
    const dispose = () => {
      gl.deleteTexture(texture);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
    if (!vertex || !fragment || !program || !texture) {
      dispose();
      return;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      dispose();
      return;
    }
    gl.useProgram(program);
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (const name of ['uAtlas', 'uCell', 'uResolution', 'uTime', 'uCount', 'uColor'])
      uniforms[name] = gl.getUniformLocation(program, name);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(uniforms.uAtlas, 0);
    gl.uniform1f(uniforms.uCount, characters.length);
    gl.clearColor(0, 0, 0, 0);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let last = 0;
    let time = 0;
    let cell = '';
    let visible = true;
    let alive = true;
    const canDraw = () => alive && visible && !document.hidden && !gl.isContextLost();
    const draw = () => {
      if (!canDraw() || !cell) return;
      gl.uniform1f(uniforms.uTime, time);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const tick = (now: number) => {
      frame = 0;
      if (!canDraw() || pausedRef.current || reducedMotion.matches) return;
      time += (last ? Math.min(50, now - last) : 0) * 0.0001;
      last = now;
      draw();
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      draw();
      if (canDraw() && !pausedRef.current && !reducedMotion.matches)
        frame = requestAnimationFrame(tick);
    };
    const resize = () => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5, 1600 / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      const cellH = Math.max(8, Math.round(cellHeight * dpr));
      const cellW = Math.max(5, Math.round(cellH * cellAspect));
      if (cell !== `${cellW}x${cellH}`) {
        const font = getComputedStyle(canvas).getPropertyValue('--font-mono').trim() || 'monospace';
        const atlas = drawAtlas(cellW, cellH, font);
        if (atlas) {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
          gl.uniform2i(uniforms.uCell, cellW, cellH);
          cell = `${cellW}x${cellH}`;
        }
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
      sync();
    };
    const updateColor = () => {
      const color = getComputedStyle(canvas).getPropertyValue('--brand').trim();
      if (!/^#[\da-f]{6}$/i.test(color)) return;
      gl.uniform3fv(
        uniforms.uColor,
        [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255),
      );
      sync();
    };
    const loseContext = () => {
      delete canvas.dataset.backgroundReady;
      sync();
    };
    const sizeObserver = new ResizeObserver(resize);
    const visibilityObserver = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      sync();
    });
    const themeObserver = new MutationObserver(updateColor);
    sizeObserver.observe(canvas);
    visibilityObserver.observe(canvas);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-palette', 'data-theme'],
    });
    document.addEventListener('visibilitychange', sync);
    reducedMotion.addEventListener('change', sync);
    canvas.addEventListener('webglcontextlost', loseContext);
    resize();
    updateColor();
    canvas.dataset.backgroundReady = '';
    syncRef.current = sync;

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      syncRef.current = null;
      delete canvas.dataset.backgroundReady;
      sizeObserver.disconnect();
      visibilityObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener('visibilitychange', sync);
      reducedMotion.removeEventListener('change', sync);
      canvas.removeEventListener('webglcontextlost', loseContext);
      dispose();
    };
  }, []);

  useEffect(() => {
    syncRef.current?.();
  }, [paused]);

  return <canvas ref={canvasRef} className={gradientAsciiStyles} aria-hidden="true" />;
}
