"use client";

import { useEffect, useRef } from "react";

/**
 * 登录页背景：蓝色半调螺旋。
 *
 * 两组阿基米德螺旋叠加：
 *   spiral = (1 + cos(k·r + 扭转·θ)) / 2
 * 把叠加值映射成圆点大小与深浅，形成带弧带的半调纹理。
 *
 * 动态来自"整体缓慢旋转"这一恒等变换：两组螺旋的相位都含 θ 项，把整张图旋转 φ，
 * 等价于同时给两个相位加上 扭转·φ 的偏移——旋转能精确复现出逐帧推移相位的流动感。
 *
 * 所以只在挂载时把纹理画一次，之后交给 CSS 的 rotate 动画：
 * 主线程 0 负担、GPU 合成器跑满刷新率（实测 8 秒内 main-thread 任务约 15ms）。
 * 画布按视口放大到足以覆盖旋转后的四角，中心的光晕半径也大于视口对角线，
 * 避免旋转到任意角度时露出画布边缘或出现硬切边。
 */

const TWIST_A = 3.6;
const TWIST_B = -2.8;
const FREQ_A = 36;
const FREQ_B = 20;
const CELL = 5;
/** 相对视口的放大倍数，保证旋转到 45° 时四角仍被覆盖 */
const ZOOM = 1.45;

type RGB = { r: number; g: number; b: number };

function parseRgb(value: string): RGB | null {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null;
  return { r: parts[0], g: parts[1], b: parts[2] };
}

function tint(color: RGB, amount: number): RGB {
  return {
    r: Math.round(color.r + (255 - color.r) * amount),
    g: Math.round(color.g + (255 - color.g) * amount),
    b: Math.round(color.b + (255 - color.b) * amount),
  };
}

function rgbCss(color: RGB) {
  return `rgb(${color.r} ${color.g} ${color.b})`;
}

export function HalftoneSpiral() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const node: HTMLCanvasElement = canvas;
    const context2d = node.getContext("2d");
    if (!context2d) return;
    const ctx: CanvasRenderingContext2D = context2d;
    const stage = canvas.parentElement;

    const styles = getComputedStyle(document.documentElement);
    const accent =
      parseRgb(styles.getPropertyValue("--accent").trim()) ?? {
        r: 47,
        g: 99,
        b: 230,
      };
    const surface =
      parseRgb(styles.getPropertyValue("--surface").trim()) ?? {
        r: 255,
        g: 255,
        b: 255,
      };
    const inkColor = tint(accent, 0.26);
    const baseColor = tint(accent, 0.94);

    function draw() {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const size =
        Math.max(viewportWidth, viewportHeight, viewportWidth * 1.2, viewportHeight * 1.2) *
        ZOOM;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixels = Math.round(size * dpr);
      node.width = pixels;
      node.height = pixels;
      node.style.width = `${size}px`;
      node.style.height = `${size}px`;
      if (stage) {
        stage.style.width = `${size}px`;
        stage.style.height = `${size}px`;
        stage.style.left = `${(viewportWidth - size) / 2}px`;
        stage.style.top = `${(viewportHeight - size) / 2}px`;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      // 浅色底：先铺满整块画布，任何角度都不会看到画布边界
      ctx.fillStyle = rgbCss(baseColor);
      ctx.fillRect(0, 0, size, size);

      const cols = Math.ceil(size / CELL);
      const rows = Math.ceil(size / CELL);
      const center = size / 2;
      const radius = center;

      ctx.fillStyle = rgbCss(inkColor);
      for (let row = 0; row < rows; row += 1) {
        const y = row * CELL + CELL / 2;
        for (let c = 0; c < cols; c += 1) {
          const x = c * CELL + CELL / 2;
          const distance = Math.hypot(x - center, y - center) || 1;
          const angle = Math.atan2(y - center, x - center);
          const r = distance / radius;

          const wa = Math.cos(r * FREQ_A + TWIST_A * angle) + 1;
          const wb = Math.cos(r * FREQ_B + TWIST_B * angle) + 1;

          const raw = wa * wb * 0.25;
          const clamped = raw > 1 ? 1 : raw < 0 ? 0 : raw;
          const eased = clamped * clamped * (3 - 2 * clamped);

          const dotRadius = (0.26 + (1 - eased) * 0.74) * CELL * 1.1;
          ctx.globalAlpha = 0.04 + (1 - eased) * 0.22;
          ctx.beginPath();
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // 中心留白：半径取画布对角线的 1.15 倍，最外层透明，绝不在画布内出现硬切边
      const veilRadius = Math.hypot(size, size) * 0.575;
      const veil = ctx.createRadialGradient(
        center,
        center,
        0,
        center,
        center,
        veilRadius,
      );
      veil.addColorStop(0, `rgba(${surface.r}, ${surface.g}, ${surface.b}, 0.72)`);
      veil.addColorStop(0.26, `rgba(${surface.r}, ${surface.g}, ${surface.b}, 0.5)`);
      veil.addColorStop(0.52, `rgba(${surface.r}, ${surface.g}, ${surface.b}, 0.2)`);
      veil.addColorStop(0.78, `rgba(${surface.r}, ${surface.g}, ${surface.b}, 0.05)`);
      veil.addColorStop(1, `rgba(${surface.r}, ${surface.g}, ${surface.b}, 0)`);
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, size, size);
    }

    draw();

    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(draw, 180);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <div className="absolute origin-center animate-[zouzou-spiral-drift_40s_linear_infinite]">
        <canvas ref={canvasRef} className="block" />
      </div>
    </div>
  );
}
