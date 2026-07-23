# =============================================================================
#  Fã Pass — Sincronização Automática Diária
#  Executa às 08h via Task Scheduler (sem privilégios de administrador)
#  Lê: Y:\Pós Vendas\SÓCIO FÃ\BASES FACILITADAS\Base CAR Passaporte BC.xlsx
#  Envia para: https://<DOMINIO>/api/fapass/sync
# =============================================================================

param(
    [string]$BaseUrl    = "https://SEU-DOMINIO.vercel.app",
    [string]$ApiKey     = "SUA_API_KEY_INTERNA",
    [string]$ArquivoXLSX = "Y:\Pós Vendas\SÓCIO FÃ\BASES FACILITADAS\Base CAR Passaporte BC.xlsx"
)

$LogDir  = Join-Path $PSScriptRoot "logs"
$LogFile = Join-Path $LogDir "fapass-$(Get-Date -Format 'yyyy-MM-dd').log"

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

function Log {
    param([string]$Msg)
    $line = "[$(Get-Date -Format 'HH:mm:ss')] $Msg"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

# ──────────────────────────────────────────────────────────────────────────────
# 1. Verificar arquivo
# ──────────────────────────────────────────────────────────────────────────────
if (-not (Test-Path $ArquivoXLSX)) {
    Log "ERRO: Arquivo não encontrado: $ArquivoXLSX"
    exit 1
}
Log "Arquivo encontrado: $ArquivoXLSX"

# ──────────────────────────────────────────────────────────────────────────────
# 2. Buscar competência ativa via API
# ──────────────────────────────────────────────────────────────────────────────
Log "Buscando competência ativa..."
try {
    $headers = @{ "x-api-key" = $ApiKey }
    $compResp = Invoke-RestMethod -Uri "$BaseUrl/api/competencias/ativa" -Headers $headers -Method GET
    $competenciaId = $compResp.id
    Log "Competência ativa: $($compResp.descricao) (id=$competenciaId)"
} catch {
    Log "ERRO ao buscar competência ativa: $_"
    exit 1
}

# ──────────────────────────────────────────────────────────────────────────────
# 3. Enviar arquivo para a API via multipart/form-data
# ──────────────────────────────────────────────────────────────────────────────
Log "Enviando arquivo para sincronização..."

$boundary = [System.Guid]::NewGuid().ToString("N")
$arquivo  = [System.IO.File]::ReadAllBytes($ArquivoXLSX)
$nomeArq  = [System.IO.Path]::GetFileName($ArquivoXLSX)

# Monta corpo multipart manualmente (compatível com PS5+, sem módulos externos)
$nl = "`r`n"
$enc = [System.Text.Encoding]::UTF8

$parteComp = $enc.GetBytes(
    "--$boundary$nl" +
    "Content-Disposition: form-data; name=`"competenciaId`"$nl$nl" +
    "$competenciaId$nl"
)

$parteOrigem = $enc.GetBytes(
    "--$boundary$nl" +
    "Content-Disposition: form-data; name=`"origem`"$nl$nl" +
    "AUTOMATICO$nl"
)

$cabecalhoArq = $enc.GetBytes(
    "--$boundary$nl" +
    "Content-Disposition: form-data; name=`"arquivo`"; filename=`"$nomeArq`"$nl" +
    "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet$nl$nl"
)

$rodape = $enc.GetBytes("$nl--$boundary--$nl")

$corpo = New-Object System.IO.MemoryStream
$corpo.Write($parteComp,    0, $parteComp.Length)
$corpo.Write($parteOrigem,  0, $parteOrigem.Length)
$corpo.Write($cabecalhoArq, 0, $cabecalhoArq.Length)
$corpo.Write($arquivo,      0, $arquivo.Length)
$corpo.Write($rodape,       0, $rodape.Length)
$corpoBytes = $corpo.ToArray()

try {
    $syncHeaders = @{
        "x-api-key"    = $ApiKey
        "Content-Type" = "multipart/form-data; boundary=$boundary"
    }
    $resp = Invoke-RestMethod `
        -Uri     "$BaseUrl/api/fapass/sync" `
        -Method  POST `
        -Headers $syncHeaders `
        -Body    $corpoBytes

    Log "Sincronização concluída:"
    Log "  Registros lidos   : $($resp.totalRegistros)"
    Log "  Inadimp. novos    : $($resp.novosInadimplentes)"
    Log "  Flash novos       : $($resp.novosFlash)"
    Log "  Baixas            : $($resp.totalBaixas)"
    Log "  Divergências      : $($resp.totalDivergencias)"
} catch {
    Log "ERRO na sincronização: $_"
    exit 1
}

Log "Script finalizado com sucesso."
exit 0
