import { useEffect, useRef } from 'react';
import { cn } from '../../styles/cn.js';
import { dotGridStyles } from './styles.js';

const gap = 18;
const radius = 1;
const proximity = 120;
const push = 7;

/**
 * 点阵与 `dotgridStyles` 的 18px 栅格对齐，静止时只绘制一次；指针靠近的点被推开并染上 `--brand`，
 * 离开后弹回原位，回到静止即停止逐帧绘制。减少动态效果时不响应指针。
 */
export function DotGrid({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    const context =
      typeof CanvasRenderingContext2D === 'undefined' ? null : canvas?.getContext('2d');
    if (!canvas || !host || !context) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    // 每个点 6 个分量：静止位置 x/y、偏移 x/y、速度 x/y。
    let dots = new Float32Array(0);
    let width = 0;
    let height = 0;
    let frame = 0;
    let baseColor = '';
    let activeColor = '';
    let baseAlpha = 0;
    const pointer = { x: 0, y: 0, inside: false };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      context.globalAlpha = baseAlpha;
      context.fillStyle = baseColor;
      context.beginPath();
      for (let i = 0; i < dots.length; i += 6) {
        context.moveTo(dots[i] + dots[i + 2] + radius, dots[i + 1] + dots[i + 3]);
        context.arc(dots[i] + dots[i + 2], dots[i + 1] + dots[i + 3], radius, 0, Math.PI * 2);
      }
      context.fill();
      if (!pointer.inside) return;
      context.fillStyle = activeColor;
      for (let i = 0; i < dots.length; i += 6) {
        const near = 1 - Math.hypot(dots[i] - pointer.x, dots[i + 1] - pointer.y) / proximity;
        if (near <= 0) continue;
        context.globalAlpha = near * 0.8;
        context.beginPath();
        context.arc(
          dots[i] + dots[i + 2],
          dots[i + 1] + dots[i + 3],
          radius * (1 + near * 1.2),
          0,
          Math.PI * 2,
        );
        context.fill();
      }
    };
    const step = () => {
      frame = 0;
      let moving = false;
      for (let i = 0; i < dots.length; i += 6) {
        let targetX = 0;
        let targetY = 0;
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
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const columns = Math.ceil(width / gap);
      const rows = Math.ceil(height / gap);
      dots = new Float32Array(columns * rows * 6);
      for (let row = 0; row < rows; row++)
        for (let column = 0; column < columns; column++) {
          const i = (row * columns + column) * 6;
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
    const move = (event: PointerEvent) => {
      if (reducedMotion.matches) return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.inside = true;
      wake();
    };
    const leave = () => {
      pointer.inside = false;
      wake();
    };
    const sizeObserver = new ResizeObserver(resize);
    const themeObserver = new MutationObserver(updateColor);
    sizeObserver.observe(canvas);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-palette', 'data-theme'],
    });
    host.addEventListener('pointermove', move, { passive: true });
    host.addEventListener('pointerleave', leave);
    reducedMotion.addEventListener('change', leave);
    updateColor();
    resize();

    return () => {
      cancelAnimationFrame(frame);
      sizeObserver.disconnect();
      themeObserver.disconnect();
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerleave', leave);
      reducedMotion.removeEventListener('change', leave);
    };
  }, []);

  return <canvas ref={canvasRef} className={cn(dotGridStyles, className)} aria-hidden="true" />;
}
