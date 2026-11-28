# Launch Blender GUI with the MCP for Blender add-on enabled and listening on localhost:9876,
# then wait until tools/blender/live.mjs ping succeeds.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$exe = $env:BLENDER_EXE
if (-not $exe) { $alias = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\blender-launcher.exe'; if (Test-Path $alias) { $exe = $alias } }
if (-not $exe) { $exe = (Get-ChildItem 'C:\Program Files\Blender Foundation' -Recurse -Filter blender.exe -ErrorAction SilentlyContinue | Select-Object -First 1).FullName }
if (-not $exe) { throw 'Blender not found. Set BLENDER_EXE to the full path of blender.exe.' }

$userScripts = Join-Path $root 'renders\blender\user_scripts'
if (Test-Path $userScripts) { $env:BLENDER_USER_SCRIPTS = $userScripts }
$bootPy = Join-Path $PSScriptRoot 'live_boot.py'

function Test-McpPort {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $c.Connect('127.0.0.1', 9876)
    $c.Close()
    return $true
  } catch { return $false }
}

if (Test-McpPort) {
  Write-Output "Blender MCP already listening on localhost:9876"
  exit 0
}

Write-Output "Launching Blender live GUI with MCP server..."
Start-Process -FilePath $exe -ArgumentList @('--python', $bootPy)

for ($i = 0; $i -lt 35; $i++) {
  Start-Sleep -Milliseconds 700
  if (Test-McpPort) {
    $ErrorActionPreference = 'Continue'
    $ping = & node (Join-Path $PSScriptRoot 'live.mjs') ping
    Write-Output "Connected to live Blender on localhost:9876 ($ping)"
    exit 0
  }
}
throw "Blender launched, but MCP did not start on localhost:9876 within 25s."
