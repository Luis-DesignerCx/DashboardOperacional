"use client";

/* Rastro de mouse em SVG: pool fixo de <path>, e a cada frame TODOS os
   elementos do pool têm seu estado redefinido do zero (geometria, cor,
   opacidade -- ou escondido com opacity 0 se não estiver em uso). Não existe
   nenhum passo de "limpar" separado do desenho -- por construção não há como
   sobrar resíduo, porque cada frame já é o estado final completo.

   (Primeira tentativa usava <canvas> com clearRect manual; em uso real e
   prolongado formava um acúmulo de traços numa faixa da tela que não
   conseguimos reproduzir nem diagnosticar -- essa versão elimina a categoria
   inteira do problema em vez de caçar a causa exata.) */

import { useEffect, useRef } from "react";

const BRAND_COLORS = ["#db824e", "#d1517a", "#9f5697", "#4c3d8d", "#516cb1", "#6ab0a0"];
const MAX_AGE_MS = 750;
const POOL_SIZE = 80;
const LINE_WIDTH = 3.5;

interface Ponto {
  x: number;
  y: number;
  t: number;
  cor: string;
}

export function GradientCursorTrail({ className }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const poolRef = useRef<(SVGPathElement | null)[]>([]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    let pontos: Ponto[] = [];
    let corAtualIndex = 0;
    let rafId = 0;
    let lastX = -1;
    let lastY = -1;

    const handleMove = (e: MouseEvent) => {
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (lastX < 0) { lastX = x; lastY = y; return; }
      const dist = Math.hypot(x - lastX, y - lastY);
      if (dist < 4) return;
      lastX = x; lastY = y;
      pontos.push({ x, y, t: performance.now(), cor: BRAND_COLORS[corAtualIndex] });
      if (pontos.length > POOL_SIZE) pontos = pontos.slice(-POOL_SIZE);
    };

    const handleClick = () => {
      corAtualIndex = (corAtualIndex + 1) % BRAND_COLORS.length;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("click", handleClick);

    const draw = () => {
      const now = performance.now();
      pontos = pontos.filter((p) => now - p.t < MAX_AGE_MS);

      const pool = poolRef.current;
      let ativos = 0;

      for (let i = 1; i < pontos.length - 1 && ativos < POOL_SIZE; i++) {
        const p0 = pontos[i - 1];
        const p1 = pontos[i];
        const p2 = pontos[i + 1];
        const idade = (now - p1.t) / MAX_AGE_MS;
        const opacidade = Math.max(0, 1 - idade);
        const path = pool[ativos];
        if (!path) { ativos++; continue; }

        if (opacidade <= 0) {
          path.setAttribute("opacity", "0");
          ativos++;
          continue;
        }

        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const startX = (p0.x + p1.x) / 2;
        const startY = (p0.y + p1.y) / 2;

        path.setAttribute("d", `M ${startX} ${startY} Q ${p1.x} ${p1.y} ${midX} ${midY}`);
        path.setAttribute("stroke", p1.cor);
        path.setAttribute("stroke-width", String(LINE_WIDTH * (0.4 + 0.6 * opacidade)));
        path.setAttribute("opacity", String(opacidade));
        ativos++;
      }

      // Todo slot do pool que não foi usado neste frame fica explicitamente
      // escondido -- garante que nunca sobra geometria de um frame anterior.
      for (let i = ativos; i < pool.length; i++) {
        pool[i]?.setAttribute("opacity", "0");
      }

      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("click", handleClick);
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      className={className ?? "absolute inset-0 pointer-events-none"}
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      <defs>
        <filter id="trail-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#trail-glow)" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {Array.from({ length: POOL_SIZE }, (_, i) => (
          <path
            key={i}
            ref={(el) => { poolRef.current[i] = el; }}
            opacity="0"
          />
        ))}
      </g>
    </svg>
  );
}

export default GradientCursorTrail;
