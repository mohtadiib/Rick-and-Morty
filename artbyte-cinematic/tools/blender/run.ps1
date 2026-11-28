# Run a Blender Python script headless and print its log.
#   powershell -File tools/blender/run.ps1 tools/blender/pharmacist_head.py --render --ref <crop.png>
# Blender is found through $env:BLENDER_EXE, then the Microsoft Store launcher alias, then Program Files.
# Plain $args (no param block): every argument after the script goes to it as is, even ones such as --out that an
# advanced script would take for its own common parameters (-OutVariable).
$ErrorActionPreference = 'Stop'
if ($args.Count -lt 1) { throw 'usage: run.ps1 <script.py> [script arguments]' }
$Script = $args[0]; $Rest = @($args | Select-Object -Skip 1)
$exe = $env:BLENDER_EXE
if (-not $exe) { $alias = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\blender-launcher.exe'; if (Test-Path $alias) { $exe = $alias } }
if (-not $exe) { $exe = (Get-ChildItem 'C:\Program Files\Blender Foundation' -Recurse -Filter blender.exe -ErrorAction SilentlyContinue | Select-Object -First 1).FullName }
if (-not $exe) { throw 'Blender not found. Set BLENDER_EXE to the full path of blender.exe.' }
$scriptPath = (Resolve-Path $Script).Path
$argList = @('--background', '--factory-startup', '--python', $scriptPath, '--') + @($Rest | Where-Object { $_ })
$argList = $argList | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }   # Start-Process does not quote
$p = Start-Process -FilePath $exe -ArgumentList $argList -PassThru -Wait -WindowStyle Hidden
"blender exit code: $($p.ExitCode)"
$log = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'renders\blender\log.txt'
if ($env:BLENDER_LOG) { $log = $env:BLENDER_LOG }
if (Test-Path $log) { Get-Content $log -Tail 30 }
