"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Lembra até onde o usuário rolou cada tela do dashboard e restaura:
// 1) ao voltar pra essa tela depois de visitar outra (navegação real);
// 2) quando a PRÓPRIA tela recarrega os dados no lugar (ex: registrar um
//    atendimento em "Minha Carteira" e a lista recarregar) -- sem isso, o
//    consultor clica em "Acionado", a lista pisca e ele perde o lugar onde
//    estava, tendo que rolar tudo de novo pra achar o próximo cliente.
// Um único ponto (chamado no layout do dashboard, que não desmonta entre
// navegações) cobre todas as telas, sem precisar mexer módulo por módulo.
export function useScrollMemory(containerId: string) {
  const pathname = usePathname();

  useEffect(() => {
    const el = document.getElementById(containerId);
    if (!el) return;

    const key = `scroll:${pathname}`;
    const lerSalvo = () => {
      try {
        return Number(sessionStorage.getItem(key) ?? 0);
      } catch {
        return 0;
      }
    };
    const gravar = (v: number) => {
      try {
        sessionStorage.setItem(key, String(v));
      } catch {
        // sessionStorage indisponível (aba privada etc.) -- segue sem persistir
      }
    };

    let alvo = lerSalvo();
    let cancelado = false;

    // Restauração ao entrar na tela (navegação real) -- o conteúdo pode
    // carregar aos poucos (fetch assíncrono), então tenta em alguns
    // instantes espaçados, não só uma vez.
    const tentativas = [0, 60, 150, 300, 600, 1000, 1800, 3000];
    const timers = tentativas.map((delay) =>
      setTimeout(() => {
        if (!cancelado) el.scrollTop = alvo;
      }, delay)
    );

    function onScroll() {
      alvo = el!.scrollTop;
      gravar(alvo);
    }
    el.addEventListener("scroll", onScroll, { passive: true });

    // Restauração quando a PRÓPRIA tela recarrega os dados no lugar: se o
    // conteúdo mudar (ex: lista recarregada após uma ação) e isso zerar a
    // rolagem enquanto o usuário estava rolado mais abaixo, devolve pro
    // último ponto conhecido. Só age quando o reset veio de uma mutação no
    // DOM (recarregamento), não de um scroll manual do usuário -- por isso
    // reage a mutações, não ao evento de scroll.
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (cancelado) return;
        if (alvo > 20 && el.scrollTop < alvo * 0.5) {
          el.scrollTop = alvo;
        }
      }, 80);
    });
    observer.observe(el, { childList: true, subtree: true });

    return () => {
      cancelado = true;
      timers.forEach(clearTimeout);
      if (debounce) clearTimeout(debounce);
      el.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [pathname, containerId]);
}
