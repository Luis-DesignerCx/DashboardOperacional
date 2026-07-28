"""
Baixa a planilha Fã Pass do Supabase Storage.
Usado pelo GitHub Actions workflow.
"""
import os, sys, requests

supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
service_key  = os.environ.get("SUPABASE_SERVICE_KEY", "")
file_path    = os.environ.get("FAPASS_FILE_PATH", "")

if not supabase_url or not service_key or not file_path:
    print("ERRO: variáveis SUPABASE_URL, SUPABASE_SERVICE_KEY e FAPASS_FILE_PATH são obrigatórias.")
    sys.exit(1)

url = f"{supabase_url}/storage/v1/object/fapass/{file_path}"
print(f"Baixando de: {url}")

resp = requests.get(
    url,
    headers={"Authorization": f"Bearer {service_key}"},
    stream=True,
    timeout=300,
)

if resp.status_code != 200:
    print(f"ERRO: HTTP {resp.status_code} — {resp.text[:200]}")
    sys.exit(1)

os.makedirs("planilhas", exist_ok=True)
destino = "planilhas/upload.xlsx"
total = 0
with open(destino, "wb") as f:
    for chunk in resp.iter_content(chunk_size=65536):
        f.write(chunk)
        total += len(chunk)

print(f"Download concluído: {total / 1_048_576:.1f} MB → {destino}")
