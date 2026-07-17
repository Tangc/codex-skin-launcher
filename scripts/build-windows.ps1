param(
    [string]$Runtime = "win-x64",
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectDirectory = Split-Path -Parent $PSScriptRoot
$ProjectFile = Join-Path $ProjectDirectory "windows\CodexSkinLauncher.Windows.csproj"
$DistDirectory = Join-Path $ProjectDirectory "dist"
$PublishDirectory = Join-Path $DistDirectory "CodexSkinLauncher-windows-x64"
$ZipPath = Join-Path $DistDirectory "CodexSkinLauncher-windows-x64.zip"

if (Test-Path $PublishDirectory) {
    Remove-Item $PublishDirectory -Recurse -Force
}
if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
}
New-Item $PublishDirectory -ItemType Directory -Force | Out-Null

dotnet publish $ProjectFile `
    --configuration $Configuration `
    --runtime $Runtime `
    --self-contained true `
    --output $PublishDirectory `
    -p:PublishSingleFile=true `
    -p:ContinuousIntegrationBuild=true

Copy-Item (Join-Path $ProjectDirectory "README.md") (Join-Path $PublishDirectory "使用说明.md")
Copy-Item (Join-Path $ProjectDirectory "SECURITY.md") (Join-Path $PublishDirectory "安全说明.md")
Compress-Archive -Path (Join-Path $PublishDirectory "*") -DestinationPath $ZipPath -CompressionLevel Optimal

Write-Output $PublishDirectory
Write-Output $ZipPath
