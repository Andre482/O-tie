# Deploy O-Tie to a local Obsidian vault (developer use only).
# Set OBSIDIAN_VAULT_PATH to your vault root, or pass -VaultPath.
param(
	[string]$VaultPath = $env:OBSIDIAN_VAULT_PATH
)

if (-not $VaultPath) {
	Write-Error "Set OBSIDIAN_VAULT_PATH or pass -VaultPath to your Obsidian vault root."
	exit 1
}

$pluginDir = Join-Path $VaultPath ".obsidian\plugins\o-tie"
$sourceDir = $PSScriptRoot

Write-Host "Building plugin..."
Push-Location $sourceDir
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
Pop-Location

Write-Host "Deploying to $pluginDir ..."
New-Item -ItemType Directory -Force -Path $pluginDir | Out-Null
Copy-Item (Join-Path $sourceDir "main.js") -Destination $pluginDir -Force
Copy-Item (Join-Path $sourceDir "manifest.json") -Destination $pluginDir -Force
Copy-Item (Join-Path $sourceDir "styles.css") -Destination $pluginDir -Force

Write-Host "Done. Reload Obsidian (Ctrl+R) to activate O-Tie."
