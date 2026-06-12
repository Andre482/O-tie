# Deploy O-Tie plugin to the active Obsidian vault
$vaultPath = "C:\Users\User\OneDrive\Obsidian"
$pluginDir = Join-Path $vaultPath ".obsidian\plugins\o-tie"
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

$communityPlugins = Join-Path $vaultPath ".obsidian\community-plugins.json"
$enabled = @("o-tie")
if (Test-Path $communityPlugins) {
	$existing = Get-Content $communityPlugins -Raw | ConvertFrom-Json
	foreach ($id in $existing) {
		if ($id -ne "o-tie") { $enabled = @($id) + $enabled }
	}
}
$enabled | ConvertTo-Json | Set-Content $communityPlugins -Encoding UTF8

Write-Host "Done. Reload Obsidian (Ctrl+R) to activate O-Tie."
