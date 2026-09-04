"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// useState que lembra o valor entre navegações (sessionStorage, por aba) --
// ex: filtro de empresa ou texto de busca continuam selecionados se o
// usuário sair da tela e voltar, em vez de resetar. Chave isolada por tela
// (pathname) + `key`, pra não misturar estado de páginas diferentes.
//
// Assume o padrão normal do App Router: o componente que usa esse hook
// desmonta ao trocar de rota e remonta ao voltar -- então o valor inicial
// (lido do sessionStorage) já reflete a última rota, sem precisar reagir a
// mudança de pathname durante a vida do componente.
export function usePersistedState<T>(key: string, initial: T) {
  const pathname = usePathname();
  const storageKey = `state:${pathname}:${key}`;

  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const saved = sessionStorage.getItem(storageKey);
      return saved !== null ? (JSON.parse(saved) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // sessionStorage indisponível (aba privada etc.) -- segue sem persistir
    }
  }, [storageKey, value]);

  return [value, setValue] as const;
}
