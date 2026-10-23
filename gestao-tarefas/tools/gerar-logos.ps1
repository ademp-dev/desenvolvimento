# Gera todas as versões da logo a partir de public\logo-mestre.png (Windows PowerShell 5.1).
# Uso (na pasta do projeto): powershell -ExecutionPolicy Bypass -File tools\gerar-logos.ps1
#
# 1. Recorta a borda vazia (transparente ou branca) e deixa uma folga de 6%.
# 2. Gera:
#    public\ademp-logo.png            app (topo, login, ícone da aba)
#    public\addon-logo.png            ícone do complemento do Gmail (logoUrl)
#    extensao-chrome\icons\16|48|128  extensão do Chrome (fundo transparente)
#    addon-gmail\marketplace\         ícones 32/48/96/128 (fundo branco), banner 220x140, tela 1280x800
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$src = Join-Path $root 'public\logo-mestre.png'
if (-not (Test-Path $src)) { throw "Não encontrei $src" }

$teal = [System.Drawing.Color]::FromArgb(1, 131, 115)
$ink = [System.Drawing.Color]::FromArgb(31, 31, 31)
$page = [System.Drawing.Color]::FromArgb(246, 248, 252)

# --- 1. Recorte -------------------------------------------------------------
$master = New-Object System.Drawing.Bitmap $src
$minX = $master.Width; $minY = $master.Height; $maxX = 0; $maxY = 0
for ($y = 0; $y -lt $master.Height; $y++) {
  for ($x = 0; $x -lt $master.Width; $x++) {
    $p = $master.GetPixel($x, $y)
    if ($p.A -gt 25 -and -not ($p.R -gt 235 -and $p.G -gt 235 -and $p.B -gt 235)) {
      if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
$side = [Math]::Max($maxX - $minX + 1, $maxY - $minY + 1)
$pad = [int]([Math]::Ceiling($side * 0.06))
$full = $side + 2 * $pad
$cx = ($minX + $maxX) / 2; $cy = ($minY + $maxY) / 2
$trim = New-Object System.Drawing.Bitmap $full, $full, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($trim)
$g.Clear([System.Drawing.Color]::Transparent)
$srcRect = New-Object System.Drawing.RectangleF ([single]($cx - $full / 2)), ([single]($cy - $full / 2)), ([single]$full), ([single]$full)
$g.DrawImage($master, (New-Object System.Drawing.RectangleF 0, 0, $full, $full), $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose(); $master.Dispose()
Write-Host "Recorte: ${side}px de conteúdo -> ${full}px com folga"

# --- 2. Saídas ---------------------------------------------------------------
function Save-Icon([int]$size, [string]$path, [bool]$whiteBg) {
  $fmt = if ($whiteBg) { [System.Drawing.Imaging.PixelFormat]::Format24bppRgb } else { [System.Drawing.Imaging.PixelFormat]::Format32bppArgb }
  $bmp = New-Object System.Drawing.Bitmap $size, $size, $fmt
  $gr = [System.Drawing.Graphics]::FromImage($bmp)
  $gr.InterpolationMode = 'HighQualityBicubic'; $gr.SmoothingMode = 'AntiAlias'; $gr.PixelOffsetMode = 'HighQuality'; $gr.CompositingQuality = 'HighQuality'
  $gr.Clear($(if ($whiteBg) { [System.Drawing.Color]::White } else { [System.Drawing.Color]::Transparent }))
  $gr.DrawImage($trim, 0, 0, $size, $size)
  New-Item -ItemType Directory -Force (Split-Path $path -Parent) | Out-Null
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $gr.Dispose(); $bmp.Dispose()
  Write-Host "  $path ($size)"
}

# App e complemento (tamanho natural do recorte, até 256)
$appSize = [Math]::Min(256, $full)
Save-Icon $appSize (Join-Path $root 'public\ademp-logo.png') $false
Save-Icon 128 (Join-Path $root 'public\addon-logo.png') $false

# Extensão do Chrome
foreach ($s in 16, 48, 128) { Save-Icon $s (Join-Path $root "extensao-chrome\icons\$s.png") $false }

# Marketplace (fundo branco: a loja recusou imagens transparentes)
$mk = Join-Path $root 'addon-gmail\marketplace'
foreach ($s in 32, 48, 96, 128) { Save-Icon $s (Join-Path $mk "icone-$s.png") $true }

function New-Canvas($w, $h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $gr = [System.Drawing.Graphics]::FromImage($bmp)
  $gr.InterpolationMode = 'HighQualityBicubic'; $gr.SmoothingMode = 'AntiAlias'; $gr.TextRenderingHint = 'AntiAliasGridFit'
  return @($bmp, $gr)
}
$brushInk = New-Object System.Drawing.SolidBrush $ink
$brushTeal = New-Object System.Drawing.SolidBrush $teal

# Banner 220x140
$c = New-Canvas 220 140; $gr = $c[1]; $gr.Clear($page)
$gr.DrawImage($trim, 14, 34, 72, 72)
$gr.DrawString('Tarefas', (New-Object System.Drawing.Font 'Segoe UI', 18, ([System.Drawing.FontStyle]::Bold)), $brushInk, 92, 40)
$gr.DrawString('ADEMP', (New-Object System.Drawing.Font 'Segoe UI', 14), $brushTeal, 94, 72)
$c[0].Save((Join-Path $mk 'banner-220x140.png'), [System.Drawing.Imaging.ImageFormat]::Png); $gr.Dispose(); $c[0].Dispose()
Write-Host "  $mk\banner-220x140.png"

# Tela de apresentação 1280x800
$c = New-Canvas 1280 800; $gr = $c[1]; $gr.Clear($page)
$gr.DrawImage($trim, 80, 70, 120, 120)
$gr.DrawString('Tarefas ADEMP', (New-Object System.Drawing.Font 'Segoe UI', 40, ([System.Drawing.FontStyle]::Bold)), $brushInk, 220, 92)
$gr.DrawString('Transforme e-mails em tarefas sem sair do Gmail', (New-Object System.Drawing.Font 'Segoe UI', 22), $brushInk, 84, 225)
$labels = @('Abrir tarefa', 'Play', 'Concluir', 'Cancelar')
$status = @('Aberta', 'Em andamento', 'Concluida', 'Cancelada')
$sf = New-Object System.Drawing.StringFormat; $sf.Alignment = 'Center'; $sf.LineAlignment = 'Center'
for ($i = 0; $i -lt 4; $i++) {
  $x = 84 + $i * 280
  $rect = New-Object System.Drawing.Rectangle $x, 320, 250, 70
  $gr.FillRectangle($(if ($i -eq 3) { [System.Drawing.Brushes]::White } else { $brushTeal }), $rect)
  $fg = if ($i -eq 3) { $brushTeal } else { [System.Drawing.Brushes]::White }
  $gr.DrawString($labels[$i], (New-Object System.Drawing.Font 'Segoe UI', 20, ([System.Drawing.FontStyle]::Bold)), $fg, [System.Drawing.RectangleF]$rect, $sf)
  $gr.DrawString('-> ' + $status[$i], (New-Object System.Drawing.Font 'Segoe UI', 16), $brushInk, $x + 8, 410)
}
$gr.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 241, 196))), 84, 520, 1112, 180)
$gr.DrawString("Todo e-mail comeca como ""Nova"". O tempo decorrido e contado automaticamente,`ncom historico de alteracoes, prazos, alertas de atraso e relatorios no app web.", (New-Object System.Drawing.Font 'Segoe UI', 20), $brushInk, 110, 555)
$c[0].Save((Join-Path $mk 'tela-1280x800.png'), [System.Drawing.Imaging.ImageFormat]::Png); $gr.Dispose(); $c[0].Dispose()
Write-Host "  $mk\tela-1280x800.png"
$trim.Dispose()
