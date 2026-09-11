param(
  [string]$MapsPath = 'src/data/maps.json',
  [string]$AssetRoot = 'public/assets/game/maps',
  [string]$SourceRoot = 'scripts/map-source'
)

Add-Type -AssemblyName System.Drawing

$worldWidth = 2880
$worldHeight = 2160
$maps = Get-Content $MapsPath -Raw | ConvertFrom-Json
$backgrounds = @{
  'aurelia/landing-zone' = @{ source = 'aurelia-landing-zone-background.png'; output = 'aurelia-landing-zone-map.png'; palette = 'aurelia' }
  'aurelia/relay-fields' = @{ source = 'aurelia-relay-fields-background.png'; output = 'aurelia-relay-fields-map.png'; palette = 'aurelia' }
  'cinder/ash-basin' = @{ source = 'cinder-ash-basin-background.png'; output = 'cinder-ash-basin-map.png'; palette = 'cinder' }
  'cinder/core-ruins' = @{ source = 'cinder-core-ruins-background.png'; output = 'cinder-core-ruins-map.png'; palette = 'cinder' }
}

function Get-RegionPolygons($map) {
  if ($null -ne $map.terrain.regions) {
    return @($map.terrain.regions | ForEach-Object { ,@($_.polygon | ForEach-Object { [System.Drawing.Point]::new([int]$_.x, [int]$_.y) }) })
  }

  $cellSize = [int]$map.world.cellSize
  $blockedSymbols = @($map.terrain.legend.PSObject.Properties | Where-Object { $_.Value -ne 'open' } | ForEach-Object { [string]$_.Name })
  $rectangles = @()
  for ($y = 0; $y -lt $map.terrain.rows.Count; $y++) {
    $row = $map.terrain.rows[$y]
    $x = 0
    while ($x -lt $row.Length) {
      if ($blockedSymbols -notcontains [string]$row[$x]) { $x++; continue }
      $start = $x
      while ($x -lt $row.Length -and $blockedSymbols -contains [string]$row[$x]) { $x++ }
      $run = [pscustomobject]@{ x = $start; width = $x - $start; y = $y; height = 1 }
      $previous = $rectangles | Where-Object { $_.x -eq $run.x -and $_.width -eq $run.width -and $_.y + $_.height -eq $run.y } | Select-Object -First 1
      if ($null -ne $previous) { $previous.height++ }
      else { $rectangles += $run }
    }
  }
  return @($rectangles | ForEach-Object {
    ,@(
      [System.Drawing.Point]::new($_.x * $cellSize, $_.y * $cellSize),
      [System.Drawing.Point]::new(($_.x + $_.width) * $cellSize, $_.y * $cellSize),
      [System.Drawing.Point]::new(($_.x + $_.width) * $cellSize, ($_.y + $_.height) * $cellSize),
      [System.Drawing.Point]::new($_.x * $cellSize, ($_.y + $_.height) * $cellSize)
    )
  })
}

function Get-BlockedTileCells($map) {
  $cellSize = [int]$map.world.cellSize
  $blockedSymbols = @($map.terrain.legend.PSObject.Properties | Where-Object { $_.Value -ne 'open' } | ForEach-Object { [string]$_.Name })
  $cells = [System.Collections.Generic.List[object]]::new()
  for ($y = 0; $y -lt $map.terrain.rows.Count; $y++) {
    $row = $map.terrain.rows[$y]
    for ($x = 0; $x -lt $row.Length; $x++) {
      if ($blockedSymbols -contains [string]$row[$x]) {
        $cells.Add([pscustomobject]@{ x = $x; y = $y; left = $x * $cellSize; top = $y * $cellSize })
      }
    }
  }
  return @($cells)
}

function Test-BlockedTile($map, [int]$x, [int]$y, [string[]]$blockedSymbols) {
  if ($x -lt 0 -or $y -lt 0 -or $x -ge $map.world.columns -or $y -ge $map.world.rows) { return $false }
  return $blockedSymbols -contains [string]$map.terrain.rows[$y][$x]
}

