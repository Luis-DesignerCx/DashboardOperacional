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

export function formatarData(data: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(data));
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
