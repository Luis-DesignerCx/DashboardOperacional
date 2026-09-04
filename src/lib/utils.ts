import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatarMoeda(valor: number | string): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valor));
}

// Interpreta valor monetário digitado em qualquer formato comum -- vírgula
// decimal (1234,56), ponto decimal (1234.56), ou os dois juntos como
// separador de milhar + decimal (1.234,56). Antes, telas diferentes faziam
// só `.replace(",", ".")`, que quebra silenciosamente qualquer valor com
// ponto de milhar: "1.500,00" virava "1.500.00" e o parseFloat lia só
// "1.5" -- um contrato de R$1.500 registrado como R$1,50.
export function parsearValorMonetario(input: string | number | null | undefined): number {
  if (input == null) return 0;
  if (typeof input === "number") return input;
  let s = String(input).trim().replace(/R\$\s*/gi, "").replace(/\s/g, "");
  if (!s) return 0;

  if (s.includes(",")) {
    // Vírgula é o separador decimal (padrão BR) -- qualquer ponto antes dela
    // é separador de milhar. Ex: "1.234,56" -> "1234.56".
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    const partes = s.split(".");
    if (partes.length > 2 || (partes.length === 2 && partes[1].length === 3)) {
      // Só ponto(s), sem vírgula, e no formato de milhar (3 dígitos depois
      // do último ponto, ou mais de um ponto) -- ex: "1.500" -> "1500",
      // "1.234.567" -> "1234567". Sem isso, ficaria ambíguo com decimal.
      s = partes.join("");
    }
    // Senão, mantém como está -- ponto decimal normal (ex: "150.5" -> 150.5).
  }

  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

export function formatarData(data: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(data));
}

export function formatarDataHora(data: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(data));
}

export function formatarCPF(cpf: string | null | undefined): string {
  if (!cpf) return "—";
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

export function limparCPF(cpf: string | null | undefined): string {
  if (!cpf) return "";
  return cpf.replace(/\D/g, "");
}
