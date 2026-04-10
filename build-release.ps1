Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifestPath = Join-Path $projectRoot 'manifest.json'

if (-not (Test-Path $manifestPath)) {
  throw "manifest.json não encontrado em $projectRoot"
}

$manifest = Get-Content -Raw $manifestPath | ConvertFrom-Json
$version = $manifest.version
if ([string]::IsNullOrWhiteSpace($version)) {
  $version = '0.0.0'
}

$filesToInclude = @(
  'background.js',
  'content.js',
  'icon.png',
  'icon_inactive.png',
  'manifest.json',
  'releaseData.js'
)

$popupSource = Join-Path $projectRoot 'popup'
if (-not (Test-Path $popupSource)) {
  throw "Pasta popup não encontrada em $projectRoot"
}

$releasesDir = Join-Path $projectRoot 'releases'
if (-not (Test-Path $releasesDir)) {
  New-Item -ItemType Directory -Path $releasesDir | Out-Null
}

$stagingDir = Join-Path $projectRoot 'release-temp'
if (Test-Path $stagingDir) {
  Remove-Item -Recurse -Force -LiteralPath $stagingDir
}
New-Item -ItemType Directory -Path $stagingDir | Out-Null

Copy-Item -Recurse -Force -Path $popupSource -Destination (Join-Path $stagingDir 'popup')

foreach ($relativePath in $filesToInclude) {
  $sourcePath = Join-Path $projectRoot $relativePath
  if (-not (Test-Path $sourcePath)) {
    throw "Arquivo obrigatório não encontrado: $relativePath"
  }
  Copy-Item -Force -Path $sourcePath -Destination (Join-Path $stagingDir $relativePath)
}

$zipPath = Join-Path $releasesDir ("EPAD-Downloader-v{0}.zip" -f $version)
if (Test-Path $zipPath) {
  Remove-Item -Force -LiteralPath $zipPath
}

Compress-Archive -Path (Join-Path $stagingDir '*') -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item -Recurse -Force -LiteralPath $stagingDir

Write-Host "Pacote gerado em: $zipPath"
