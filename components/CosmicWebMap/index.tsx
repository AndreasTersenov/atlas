"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VIEW_H, VIEW_W } from "./colors";
import { renderHoverOverlay, renderStatic } from "./renderer";
import type { Filament, Halo } from "./types";

interface Props {
  halos: Halo[];
  filaments: Filament[];
  // When set, halo clicks navigate to `${linkPrefix}${haloId}` instead of
  // logging. Cockpit passes "/cockpit/" to get per-halo command panels; the
  // public map omits it so clicks stay no-ops until v2 ships `/p/[halo-id]`.
  linkPrefix?: string;
}

const ASPECT = VIEW_W / VIEW_H;

export default function CosmicWebMap({ halos, filaments, linkPrefix }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const staticRef = useRef<HTMLCanvasElement | null>(null);
  const dprRef = useRef(1);
  const sizeRef = useRef({ w: 0, h: 0 });

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Render: blit cached static, then optionally hover overlay.
  const repaint = () => {
    const canvas = canvasRef.current;
    const cached = staticRef.current;
    if (!canvas || !cached) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = dprRef.current;
    const { w, h } = sizeRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(cached, 0, 0);
    if (hoveredId) {
      const halo = halos.find((x) => x.id === hoveredId);
      if (halo) {
        ctx.setTransform(dpr * (w / VIEW_W), 0, 0, dpr * (h / VIEW_H), 0, 0);
        renderHoverOverlay(ctx, halo);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
    }
  };

  // Build the static cache for the current size.
  const rebuildStatic = () => {
    const { w, h } = sizeRef.current;
    if (w === 0 || h === 0) return;
    const dpr = dprRef.current;
    const off = staticRef.current ?? document.createElement("canvas");
    off.width = Math.round(w * dpr);
    off.height = Math.round(h * dpr);
    staticRef.current = off;
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    offCtx.setTransform(dpr * (w / VIEW_W), 0, 0, dpr * (h / VIEW_H), 0, 0);
    renderStatic(offCtx, { halos, filaments });
  };

  // Resize observer: keep the canvas backing store in sync with CSS size.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const apply = () => {
      const rect = container.getBoundingClientRect();
      // Fit a 730x640 area into the container, preserving aspect.
      let w = rect.width;
      let h = rect.height;
      if (w / h > ASPECT) w = h * ASPECT;
      else h = w / ASPECT;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { w, h };
      dprRef.current = dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      rebuildStatic();
      repaint();
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(container);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [halos, filaments]);

  // Repaint when hover changes.
  useEffect(() => {
    repaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredId]);

  // Hit-test: convert client coords to view coords, find nearest halo within radius.
  const hitTest = (clientX: number, clientY: number): Halo | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * VIEW_W;
    const y = ((clientY - rect.top) / rect.height) * VIEW_H;
    let best: Halo | null = null;
    let bestDist = Infinity;
    for (const h of halos) {
      const d = Math.hypot(x - h.position_x, y - h.position_y);
      if (d <= h.radius && d < bestDist) {
        best = h;
        bestDist = d;
      }
    }
    return best;
  };

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitTest(e.clientX, e.clientY);
    const newId = hit?.id ?? null;
    if (newId !== hoveredId) setHoveredId(newId);
  };

  const onLeave = () => setHoveredId(null);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitTest(e.clientX, e.clientY);
    if (!hit) return;
    if (linkPrefix) {
      router.push(`${linkPrefix}${hit.id}`);
      return;
    }
    console.log("[atlas] halo clicked:", hit.id, hit);
  };

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center"
    >
      <canvas
        ref={canvasRef}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onClick={onClick}
        role="img"
        aria-label="Atlas — a personal cosmic web of projects"
        style={{
          cursor: hoveredId ? "pointer" : "default",
          display: "block",
        }}
      />
    </div>
  );
}
