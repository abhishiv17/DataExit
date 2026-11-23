# Copies ELEVENLABS_API_KEY from the repo's git-ignored .env into the Lambda's environment.
# The key is never printed. Run from the repo root:  powershell -File infra/voice-lambda/set-key.ps1
$ErrorActionPreference = "Stop"
$line = Get-Content (Join-Path $PSScriptRoot "..\..\.env") | Where-Object { $_ -match '^\s*ELEVENLABS_API_KEY=' } | Select-Object -First 1
if (-not $line) { throw "ELEVENLABS_API_KEY not found in .env" }
$key = ($line -split '=', 2)[1].Trim().TrimStart([char]0xFEFF)
$vars = @{ Variables = @{ ELEVENLABS_API_KEY = $key; ELEVENLABS_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb" } } | ConvertTo-Json -Compress
$tmp = New-TemporaryFile
Set-Content -Path $tmp -Value $vars -Encoding ascii
try {
  aws lambda update-function-configuration --region ap-south-1 --function-name dataexit-voice --environment "file://$tmp" --query "LastUpdateStatus" --output text | Out-Null
  Write-Host "ElevenLabs key set on Lambda dataexit-voice."
} finally {
  Remove-Item $tmp -Force
}
