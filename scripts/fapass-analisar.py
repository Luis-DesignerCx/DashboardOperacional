import json
from datetime import datetime, timezone

with open('scripts/fapass-dados.json', encoding='utf-8') as f:
    dados = json.load(f)

hoje = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
ontem_ts = hoje.timestamp() - 86400
ini_comp = datetime(2026, 7, 1, 3, 0, 0, tzinfo=timezone.utc)
fim_comp = datetime(2026, 8, 1, 2, 59, 59, tzinfo=timezone.utc)

def is_inad(tipo):
    t = tipo.strip().lower()
    if t.startswith('cart'):
        return False
    return 'boleto' in t or t.startswith('rec')

grupos = {}
for r in dados:
    if r['status'] != 'P':
        continue
    if not is_inad(r['tipo']):
        continue
    if 'cancelamento de passaporte' in r['tiposBaixa'].lower():
        continue
    if not r['vencimento']:
        continue
    venc = datetime.fromisoformat(r['vencimento'].replace('Z', '+00:00'))
    is_flash = ini_comp <= venc <= fim_comp
    is_inad_row = venc.timestamp() <= ontem_ts
    if not is_inad_row and not is_flash:
        continue
    doc = r['documento']
    if doc not in grupos:
        grupos[doc] = {'venc_min': venc, 'valor': 0, 'parcelas': 0}
    grupos[doc]['valor'] += r['valor']
    grupos[doc]['parcelas'] += 1
    if venc < grupos[doc]['venc_min']:
        grupos[doc]['venc_min'] = venc

total_valor = sum(g['valor'] for g in grupos.values())
total_contratos = len(grupos)
media_parcelas = sum(g['parcelas'] for g in grupos.values()) / max(total_contratos, 1)

print("=== ANALISE DA INADIMPLENCIA FP/PON ===")
print(f"Contratos unicos: {total_contratos}")
print(f"Total R$: {total_valor:,.2f}")
print(f"Media parcelas por contrato: {media_parcelas:.1f}")
print()
print("Top 10 maiores contratos:")
top = sorted(grupos.items(), key=lambda x: x[1]['valor'], reverse=True)[:10]
for doc, g in top:
    print(f"  {doc}: {g['parcelas']} parcelas = R$ {g['valor']:,.2f} (venc mais antigo: {g['venc_min'].date()})")

print()
print("=== DISTRIBUICAO POR FAIXA DE DIAS EM ATRASO ===")
faixas = {'0 dias (flash)': 0, '1-30 dias': 0, '31-90 dias': 0, '91-180 dias': 0, '181+ dias': 0}
for doc, g in grupos.items():
    dias = max(0, int((hoje.timestamp() - g['venc_min'].timestamp()) / 86400))
    if dias == 0:
        faixas['0 dias (flash)'] += 1
    elif dias <= 30:
        faixas['1-30 dias'] += 1
    elif dias <= 90:
        faixas['31-90 dias'] += 1
    elif dias <= 180:
        faixas['91-180 dias'] += 1
    else:
        faixas['181+ dias'] += 1
for k, v in faixas.items():
    print(f"  {k}: {v} contratos")
