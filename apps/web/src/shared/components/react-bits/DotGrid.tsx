import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { cn } from '../../styles/cn.js';
import { dotGridStyles } from './styles.js';

const gap = 18;
const radius = 1;
const proximity = 120;
const push = 7;
const rippleSpeed = 640;
const rippleBand = 96;
const ripplePush = 10;
// 每个点 7 个分量：静止位置 x/y、偏移 x/y、速度 x/y、波纹亮度。
const stride = 7;

/** 通过 `ref` 拿到的句柄：以视口坐标为圆心向外推一圈波纹，`strength` 取 0–1；减少动态效果时忽略。 */
export interface DotGridHandle {
  ripple: (clientX: number, clientY: number, strength?: number) => void;
}

/**
 * 点阵与 `dotgridStyles` 的 18px 栅格对齐，静止时只绘制一次。指针落在画布范围内时附近的点被推开并染上
 * `--brand`，即使上方有内容遮挡；`ripple` 发出的波纹沿途推开并点亮经过的点。回到静止即停止逐帧绘制，
 * 减少动态效果时不响应指针与波纹。
 */
export function DotGrid({ className, ref }: { className?: string; ref?: Ref<DotGridHandle> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rippleRef = useRef<DotGridHandle['ripple']>(() => undefined);
  useImperativeHandle(
    ref,
    () => ({
      ripple: (clientX, clientY, strength) => rippleRef.current(clientX, clientY, strength),
    }),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const context =
      typeof CanvasRenderingContext2D === 'undefined' ? null : canvas?.getContext('2d');
    if (!canvas || !context) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let dots = new Float32Array(0);
    let width = 0;
    let height = 0;
    let reach = 1;
    let frame = 0;
    let baseColor = '';
    let activeColor = '';
    let baseAlpha = 0;
    const pointer = { x: 0, y: 0, inside: false };
    const ripples: { x: number; y: number; start: number; strength: number }[] = [];

    const draw = () => {
      context.clearRect(0, 0, width, height);
      context.globalAlpha = baseAlpha;
      context.fillStyle = baseColor;
      context.beginPath();
      for (let i = 0; i < dots.length; i += stride) {
        context.moveTo(dots[i] + dots[i + 2] + radius, dots[i + 1] + dots[i + 3]);
        context.arc(dots[i] + dots[i + 2], dots[i + 1] + dots[i + 3], radius, 0, Math.PI * 2);
      }
      context.fill();
      if (!pointer.inside && !ripples.length) return;
      context.fillStyle = activeColor;
      for (let i = 0; i < dots.length; i += stride) {
        const near = pointer.inside
          ? 1 - Math.hypot(dots[i] - pointer.x, dots[i + 1] - pointer.y) / proximity
          : 0;
        const glow = Math.max(near, dots[i + 6]);
        if (glow <= 0) continue;
        context.globalAlpha = Math.min(1, glow) * 0.8;
        context.beginPath();
        context.arc(
          dots[i] + dots[i + 2],
          dots[i + 1] + dots[i + 3],
          radius * (1 + Math.min(1, glow) * 1.2),
          0,
          Math.PI * 2,
        );
        context.fill();
      }
    };
    const step = (now: number) => {
      frame = 0;
      for (let index = ripples.length - 1; index >= 0; index--)
        if (((now - ripples[index].start) / 1000) * rippleSpeed > reach + rippleBand)
          ripples.splice(index, 1);
      let moving = ripples.length > 0;
      for (let i = 0; i < dots.length; i += stride) {
        let targetX = 0;
        let targetY = 0;
        let glow = 0;
        if (pointer.inside) {
          const dx = dots[i] - pointer.x;
          const dy = dots[i + 1] - pointer.y;
          const distance = Math.hypot(dx, dy);
          if (distance > 0.01 && distance < proximity) {
            const force = (1 - distance / proximity) ** 2 * push;
            targetX = (dx / distance) * force;
            targetY = (dy / distance) * force;
          }
        }
        for (const ripple of ripples) {
          const dx = dots[i] - ripple.x;
          const dy = dots[i + 1] - ripple.y;
          const distance = Math.hypot(dx, dy);
          const front = (Math.max(0, now - ripple.start) / 1000) * rippleSpeed;
          const band = 1 - Math.abs(distance - front) / rippleBand;
          if (band <= 0 || distance < 0.01) continue;
          const force = band * band * ripple.strength * Math.max(0, 1 - front / reach);
          targetX += (dx / distance) * force * ripplePush;
          targetY += (dy / distance) * force * ripplePush;
          glow = Math.max(glow, force);
        }
        dots[i + 6] = glow;
        dots[i + 4] = (dots[i + 4] + (targetX - dots[i + 2]) * 0.12) * 0.78;
        dots[i + 5] = (dots[i + 5] + (targetY - dots[i + 3]) * 0.12) * 0.78;
        dots[i + 2] += dots[i + 4];
        dots[i + 3] += dots[i + 5];
        if (
          Math.abs(targetX - dots[i + 2]) + Math.abs(targetY - dots[i + 3]) > 0.02 ||
          Math.abs(dots[i + 4]) + Math.abs(dots[i + 5]) > 0.02
        )
          moving = true;
      }
      draw();
      if (moving) frame = requestAnimationFrame(step);
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(step);
    };
    const resize = () => {
      width = Math.max(1, canvas.clientWidth);
      height = Math.max(1, canvas.clientHeight);
      reach = Math.hypot(width, height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const columns = Math.ceil(width / gap);
      const rows = Math.ceil(height / gap);
      dots = new Float32Array(columns * rows * stride);
      for (let row = 0; row < rows; row++)
        for (let column = 0; column < columns; column++) {
          const i = (row * columns + column) * stride;
          dots[i] = gap / 2 + column * gap;
          dots[i + 1] = gap / 2 + row * gap;
        }
      draw();
    };
    const updateColor = () => {
      const style = getComputedStyle(canvas);
      baseColor = style.getPropertyValue('--muted-ink').trim();
      activeColor = style.getPropertyValue('--brand').trim();
      // 与 `--dot` 的 24% 墨色叠加 `--hero-dot-opacity` 后的静态点阵浓度一致。
      baseAlpha = 0.24 * (Number.parseFloat(style.getPropertyValue('--hero-dot-opacity')) || 0.22);
      draw();
    };
    // 在窗口上监听并按画布矩形判断，铺满整屏的画布在内容之下也能跟随指针；触摸不留下高亮。
    const move = (event: PointerEvent) => {
      if (reducedMotion.matches || event.pointerType === 'touch') return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      if (!inside && !pointer.inside) return;
      pointer.x = x;
      pointer.y = y;
      pointer.inside = inside;
      wake();
    };
    const leave = () => {
      pointer.inside = false;
      wake();
    };
    rippleRef.current = (clientX, clientY, strength = 1) => {
      if (reducedMotion.matches) return;
      const rect = canvas.getBoundingClientRect();
      ripples.push({
        x: clientX - rect.left,
        y: clientY - rect.top,
        start: performance.now(),
        strength,
      });
      if (ripples.length > 5) ripples.shift();
      wake();
    };
    const sizeObserver = new ResizeObserver(resize);
    const themeObserver = new MutationObserver(updateColor);
    sizeObserver.observe(canvas);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-palette', 'data-theme'],
    });
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    reducedMotion.addEventListener('change', leave);
    updateColor();
    resize();

    return () => {
      cancelAnimationFrame(frame);
      rippleRef.current = () => undefined;
      sizeObserver.disconnect();
      themeObserver.disconnect();
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
      reducedMotion.removeEventListener('change', leave);
    };
  }, []);

  return <canvas ref={canvasRef} className={cn(dotGridStyles, className)} aria-hidden="true" />;
}
