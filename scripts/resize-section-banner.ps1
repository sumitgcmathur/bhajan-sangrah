# Resize a section icon (assets/icons) and regenerate landing thumb + sidebar menu icon.
# Usage: powershell -File scripts/resize-section-banner.ps1 -Slug swarachit -Icon Swarachit.jpg
param(
  [string]$Slug = 'swarachit',
  [string]$Icon = 'Swarachit.jpg',
  [int]$BannerW = 704,
  [int]$BannerH = 1522,
  [int]$ThumbW = 352,
  [int]$ThumbH = 761,
  [int]$MenuSize = 40
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$iconPath = Join-Path $root "assets\icons\$Icon"
$thumbPath = Join-Path $root "assets\banners\$Slug.jpg"
$menuPath = Join-Path $root "assets\menu\$Slug.jpg"

if (-not (Test-Path $iconPath)) {
  Write-Error "Missing $iconPath"
}

Add-Type -AssemblyName System.Drawing

function Save-Jpeg($bitmap, $path, [long]$quality = 85) {
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $enc = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $enc.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
    [System.Drawing.Imaging.Encoder]::Quality, $quality)
  $bitmap.Save($path, $codec, $enc)
  $enc.Dispose()
}

function New-CoverBitmap($srcImg, [int]$tw, [int]$th) {
  $bmp = New-Object System.Drawing.Bitmap $tw, $th
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $scale = [Math]::Max($tw / $srcImg.Width, $th / $srcImg.Height)
  $nw = [int]($srcImg.Width * $scale)
  $nh = [int]($srcImg.Height * $scale)
  $x = [int](($tw - $nw) / 2)
  $y = [int](($th - $nh) / 2)
  $g.DrawImage($srcImg, $x, $y, $nw, $nh)
  $g.Dispose()
  $bmp
}

$src = [System.Drawing.Image]::FromFile($iconPath)
Write-Host "Source: $($src.Width)x$($src.Height) $([Math]::Round((Get-Item $iconPath).Length/1KB)) KB"

$banner = New-CoverBitmap $src $BannerW $BannerH
$src.Dispose()
$iconTmp = "$iconPath.tmp.jpg"
Save-Jpeg $banner $iconTmp 88
$banner.Dispose()
Move-Item -Force $iconTmp $iconPath
$iconKb = [Math]::Round((Get-Item $iconPath).Length / 1KB)
Write-Host "Banner icon: $iconPath (${BannerW}x${BannerH}, $iconKb KB)"

$src2 = [System.Drawing.Image]::FromFile($iconPath)
New-Item -ItemType Directory -Force -Path (Split-Path $thumbPath) | Out-Null
$thumb = New-CoverBitmap $src2 $ThumbW $ThumbH
Save-Jpeg $thumb $thumbPath 82
$thumb.Dispose()
$src2.Dispose()

$thumbKb = [Math]::Round((Get-Item $thumbPath).Length / 1KB)
Write-Host "Landing tile: $thumbPath (${ThumbW}x${ThumbH}, $thumbKb KB)"

$src3 = [System.Drawing.Image]::FromFile($iconPath)
New-Item -ItemType Directory -Force -Path (Split-Path $menuPath) | Out-Null
$menuBmp = New-Object System.Drawing.Bitmap $MenuSize, $MenuSize
$mg = [System.Drawing.Graphics]::FromImage($menuBmp)
$mg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$mg.DrawImage($src3, 0, 0, $MenuSize, $MenuSize)
$mg.Dispose()
$menu = $menuBmp
Save-Jpeg $menu $menuPath 78
$menu.Dispose()
$src3.Dispose()
$menuKb = [Math]::Round((Get-Item $menuPath).Length / 1KB)
Write-Host "Sidebar menu: $menuPath (${MenuSize}x${MenuSize}, $menuKb KB)"
