# =============================================================================
#  Instala a tarefa agendada do Fã Pass no Task Scheduler
#  SEM necessidade de privilégios de administrador
#  Execute este script UMA única vez na máquina da empresa
# =============================================================================

# ── Configuração ─────────────────────────────────────────────────────────────
$NomeTarefa  = "DASH-CR FaPass Sync"
$HoraExec    = "08:00"
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ScriptPath  = Join-Path $ScriptDir "fapass-sync.ps1"

# Ajuste as variáveis abaixo antes de executar:
$BaseUrl = "https://SEU-DOMINIO.vercel.app"
$ApiKey  = "SUA_API_KEY_INTERNA"

# ─────────────────────────────────────────────────────────────────────────────

if (-not (Test-Path $ScriptPath)) {
    Write-Error "Script não encontrado: $ScriptPath"
    exit 1
}

$Acao = New-ScheduledTaskAction `
    -Execute "pwsh.exe" `
    -Argument "-NonInteractive -WindowStyle Hidden -File `"$ScriptPath`" -BaseUrl `"$BaseUrl`" -ApiKey `"$ApiKey`""

$Gatilho = New-ScheduledTaskTrigger -Daily -At $HoraExec

$Config = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 5) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable

# Remove tarefa antiga se existir
if (Get-ScheduledTask -TaskName $NomeTarefa -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $NomeTarefa -Confirm:$false
    Write-Host "Tarefa anterior removida."
}

Register-ScheduledTask `
    -TaskName $NomeTarefa `
    -Action   $Acao `
    -Trigger  $Gatilho `
    -Settings $Config `
    -RunLevel Limited `
    -Force | Out-Null

Write-Host ""
Write-Host "Tarefa '$NomeTarefa' instalada com sucesso!"
Write-Host "Execução diária às $HoraExec"
Write-Host ""
Write-Host "Para testar agora:"
Write-Host "  Start-ScheduledTask -TaskName '$NomeTarefa'"
Write-Host ""
Write-Host "Para ver logs:"
Write-Host "  Get-Content '$ScriptDir\logs\fapass-$(Get-Date -Format 'yyyy-MM-dd').log'"
