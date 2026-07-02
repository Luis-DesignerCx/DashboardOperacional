"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface FrenteContextType {
  equipeIds: string[];          // vazio = todas as frentes
  toggleEquipe: (id: string) => void;
  clearFilter: () => void;
  // Compat helpers
  equipeId: string | null;      // primeira selecionada (ou null se todas)
  setEquipeId: (id: string | null) => void;
}

const FrenteContext = createContext<FrenteContextType>({
  equipeIds: [],
  toggleEquipe: () => {},
  clearFilter: () => {},
  equipeId: null,
  setEquipeId: () => {},
});

export function FrenteProvider({ children }: { children: ReactNode }) {
  const [equipeIds, setEquipeIds] = useState<string[]>([]);

  function toggleEquipe(id: string) {
    setEquipeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function clearFilter() { setEquipeIds([]); }

  // Compat: equipeId = primeira selecionada ou null
  const equipeId = equipeIds.length === 1 ? equipeIds[0] : null;
  function setEquipeId(id: string | null) {
    setEquipeIds(id ? [id] : []);
  }

  return (
    <FrenteContext.Provider value={{ equipeIds, toggleEquipe, clearFilter, equipeId, setEquipeId }}>
      {children}
    </FrenteContext.Provider>
  );
}

export function useFrente() {
  return useContext(FrenteContext);
}
