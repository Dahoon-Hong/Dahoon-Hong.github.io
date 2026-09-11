param(
  [string]$InputPath = (Join-Path $PSScriptRoot 'map-source/aurelia-landing-zone-layout.png'),
  [string]$OutputPath = (Join-Path $PSScriptRoot 'map-source/aurelia-landing-zone-layout-candidate.json'),
  [string]$PreviewPath = (Join-Path $PSScriptRoot 'map-source/aurelia-landing-zone-layout-preview.png')
)

Add-Type -AssemblyName System.Drawing

$worldWidth = 2880
$worldHeight = 2160
$cellSize = 18
$columns = 160
$rows = 120
$samplesPerAxis = 5

function Get-SourcePoint([double]$worldX, [double]$worldY, [double]$scale, [double]$offsetX, [double]$offsetY) {
  return [pscustomobject]@{
    x = ($worldX - $offsetX) / $scale
    y = ($worldY - $offsetY) / $scale
  }
}

function Get-PixelKind([System.Drawing.Color]$color) {
  if ($color.A -lt 100) { return 0 }
  if ($color.R -gt 150 -and $color.G -lt 120 -and $color.B -lt 120) { return 1 }
  if ($color.B -gt 120 -and $color.R -lt 150 -and $color.G -lt 150) { return 2 }
  if ($color.R -lt 10 -and $color.G -lt 10 -and $color.B -lt 10 -and $color.A -gt 128) { return 3 }
  return 0
}

function Get-SourceIndex([double]$value, [int]$limit) {
  return [Math]::Max(0, [Math]::Min($limit - 1, [int][Math]::Floor($value)))
}

if (-not (Test-Path -LiteralPath $InputPath)) {
  throw "Input image not found: $InputPath"
}

$source = [System.Drawing.Bitmap]::new($InputPath)
$classification = New-Object 'System.Byte[,]' $source.Width, $source.Height
$redPixels = 0
$bluePixels = 0

