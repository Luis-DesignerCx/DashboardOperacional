"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Lembra até onde o usuário rolou cada tela do dashboard e restaura ao
// voltar pra ela depois de visitar outra tela -- ex: sai de "Carteira" no
// meio da lista, vai pro Dashboard, volta pra Carteira: continua exatamente
// de onde parou, em vez de reiniciar do topo. Um único ponto (chamado no
// layout do dashboard, que não desmonta entre navegações) cobre todas as
// telas, sem precisar mexer em cada uma.
//
// NOTA: esse hook já teve uma versão que também tentava restaurar a
// rolagem quando a PRÓPRIA tela recarregava os dados no lugar (ex: registrar
// um atendimento em "Minha Carteira"). Foi removida -- deu problema duas
// vezes (a correção "brigava" com trocas de filtro client-side, fazendo a
// lista parecer travada na seleção anterior até recarregar a página). Se
// for reintroduzir isso, precisa de um jeito bem mais confiável de
// distinguir "recarregamento de dados de verdade" de "qualquer mudança no
// conteúdo" antes de arriscar de novo.
export function useScrollMemory(containerId: string) {
  const pathname = usePathname();

  useEffect(() => {
    const el = document.getElementById(containerId);
    if (!el) return;

    const key = `scroll:${pathname}`;
    let alvo = 0;
    try {
      alvo = Number(sessionStorage.getItem(key) ?? 0);
    } catch {
      // sessionStorage indisponível (aba privada etc.) -- segue sem restaurar
    }

    let cancelado = false;

    // O conteúdo da tela nova pode carregar aos poucos (fetch assíncrono),
    // então a altura rolável só fica correta depois de um tempo -- tenta
    // restaurar em alguns instantes espaçados, não só uma vez.
    const tentativas = [0, 60, 150, 300, 600, 1000, 1800, 3000];
    const timers = tentativas.map((delay) =>
      setTimeout(() => {
        if (!cancelado) el.scrollTop = alvo;
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
