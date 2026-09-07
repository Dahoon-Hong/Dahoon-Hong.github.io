param(
  [string]$Source = 'public/assets/game/maps/field-base.png',
  [string]$Output = 'public/assets/game/maps/test-terrain-map.png'
)

Add-Type -AssemblyName System.Drawing

$worldWidth = 2880
$worldHeight = 2160
$sourceBitmap = [System.Drawing.Bitmap]::new($Source)
$bitmap = [System.Drawing.Bitmap]::new($worldWidth, $worldHeight)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half

try {
  for ($y = 0; $y -lt $worldHeight; $y += $sourceBitmap.Height) {
    for ($x = 0; $x -lt $worldWidth; $x += $sourceBitmap.Width) {
      $graphics.DrawImage($sourceBitmap, $x, $y, $sourceBitmap.Width, $sourceBitmap.Height)
    }
  }

  $regions = @(
    @(288, 432, 684, 576), @(864, 432, 1188, 576), @(2160, 540, 2448, 828),
    @(900, 720, 1404, 864), @(1620, 720, 1980, 864), @(1872, 972, 2124, 1260),
    @(2160, 1296, 2412, 1692), @(360, 1512, 756, 1584), @(360, 1584, 432, 1872),
    @(684, 1584, 756, 1872), @(1152, 1620, 1764, 1800)
  )

  $shadowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(130, 3, 8, 16))
  $hillBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(232, 30, 45, 64))
  $rimPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(235, 83, 125, 143), 4)
  $highlightPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(130, 138, 197, 201), 2)
  try {
    foreach ($region in $regions) {
      $left, $top, $right, $bottom = $region
      $points = [System.Drawing.Point[]]@(
        [System.Drawing.Point]::new($left, $top),
        [System.Drawing.Point]::new($right, $top),
        [System.Drawing.Point]::new($right, $bottom),
        [System.Drawing.Point]::new($left, $bottom)
      )
      $shadowPoints = [System.Drawing.Point[]]@(
        [System.Drawing.Point]::new($left + 8, $top + 8),
        [System.Drawing.Point]::new($right + 8, $top + 8),
        [System.Drawing.Point]::new($right + 8, $bottom + 8),
        [System.Drawing.Point]::new($left + 8, $bottom + 8)
      )
      $graphics.FillPolygon($shadowBrush, $shadowPoints)
      $graphics.FillPolygon($hillBrush, $points)
      $graphics.DrawPolygon($rimPen, $points)
      $graphics.DrawLine($highlightPen, $left + 12, $top + 12, $right - 12, $top + 12)
      $graphics.DrawLine($highlightPen, $left + 12, $top + 12, $left + 12, $bottom - 12)
      for ($line = $left + 36; $line -lt $right - 12; $line += 72) {
        $graphics.DrawLine($highlightPen, $line, $top + 28, $line - 22, $bottom - 28)
      }
    }
  } finally {
    $shadowBrush.Dispose()
    $hillBrush.Dispose()
    $rimPen.Dispose()
    $highlightPen.Dispose()
  }

  $directory = [System.IO.Path]::GetDirectoryName($Output)
  if ($directory) { [System.IO.Directory]::CreateDirectory($directory) | Out-Null }
  $bitmap.Save($Output, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $graphics.Dispose()
  $sourceBitmap.Dispose()
  $bitmap.Dispose()
}
