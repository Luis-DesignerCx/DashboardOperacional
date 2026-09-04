"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Lembra até onde o usuário rolou cada tela do dashboard e restaura ao voltar
// pra ela -- ex: sai de "Carteira" no meio da lista, vai pro Dashboard, volta
// pra Carteira: continua exatamente de onde parou, em vez de reiniciar do
// topo. Um único ponto (chamado no layout do dashboard, que não desmonta
// entre navegações) cobre todas as telas, sem precisar mexer em cada uma.
export function useScrollMemory(containerId: string) {
  const pathname = usePathname();

  useEffect(() => {
    const el = document.getElementById(containerId);
    if (!el) return;

    const key = `scroll:${pathname}`;
    let target = 0;
    try {
      target = Number(sessionStorage.getItem(key) ?? 0);
    } catch {
      // sessionStorage indisponível (aba privada etc.) -- segue sem restaurar
    }

    // O conteúdo da tela nova pode carregar aos poucos (fetch assíncrono),
    // então a altura rolável só fica correta depois de um tempo -- tenta
    // restaurar em alguns instantes espaçados, não só uma vez.
    let cancelado = false;
    const tentativas = [0, 60, 150, 300, 600, 1000, 1800, 3000];
    const timers = tentativas.map((delay) =>
      setTimeout(() => {
        if (!cancelado) el.scrollTop = target;
      }, delay)
    );

    function onScroll() {
      try {
        sessionStorage.setItem(key, String(el!.scrollTop));
      } catch {
        // ignora se sessionStorage não estiver disponível
      }
    }
    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      cancelado = true;
      timers.forEach(clearTimeout);
      el.removeEventListener("scroll", onScroll);
    };
  }, [pathname, containerId]);
}
