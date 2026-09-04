"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Lembra até onde o usuário rolou cada tela do dashboard e restaura:
// 1) ao voltar pra essa tela depois de visitar outra (navegação real);
// 2) quando a PRÓPRIA tela recarrega os dados no lugar (ex: registrar um
//    atendimento em "Minha Carteira" e a lista recarregar) -- sem isso, o
//    consultor clica em "Acionado", a lista pisca e ele perde o lugar onde
//    estava, tendo que rolar tudo de novo pra achar o próximo cliente.
//
// O caso (2) só reage a um sinal EXPLÍCITO de recarregamento -- um elemento
// com `data-scroll-loading="1"/"0"` em algum lugar dentro do container,
// que a própria tela atualiza a partir do seu estado de "carregando"
// (fetch em andamento). Reagir a qualquer mudança no DOM (childList
// genérico) parecia razoável, mas disparava até em filtros client-side
// (ex: trocar o filtro de empresa) -- a lista encolhia, o código achava que
// era um recarregamento e ficava insistindo em rolar de volta pra posição
// antiga, "travando" a tela na visão anterior até o usuário recarregar a
// página. Telas que não marcam esse atributo simplesmente não participam
// da restauração em (2) -- só (1) continua valendo pra elas.
//
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

    let alvo = lerSalvo(); // posição que queremos manter
    let cancelado = false;
    // Enquanto true, ignora o evento de scroll gerado pela NOSSA PRÓPRIA
    // correção -- senão, o clamp do navegador (quando o conteúdo encolhe e
    // zera a rolagem) dispara um scroll que sobrescreve `alvo` com 0 antes
    // da correção sequer rodar, apagando a posição que a gente queria voltar.
    let corrigindo = false;

    function forcarScroll(valor: number) {
      corrigindo = true;
      el!.scrollTop = valor;
      requestAnimationFrame(() => {
        corrigindo = false;
      });
    }

    // Restauração ao entrar na tela (navegação real) -- o conteúdo pode
    // carregar aos poucos (fetch assíncrono), então tenta em alguns
    // instantes espaçados, não só uma vez.
    const tentativas = [0, 60, 150, 300, 600, 1000, 1800, 3000];
    const timers = tentativas.map((delay) =>
      setTimeout(() => {
        if (!cancelado) forcarScroll(alvo);
      }, delay)
    );

    function onScroll() {
      if (corrigindo) return; // eco da nossa própria correção -- ignora
      alvo = el!.scrollTop;
      gravar(alvo);
    }
    el.addEventListener("scroll", onScroll, { passive: true });

    // Restauração quando a PRÓPRIA tela recarrega os dados no lugar --
    // dispara só na transição explícita de "carregando" (1 -> 0) do
    // atributo `data-scroll-loading`, não em qualquer mutação de conteúdo.
    let correcaoTimer: ReturnType<typeof setTimeout> | null = null;
    let correcaoAte = 0;

    function agendarCorrecao() {
      if (correcaoTimer) return;
      correcaoTimer = setTimeout(() => {
        correcaoTimer = null;
        if (cancelado || Date.now() >= correcaoAte) return;
        if (Math.abs(el!.scrollTop - alvo) > 20) {
          forcarScroll(alvo);
          agendarCorrecao();
        }
      }, 100);
    }

    const observer = new MutationObserver((mutations) => {
      const terminouCarregamento = mutations.some((m) => {
        if (m.type !== "attributes" || m.attributeName !== "data-scroll-loading") return false;
        const target = m.target as HTMLElement;
        return target.getAttribute("data-scroll-loading") === "0";
      });
      if (terminouCarregamento && alvo > 20) {
        correcaoAte = Date.now() + 5000; // até 5s -- cobre carteiras grandes recarregando
        agendarCorrecao();
      }
    });
    observer.observe(el, { attributes: true, attributeFilter: ["data-scroll-loading"], subtree: true });

    return () => {
      cancelado = true;
      timers.forEach(clearTimeout);
      if (correcaoTimer) clearTimeout(correcaoTimer);
      el.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [pathname, containerId]);
}
