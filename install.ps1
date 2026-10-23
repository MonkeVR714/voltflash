# VoltFlash one-line installer. Works with Windows Smart App Control turned on.
#
#   irm https://raw.githubusercontent.com/MonkeVR714/voltflash/main/install.ps1 | iex
#
# Installs the latest release for the current user (no admin), adds Start menu
# and desktop shortcuts and an entry in Settings > Apps so it can be uninstalled.
# VoltFlash then keeps itself up to date.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repo = 'MonkeVR714/voltflash'
$dir = Join-Path $env:LOCALAPPDATA 'VoltFlashApp'
$exe = Join-Path $dir 'VoltFlash.exe'

function Say($text, $color = 'Gray') { Write-Host "  $text" -ForegroundColor $color }

Write-Host ''
Write-Host '  VoltFlash installer' -ForegroundColor Yellow
Write-Host ''

# Latest release tag from the github.com redirect (no API rate limit)
$req = [System.Net.WebRequest]::Create("https://github.com/$repo/releases/latest")
$req.AllowAutoRedirect = $false
$req.UserAgent = 'VoltFlash-Installer'
$resp = $req.GetResponse()
$tag = ($resp.Headers['Location'] -split '/tag/')[1]
$resp.Close()
if (-not $tag) { throw 'Could not find the latest VoltFlash release on GitHub.' }
$version = $tag.TrimStart('v')
Say "Latest version: $version"

$zipName = "VoltFlash-win-x64-$version.zip"
$zip = Join-Path $env:TEMP $zipName
Say "Downloading $zipName ..."
Invoke-WebRequest "https://github.com/$repo/releases/download/$tag/$zipName" -OutFile $zip -UseBasicParsing

Get-Process VoltFlash -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$dir*" } | Stop-Process -Force
Start-Sleep -Milliseconds 500

Say 'Installing ...'
if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
Expand-Archive -LiteralPath $zip -DestinationPath $dir -Force
Remove-Item $zip -Force
if (-not (Test-Path $exe)) { throw "Install failed: $exe is missing." }

# Shortcuts
$shell = New-Object -ComObject WScript.Shell
$startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'VoltFlash.lnk'
$desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'VoltFlash.lnk'
foreach ($path in @($startMenu, $desktop)) {
  $lnk = $shell.CreateShortcut($path)
  $lnk.TargetPath = $exe
  $lnk.WorkingDirectory = $dir
  $lnk.IconLocation = Join-Path $dir 'resources\app\build\icon.ico'
  $lnk.Description = 'VoltFlash firmware flasher'
  $lnk.Save()
}

# Uninstaller + entry in Settings > Apps
$uninstall = Join-Path $dir 'uninstall.ps1'
@"
Get-Process VoltFlash -ErrorAction SilentlyContinue | Where-Object { `$_.Path -like '$dir*' } | Stop-Process -Force
Start-Sleep -Milliseconds 500
Remove-Item '$startMenu', '$desktop' -Force -ErrorAction SilentlyContinue
Remove-Item 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\VoltFlashApp' -Recurse -Force -ErrorAction SilentlyContinue
Set-Location `$env:TEMP
Remove-Item '$dir' -Recurse -Force
Write-Host 'VoltFlash was removed. Your backups and settings are kept in %APPDATA%\VoltFlash.'
"@ | Set-Content -Path $uninstall -Encoding UTF8

$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\VoltFlashApp'
New-Item -Path $key -Force | Out-Null
Set-ItemProperty $key DisplayName 'VoltFlash'
Set-ItemProperty $key DisplayVersion $version
Set-ItemProperty $key Publisher 'VoltFlash'
Set-ItemProperty $key DisplayIcon $exe
Set-ItemProperty $key InstallLocation $dir
Set-ItemProperty $key UninstallString "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$uninstall`""
Set-ItemProperty $key NoModify 1
Set-ItemProperty $key NoRepair 1

Say "VoltFlash $version is installed." Green
Say 'Find it in the Start menu or on your desktop. It updates itself.' Green
Write-Host ''
Start-Process $exe
