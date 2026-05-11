import { useEffect, useRef } from "react";

export default function DotBackground({ spacing = 18, radius = 1, baseAlpha = 0.05, pulseAlpha = 0.32, speed = 1, color = [255, 255, 255] }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    const BUCKETS = 16;
    let w = 0, h = 0;
    let xs = null, ys = null;
    let raf;
    const start = performance.now();
    const FRAME_MS = 33;
    let lastFrame = 0;

    function resize() {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.max(1, Math.floor(w));
      canvas.height = Math.max(1, Math.floor(h));
      const cols = Math.ceil(w / spacing) + 1;
      const rows = Math.ceil(h / spacing) + 1;
      xs = new Float32Array(cols);
      ys = new Float32Array(rows);
      for (let i = 0; i < cols; i++) xs[i] = i * spacing;
      for (let j = 0; j < rows; j++) ys[j] = j * spacing;
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (now - lastFrame < FRAME_MS) return;
      lastFrame = now;

      const t = ((now - start) / 1000) * speed;
      ctx.clearRect(0, 0, w, h);

      const cx1 = w * (0.3 + 0.2 * Math.sin(t * 0.13));
      const cy1 = h * (0.4 + 0.18 * Math.cos(t * 0.11));
      const cx2 = w * (0.7 + 0.15 * Math.cos(t * 0.09));
      const cy2 = h * (0.6 + 0.2 * Math.sin(t * 0.07));
      const invMaxR = 1 / Math.hypot(w, h);
      const tw1 = t * 1.2;
      const tw2 = t * 0.9;

      const cols = xs.length, rows = ys.length;
      const buckets = new Array(BUCKETS);
      for (let b = 0; b < BUCKETS; b++) buckets[b] = [];

      const range = pulseAlpha - baseAlpha;
      const size = radius * 2;

      for (let j = 0; j < rows; j++) {
        const y = ys[j];
        const dy1v = y - cy1;
        const dy2v = y - cy2;
        for (let i = 0; i < cols; i++) {
          const x = xs[i];
          const ex1 = x - cx1, ey1 = dy1v;
          const ex2 = x - cx2, ey2 = dy2v;
          const d1 = Math.sqrt(ex1 * ex1 + ey1 * ey1) * invMaxR;
          const d2 = Math.sqrt(ex2 * ex2 + ey2 * ey2) * invMaxR;
          const combined = (Math.sin(d1 * 14 - tw1) + Math.sin(d2 * 11 - tw2)) * 0.5;
          const intensity = (combined + 1) * 0.5;
          let b = (intensity * (BUCKETS - 1)) | 0;
          if (b < 0) b = 0; else if (b > BUCKETS - 1) b = BUCKETS - 1;
          buckets[b].push(x - radius, y - radius);
        }
      }

      for (let b = 0; b < BUCKETS; b++) {
        const arr = buckets[b];
        if (arr.length === 0) continue;
        const intensity = b / (BUCKETS - 1);
        const alpha = baseAlpha + intensity * range;
        ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha.toFixed(3)})`;
        for (let k = 0; k < arr.length; k += 2) {
          ctx.fillRect(arr[k], arr[k + 1], size, size);
        }
      }
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    raf = requestAnimationFrame(frame);

    function visHandler() {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        lastFrame = 0;
        raf = requestAnimationFrame(frame);
      }
    }
    document.addEventListener("visibilitychange", visHandler);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", visHandler);
    };
  }, [spacing, radius, baseAlpha, pulseAlpha, speed]);

  return <canvas ref={canvasRef} className="dot-bg-canvas" />;
}
