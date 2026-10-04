$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$version = [string]$package.version
if ($version -notmatch '^\d+\.\d+\.\d+\.\d+$') { throw "Expected a four-part app version; got $version." }

$electronDist = Join-Path $projectRoot 'node_modules\electron\dist'
$releaseRoot = Join-Path $projectRoot 'release\windows-x64'
$appFolder = Join-Path $releaseRoot "VidEd Studio $version"
$appPath = Join-Path $appFolder 'resources\app'
$zipPath = Join-Path $releaseRoot "VidEd-Studio-$version-Windows-x64.zip"
if (-not (Test-Path -LiteralPath (Join-Path $electronDist 'electron.exe'))) { throw 'Install project dependencies before packaging.' }
if (Test-Path -LiteralPath $appFolder) { throw "Output folder already exists: $appFolder" }
if (Test-Path -LiteralPath $zipPath) { throw "Output archive already exists: $zipPath" }

Push-Location $projectRoot
try { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'The editor build failed.' } }
finally { Pop-Location }

New-Item -ItemType Directory -Path $appFolder -Force | Out-Null
Get-ChildItem -LiteralPath $electronDist -Force | ForEach-Object {
  if ($_.Name -eq 'electron.exe') {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $appFolder 'VidEd Studio.exe')
  } else {
    Copy-Item -LiteralPath $_.FullName -Destination $appFolder -Recurse
  }
}
New-Item -ItemType Directory -Path $appPath -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'electron') -Destination $appPath -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot 'dist') -Destination $appPath -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot 'package.json') -Destination $appPath

$readme = @"
VidEd Studio $version for Windows (x64)

1. Extract the complete folder.
2. Open "VidEd Studio.exe" to run the editor.
3. Keep "VidEd Studio.exe" beside the resources folder.

This is an unsigned free preview build. Windows may show an unknown-publisher warning.
Your media stays on your computer. The editor currently exports WebM from the first video track.
MP4/H.264 and full multi-track video/audio export are not supported in this version.
"@
Set-Content -LiteralPath (Join-Path $appFolder 'README.txt') -Value $readme -Encoding utf8
$archiveTimestamp = (Get-Date).AddSeconds(-2)
Get-ChildItem -LiteralPath $appFolder -Recurse -Force | ForEach-Object { $_.LastWriteTime = $archiveTimestamp }
(Get-Item -LiteralPath $appFolder).LastWriteTime = $archiveTimestamp
Compress-Archive -LiteralPath $appFolder -DestinationPath $zipPath -CompressionLevel Optimal
$file = Get-Item -LiteralPath $zipPath
$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
[pscustomobject]@{ Version = $version; Archive = $zipPath; SizeBytes = $file.Length; SHA256 = $hash } | Format-List
