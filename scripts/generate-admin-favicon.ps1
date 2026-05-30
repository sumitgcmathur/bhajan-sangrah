# Generate admin PNG favicons (when npm/sharp unavailable). Requires Windows + .NET Drawing.
$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot '..\assets\icons\favicon.jpg'
$out = Join-Path $PSScriptRoot '..\admin\public'
Add-Type -AssemblyName System.Drawing

function New-AdminFavicon([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'HighQuality'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.PixelOffsetMode = 'HighQuality'

  $srcImg = [System.Drawing.Image]::FromFile($src)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse(2, 2, $size - 4, $size - 4)
  $g.SetClip($path)
  $g.DrawImage($srcImg, 0, 0, $size, $size)
  $g.ResetClip()
  $srcImg.Dispose()

  $maroon = [System.Drawing.Color]::FromArgb(255, 155, 45, 74)
  $ringW = [Math]::Max(2, $size * 0.028)
  $pen = New-Object System.Drawing.Pen($maroon, $ringW)
  $g.DrawEllipse($pen, 1, 1, $size - 2, $size - 2)
  $pen.Dispose()

  $badge = [int]($size * 0.36)
  $bx = $size - $badge + [int]($size * 0.03)
  $by = $bx
  $brush = New-Object System.Drawing.SolidBrush($maroon)
  $g.FillEllipse($brush, $bx, $by, $badge, $badge)
  $brush.Dispose()
  $badgeW = [Math]::Max(2, $badge * 0.08)
  $wp = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $badgeW)
  $g.DrawEllipse($wp, $bx + 3, $by + 3, $badge - 6, $badge - 6)
  $wp.Dispose()
  $white = [System.Drawing.Brushes]::White
  $cx = $bx + $badge / 2
  $cy = $by + $badge / 2
  $s = $badge / 2.2
  $pts = @(
    [System.Drawing.Point]::new([int]($cx - $s * 0.5), [int]($cy + $s * 0.45)),
    [System.Drawing.Point]::new([int]($cx + $s * 0.15), [int]($cy - $s * 0.25)),
    [System.Drawing.Point]::new([int]($cx + $s * 0.4), [int]($cy)),
    [System.Drawing.Point]::new([int]($cx - $s * 0.25), [int]($cy + $s * 0.7))
  )
  $g.FillPolygon($white, $pts)

  $g.Dispose()
  $bmp
}

New-Item -ItemType Directory -Force -Path $out | Out-Null
foreach ($pair in @(@('favicon-16.png', 16), @('favicon-32.png', 32), @('apple-touch-icon.png', 180))) {
  $bmp = New-AdminFavicon $pair[1]
  $path = Join-Path $out $pair[0]
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "wrote $path"
}
Copy-Item (Join-Path $out 'favicon-32.png') (Join-Path $out 'favicon.ico') -Force
Write-Host "wrote $(Join-Path $out 'favicon.ico') (from favicon-32.png)"
