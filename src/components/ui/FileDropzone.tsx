"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

function formatarTamanhoArquivo(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileDropzoneProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export function FileDropzone({
  files,
  onFilesChange,
  accept = ".xlsx,.xls,.csv",
  multiple = true,
  placeholder = "Arraste e solte seus arquivos aqui ou clique para selecionar",
  disabled = false,
}: FileDropzoneProps) {
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function adicionarArquivos(novos: FileList | null) {
    if (!novos || novos.length === 0) return;
    const lista = Array.from(novos);
    onFilesChange(multiple ? [...files, ...lista] : [lista[0]]);
  }

  function removerArquivo(idx: number) {
    onFilesChange(files.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          if (!disabled) adicionarArquivos(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-1.5 w-full border-2 border-dashed rounded-xl px-4 py-6 text-center transition-colors",
          disabled
            ? "border-white/[0.06] bg-white/[0.01] cursor-not-allowed opacity-50"
            : arrastando
              ? "border-gr-500 bg-gr-500/[0.06] cursor-pointer"
              : "border-white/[0.1] hover:border-gr-500/50 hover:bg-white/[0.02] cursor-pointer"
        )}
      >
        <Upload size={18} className={arrastando ? "text-gr-400" : "text-slate-500"} />
        <p className="text-sm text-slate-400">{placeholder}</p>
        <p className="text-[11px] text-slate-600">{accept.split(",").join(", ")}</p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          className="hidden"
          onChange={(e) => { adicionarArquivos(e.target.files); e.target.value = ""; }}
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-1">
          {files.length > 1 && (
            <p className="text-[11px] text-slate-500">{files.length} arquivos selecionados</p>
          )}
          <div className="space-y-1">
            {files.map((f, i) => (
              <div key={`${f.name}-${f.lastModified}-${i}`} className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-1.5">
                <FileSpreadsheet size={13} className="text-slate-500 flex-shrink-0" />
                <span className="text-xs text-slate-300 truncate flex-1">{f.name}</span>
                <span className="text-[11px] text-slate-500 flex-shrink-0">{formatarTamanhoArquivo(f.size)}</span>
                <button
                  type="button"
                  onClick={() => removerArquivo(i)}
                  disabled={disabled}
                  className="flex-shrink-0 text-slate-500 hover:text-red-400 transition-colors p-0.5"
                  aria-label={`Remover ${f.name}`}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