foreach ($map in $maps.maps) {
  if (-not $backgrounds.ContainsKey($map.mapId)) { continue }
  $config = $backgrounds[$map.mapId]
  $sourcePath = Join-Path $SourceRoot $config.source
  $outputPath = Join-Path $AssetRoot $config.output
  $sourceBitmap = [System.Drawing.Bitmap]::new($sourcePath)
  $bitmap = [System.Drawing.Bitmap]::new($worldWidth, $worldHeight)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  try {
    $graphics.DrawImage($sourceBitmap, 0, 0, $worldWidth, $worldHeight)
    if ($config.palette -eq 'cinder') {
      $shadowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(145, 20, 8, 6))
      $hillBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(224, 75, 43, 29))
      $rimPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(230, 206, 111, 68), 5)
      $highlightPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(125, 255, 178, 100), 2)
    } else {
      $shadowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(135, 3, 8, 16))
      $hillBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(224, 30, 45, 64))
      $rimPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(230, 83, 125, 143), 5)
      $highlightPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(125, 138, 197, 201), 2)
    }
    try {
      if ($null -ne $map.terrain.rows) {
        $cellSize = [int]$map.world.cellSize
        $blockedSymbols = @($map.terrain.legend.PSObject.Properties | Where-Object { $_.Value -ne 'open' } | ForEach-Object { [string]$_.Name })
        $tileRimPen = [System.Drawing.Pen]::new($rimPen.Color, 2)
        $tileHighlightPen = [System.Drawing.Pen]::new($highlightPen.Color, 1)
        try {
          foreach ($tile in Get-BlockedTileCells $map) {
            $graphics.FillRectangle($hillBrush, $tile.left, $tile.top, $cellSize, $cellSize)
          }
          foreach ($tile in Get-BlockedTileCells $map) {
            $left = $tile.left
            $top = $tile.top
            $right = $left + $cellSize
            $bottom = $top + $cellSize
            if (-not (Test-BlockedTile $map $tile.x ($tile.y - 1) $blockedSymbols)) {
              $graphics.DrawLine($tileRimPen, $left, $top, $right, $top)
              $graphics.DrawLine($tileHighlightPen, $left + 2, $top + 2, $right - 2, $top + 2)
            }
            if (-not (Test-BlockedTile $map ($tile.x - 1) $tile.y $blockedSymbols)) {
              $graphics.DrawLine($tileRimPen, $left, $top, $left, $bottom)
              $graphics.DrawLine($tileHighlightPen, $left + 2, $top + 2, $left + 2, $bottom - 2)
            }
            if (-not (Test-BlockedTile $map $tile.x ($tile.y + 1) $blockedSymbols)) {
              $graphics.DrawLine($tileRimPen, $left, $bottom, $right, $bottom)
            }
            if (-not (Test-BlockedTile $map ($tile.x + 1) $tile.y $blockedSymbols)) {
              $graphics.DrawLine($tileRimPen, $right, $top, $right, $bottom)
            }
          }
        } finally {
          $tileRimPen.Dispose()
          $tileHighlightPen.Dispose()
        }
      } else {
        foreach ($points in Get-RegionPolygons $map) {
          $polygonPoints = [System.Drawing.Point[]]$points
          $shadowPoints = [System.Drawing.Point[]]@($points | ForEach-Object { [System.Drawing.Point]::new($_.X + 10, $_.Y + 10) })
          $graphics.FillPolygon($shadowBrush, $shadowPoints)
          $graphics.FillPolygon($hillBrush, $polygonPoints)
          $graphics.DrawPolygon($rimPen, $polygonPoints)
          $left = ($points | Measure-Object X -Minimum).Minimum
          $top = ($points | Measure-Object Y -Minimum).Minimum
          $right = ($points | Measure-Object X -Maximum).Maximum
          $bottom = ($points | Measure-Object Y -Maximum).Maximum
          $graphics.DrawLine($highlightPen, $left + 14, $top + 14, $right - 14, $top + 14)
          $graphics.DrawLine($highlightPen, $left + 14, $top + 14, $left + 14, $bottom - 14)
          for ($line = $left + 40; $line -lt $right - 12; $line += 82) {
            $graphics.DrawLine($highlightPen, $line, $top + 30, $line - 24, $bottom - 30)
          }
        }
      }
    } finally {
      $shadowBrush.Dispose()
      $hillBrush.Dispose()
      $rimPen.Dispose()
      $highlightPen.Dispose()
    }
    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $sourceBitmap.Dispose()
    $bitmap.Dispose()
  }
}