try {
  for ($y = 0; $y -lt $source.Height; $y++) {
    for ($x = 0; $x -lt $source.Width; $x++) {
      $kind = Get-PixelKind $source.GetPixel($x, $y)
      $classification[$x, $y] = $kind
      if ($kind -eq 1) { $redPixels++ }
      if ($kind -eq 2) { $bluePixels++ }
    }
  }

  $scale = [Math]::Min($worldWidth / [double]$source.Width, $worldHeight / [double]$source.Height)
  $offsetX = ($worldWidth - $source.Width * $scale) / 2
  $offsetY = ($worldHeight - $source.Height * $scale) / 2

  $visited = New-Object 'System.Boolean[,]' $source.Width, $source.Height
  $components = @{}
  foreach ($componentKind in @(1, 2)) {
    $componentList = [System.Collections.Generic.List[object]]::new()
    for ($y = 0; $y -lt $source.Height; $y++) {
      for ($x = 0; $x -lt $source.Width; $x++) {
        if ($visited[$x, $y] -or $classification[$x, $y] -ne $componentKind) { continue }
        $queue = [System.Collections.Generic.Queue[System.Drawing.Point]]::new()
        $queue.Enqueue([System.Drawing.Point]::new($x, $y))
        $visited[$x, $y] = $true
        $count = 0
        $sumX = 0.0
        $sumY = 0.0
        while ($queue.Count -gt 0) {
          $point = $queue.Dequeue()
          $count++
          $sumX += $point.X
          $sumY += $point.Y
          for ($dy = -1; $dy -le 1; $dy++) {
            for ($dx = -1; $dx -le 1; $dx++) {
              if ($dx -eq 0 -and $dy -eq 0) { continue }
              $nextX = $point.X + $dx
              $nextY = $point.Y + $dy
              if ($nextX -lt 0 -or $nextY -lt 0 -or $nextX -ge $source.Width -or $nextY -ge $source.Height) { continue }
              if ($visited[$nextX, $nextY] -or $classification[$nextX, $nextY] -ne $componentKind) { continue }
              $visited[$nextX, $nextY] = $true
              $queue.Enqueue([System.Drawing.Point]::new($nextX, $nextY))
            }
          }
        }
        if ($count -ge 3) {
          $componentList.Add([pscustomobject]@{ count = $count; x = $sumX / $count; y = $sumY / $count })
        }
      }
    }
    $components[$componentKind] = @($componentList | Sort-Object x, y)
  }

  $mapRows = [System.Collections.Generic.List[string]]::new()
  for ($cellY = 0; $cellY -lt $rows; $cellY++) {
    $row = [System.Text.StringBuilder]::new()
    for ($cellX = 0; $cellX -lt $columns; $cellX++) {
      $blackSamples = 0
      for ($sampleY = 0; $sampleY -lt $samplesPerAxis; $sampleY++) {
        for ($sampleX = 0; $sampleX -lt $samplesPerAxis; $sampleX++) {
          $worldX = ($cellX + ($sampleX + 0.5) / $samplesPerAxis) * $cellSize
          $worldY = ($cellY + ($sampleY + 0.5) / $samplesPerAxis) * $cellSize
          $sourcePoint = Get-SourcePoint $worldX $worldY $scale $offsetX $offsetY
          $sourceX = Get-SourceIndex $sourcePoint.x $source.Width
          $sourceY = Get-SourceIndex $sourcePoint.y $source.Height
          if ($classification[$sourceX, $sourceY] -eq 3) { $blackSamples++ }
        }
      }
      [void]$row.Append($(if ($blackSamples -ge ($samplesPerAxis * $samplesPerAxis / 2)) { '#' } else { '.' }))
    }
    $mapRows.Add($row.ToString())
  }

  $spawnCells = @($components[1] | ForEach-Object {
    [pscustomobject]@{
      x = [Math]::Max(0, [Math]::Min($columns - 1, [int][Math]::Floor(($_.x * $scale + $offsetX) / $cellSize)))
      y = [Math]::Max(0, [Math]::Min($rows - 1, [int][Math]::Floor(($_.y * $scale + $offsetY) / $cellSize)))
      sourcePixels = $_.count
    }
  } | Sort-Object x, y)
  $startCell = @($components[2] | ForEach-Object {
    [pscustomobject]@{
      x = [Math]::Max(0, [Math]::Min($columns - 1, [int][Math]::Floor(($_.x * $scale + $offsetX) / $cellSize)))
      y = [Math]::Max(0, [Math]::Min($rows - 1, [int][Math]::Floor(($_.y * $scale + $offsetY) / $cellSize)))
      sourcePixels = $_.count
    }
  } | Select-Object -First 1)

  if ($spawnCells.Count -ne 4) { throw "Expected 4 red spawn components, found $($spawnCells.Count)" }
  if ($null -eq $startCell) { throw 'Expected 1 blue tank start component' }
  if ($mapRows[$startCell.y][$startCell.x] -eq '#') { throw 'Tank start cell is blocked' }
  foreach ($spawn in $spawnCells) {
    if ($mapRows[$spawn.y][$spawn.x] -eq '#') { throw "Enemy spawn cell is blocked: $($spawn.x),$($spawn.y)" }
  }

  $candidate = [ordered]@{
    source = [ordered]@{
      path = [System.IO.Path]::GetFileName($InputPath)
      width = $source.Width
      height = $source.Height
      scale = $scale
      offset = [ordered]@{ x = $offsetX; y = $offsetY }
    }
    world = [ordered]@{ cellSize = $cellSize; columns = $columns; rows = $rows }
    tankStartCell = [ordered]@{ x = $startCell.x; y = $startCell.y }
    enemySpawnCells = @($spawnCells | ForEach-Object { [ordered]@{ x = $_.x; y = $_.y } })
    terrain = [ordered]@{
      legend = [ordered]@{ '.' = 'open'; '#' = 'hill' }
      rows = @($mapRows)
    }
  }
  $candidate | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding utf8

  $preview = [System.Drawing.Bitmap]::new($source.Width, $source.Height)
  $previewGraphics = [System.Drawing.Graphics]::FromImage($preview)
  try {
    $previewGraphics.Clear([System.Drawing.Color]::White)
    $previewGraphics.DrawImage($source, 0, 0, $source.Width, $source.Height)
    $gridPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(96, 0, 128, 255), 1)
    $redPen = [System.Drawing.Pen]::new([System.Drawing.Color]::Red, 3)
    $bluePen = [System.Drawing.Pen]::new([System.Drawing.Color]::Blue, 3)
    try {
      for ($cellX = 0; $cellX -le $columns; $cellX++) {
        $sourceX = ($cellX * $cellSize - $offsetX) / $scale
        if ($sourceX -ge 0 -and $sourceX -le $source.Width) { $previewGraphics.DrawLine($gridPen, [float]$sourceX, 0, [float]$sourceX, $source.Height) }
      }
      for ($cellY = 0; $cellY -le $rows; $cellY++) {
        $sourceY = ($cellY * $cellSize - $offsetY) / $scale
        if ($sourceY -ge 0 -and $sourceY -le $source.Height) { $previewGraphics.DrawLine($gridPen, 0, [float]$sourceY, $source.Width, [float]$sourceY) }
      }
      foreach ($spawn in $components[1]) {
        $previewGraphics.DrawEllipse($redPen, [float]($spawn.x - 8), [float]($spawn.y - 8), 16, 16)
      }
      foreach ($start in $components[2]) {
        $previewGraphics.DrawEllipse($bluePen, [float]($start.x - 8), [float]($start.y - 8), 16, 16)
      }
    } finally {
      $gridPen.Dispose()
      $redPen.Dispose()
      $bluePen.Dispose()
    }
    $preview.Save($PreviewPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $previewGraphics.Dispose()
    $preview.Dispose()
  }

  Write-Output "source: $($source.Width)x$($source.Height)"
  Write-Output "mapping: scale=$scale offset=($offsetX,$offsetY)"
  $blockedCells = ($mapRows | ForEach-Object { [regex]::Matches($_, '#').Count } | Measure-Object -Sum).Sum
  Write-Output "terrain: $($mapRows.Count) rows x $columns columns; blocked cells=$blockedCells"
  Write-Output "red pixels: $redPixels; spawn cells: $(($spawnCells | ForEach-Object { \"$($_.x),$($_.y)\" }) -join ', ')"
  Write-Output "blue pixels: $bluePixels; tank start: $($startCell.x),$($startCell.y)"
  Write-Output "candidate: $OutputPath"
  Write-Output "preview: $PreviewPath"
} finally {
  $source.Dispose()
}
