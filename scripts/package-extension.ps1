$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$dist = Join-Path $root "dist"
$packageName = "sheet-filtering-tool.zip"
$packagePath = Join-Path $dist $packageName

$include = @(
  "manifest.json",
  "README.md",
  "assets",
  "src"
)

if (!(Test-Path $dist)) {
  New-Item -ItemType Directory -Path $dist | Out-Null
}

if (Test-Path $packagePath) {
  Remove-Item -LiteralPath $packagePath
}

$paths = $include | ForEach-Object { Join-Path $root $_ } | Where-Object { Test-Path $_ }
Compress-Archive -Path $paths -DestinationPath $packagePath -CompressionLevel Optimal

Write-Host "Created $packagePath"
