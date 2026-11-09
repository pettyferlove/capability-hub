import { useEffect, useRef } from 'react';
import { threadsStyles } from './styles.js';

const vertexSource = `#version 300 es
precision highp float;
in vec2 aPoint;
uniform float uTime;
uniform float uCount;
uniform vec2 uResolution;
uniform vec2 uFrame;
uniform vec2 uTurn;
out float vEdge;
out float vBand;
out float vDraw;
out float vAlpha;

float Perlin2D(vec2 P) {
  vec2 Pi = floor(P);
  vec4 Pf_Pfmin1 = P.xyxy - vec4(Pi, Pi + 1.0);
  vec4 Pt = vec4(Pi.xy, Pi.xy + 1.0);
  Pt = Pt - floor(Pt * (1.0 / 71.0)) * 71.0;
  Pt += vec2(26.0, 161.0).xyxy;
  Pt *= Pt;
  Pt = Pt.xzxz * Pt.yyww;
  vec4 hash_x = fract(Pt * (1.0 / 951.135664));
  vec4 hash_y = fract(Pt * (1.0 / 642.949883));
  vec4 grad_x = hash_x - 0.49999;
  vec4 grad_y = hash_y - 0.49999;
  vec4 grad_results = inversesqrt(grad_x * grad_x + grad_y * grad_y)
    * (grad_x * Pf_Pfmin1.xzxz + grad_y * Pf_Pfmin1.yyww);
  grad_results *= 1.4142135623730950;
  vec2 blend = Pf_Pfmin1.xy * Pf_Pfmin1.xy * Pf_Pfmin1.xy
    * (Pf_Pfmin1.xy * (Pf_Pfmin1.xy * 6.0 - 15.0) + 10.0);
  vec4 blend2 = vec4(blend, vec2(1.0 - blend));
  return dot(grad_results, blend2.zxzx * blend2.wwyy);
}

void main() {
  float perc = float(gl_InstanceID) / uCount;
  float x = aPoint.x;
  float pixel = 1.0 / max(uResolution.x, uResolution.y);
  float splitPoint = 0.04 + perc * 0.5;
  float amplitude = smoothstep(splitPoint, max(0.7, splitPoint + 0.2), x) * 0.7;
  float timeScaled = uTime / 10.0;
  float blur = smoothstep(splitPoint, splitPoint + 0.05, x) * perc;
  float xnoise = mix(
    Perlin2D(vec2(timeScaled * 2.5, (x * 1.05 + perc) * 2.5)),
    Perlin2D(vec2(timeScaled * 3.5, (x * 1.05 + timeScaled) * 3.5)) / 1.5,
    x * 0.3
  );
  float y = 0.5 + (perc - 0.5) * 0.4 + xnoise / 2.0 * amplitude;
  vec2 local = vec2((x - 0.5) * uFrame.x, (y - 0.5) * uFrame.y);
  float width = 4.9 * pixel * (1.0 - perc);
  float band = (width / 2.0 + 13.0 * pixel * blur) * uFrame.y;
  float draw = max(band, 1.0);
  local.y += aPoint.y * draw;
  vec2 turned = vec2(local.x * uTurn.x - local.y * uTurn.y, local.x * uTurn.y + local.y * uTurn.x);
  gl_Position = vec4(turned / (uResolution * 0.5), 0.0, 1.0);
  vEdge = aPoint.y * draw;
  vBand = band;
  vDraw = draw;
  vAlpha = 1.0 - smoothstep(0.0, 1.0, pow(perc, 0.3)) * 0.85;
}`;

const fragmentSource = `#version 300 es
precision highp float;
in float vEdge;
in float vBand;
in float vDraw;
in float vAlpha;
uniform vec3 uColor;
out vec4 outColor;
void main() {
  float coverage = (1.0 - smoothstep(0.0, vDraw, abs(vEdge))) * (vBand / vDraw) * vAlpha;
  outColor = vec4(uColor * coverage, coverage);
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

/** 装饰画布独立于登录流程；不可用时透出底色，隐藏或暂停时不持续绘制。 */
export function Threads({ paused = false }: { paused?: boolean }) {
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
    const buffer = gl.createBuffer();
    const dispose = () => {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
    if (!vertex || !fragment || !program || !buffer) {
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
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const point = gl.getAttribLocation(program, 'aPoint');
    gl.enableVertexAttribArray(point);
    gl.vertexAttribPointer(point, 2, gl.FLOAT, false, 0, 0);
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (const name of ['uTime', 'uCount', 'uResolution', 'uFrame', 'uTurn', 'uColor'])
      uniforms[name] = gl.getUniformLocation(program, name);
    const count = 64;
    const angle = (25 * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    gl.uniform1f(uniforms.uCount, count);
    gl.uniform2f(uniforms.uTurn, cos, sin);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let last = 0;
    let time = 0;
    let segments = 0;
    let visible = true;
    let alive = true;
    const canDraw = () => alive && visible && !document.hidden && !gl.isContextLost();
    const draw = () => {
      if (!canDraw()) return;
      gl.uniform1f(uniforms.uTime, time);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, (segments + 1) * 2, count);
    };
    const tick = (now: number) => {
      frame = 0;
      if (!canDraw() || pausedRef.current || reducedMotion.matches) return;
      time += (last ? Math.min(50, now - last) : 0) * 0.0004;
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
      segments = Math.min(320, Math.max(96, Math.round(width / 3)));
      const points = new Float32Array((segments + 1) * 4);
      for (let i = 0; i <= segments; i++) points.set([i / segments, -1, i / segments, 1], i * 4);
      gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
      gl.uniform2f(
        uniforms.uFrame,
        canvas.width * cos + canvas.height * sin,
        canvas.width * sin + canvas.height * cos,
      );
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
      delete canvas.dataset.threadsReady;
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
    canvas.dataset.threadsReady = '';
    syncRef.current = sync;

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      syncRef.current = null;
      delete canvas.dataset.threadsReady;
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

  return <canvas ref={canvasRef} className={threadsStyles} aria-hidden="true" />;
}
