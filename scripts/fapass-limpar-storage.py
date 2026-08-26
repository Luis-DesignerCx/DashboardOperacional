"""
Apaga a planilha Fã Pass do Supabase Storage depois de processada.
Roda sempre (sucesso ou erro) — o Storage é só uma passagem, nunca deve
acumular arquivo entre importações. Usado pelo GitHub Actions workflow.
"""
import os, sys, requests

supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
service_key  = os.environ.get("SUPABASE_SERVICE_KEY", "")
file_path    = os.environ.get("FAPASS_FILE_PATH", "")

if not supabase_url or not service_key or not file_path:
    print("Aviso: variáveis ausentes, não foi possível limpar o Storage (não é erro fatal).")
    sys.exit(0)

url = f"{supabase_url}/storage/v1/object/fapass/{file_path}"
resp = requests.delete(url, headers={"Authorization": f"Bearer {service_key}"}, timeout=30)

if resp.status_code in (200, 204):
    print(f"Storage limpo: {file_path}")
else:
    # Não fatal — não queremos que a limpeza quebre o workflow.
    print(f"Aviso: falha ao limpar Storage ({resp.status_code}) — {resp.text[:200]}")
