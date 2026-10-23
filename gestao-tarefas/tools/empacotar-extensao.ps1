# Prepara a extensão para a Chrome Web Store (Windows PowerShell 5.1).
# Uso (na pasta do projeto): powershell -ExecutionPolicy Bypass -File tools\empacotar-extensao.ps1
#
# Gera em loja-chrome\:
#   tarefas-ademp-extensao-<versão>.zip   pacote para enviar à loja
#   promo-440x280.png                     bloco promocional pequeno (obrigatório)
#   tela-1280x800.png                     captura de tela (obrigatória, ao menos 1)
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$ext = Join-Path $root 'extensao-chrome'
$out = Join-Path $root 'loja-chrome'
New-Item -ItemType Directory -Force $out | Out-Null

$manifest = Get-Content (Join-Path $ext 'manifest.json') -Raw | ConvertFrom-Json
$zip = Join-Path $out ("tarefas-ademp-extensao-" + $manifest.version + ".zip")
if (Test-Path $zip) { Remove-Item $zip -Force }
# O manifest.json precisa ficar na raiz do ZIP, e os caminhos internos com "/"
# (o Compress-Archive do PowerShell 5.1 grava "\" e a Chrome Web Store recusa).
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($zip, [System.IO.Compression.ZipArchiveMode]::Create)
Get-ChildItem $ext -Recurse -File | ForEach-Object {
  $entry = $_.FullName.Substring($ext.Length + 1).Replace('\', '/')
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $entry) | Out-Null
}
$archive.Dispose()
Write-Host "Pacote: $zip"

$teal = [System.Drawing.Color]::FromArgb(2, 81, 72)
$ink = [System.Drawing.Color]::FromArgb(31, 31, 31)
$muted = [System.Drawing.Color]::FromArgb(95, 99, 104)
$page = [System.Drawing.Color]::FromArgb(246, 248, 252)
$bar = [System.Drawing.Color]::FromArgb(255, 243, 194)
$barLine = [System.Drawing.Color]::FromArgb(241, 220, 143)
$logo = [System.Drawing.Image]::FromFile((Join-Path $root 'public\ademp-logo.png'))
$icons = 'acao-abrir', 'acao-play', 'acao-concluir', 'acao-cancelar', 'acao-atribuir', 'acao-app' | ForEach-Object {
  [System.Drawing.Image]::FromFile((Join-Path $root "public\icones\$_.png"))
}

function New-Canvas($w, $h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'
  return @($bmp, $g)
}

function Draw-Pill($g, $x, $y, $w, $h) {
  $r = $h / 2
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($x, $y, $h, $h, 90, 180); $path.AddArc($x + $w - $h, $y, $h, $h, 270, 180); $path.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush $bar), $path)
  $g.DrawPath((New-Object System.Drawing.Pen $barLine, 2), $path)
}

# Barra de ações como aparece dentro do e-mail
function Draw-Bar($g, $x, $y, $scale) {
  $h = 44 * $scale; $icon = 26 * $scale; $gap = 14 * $scale
  $w = (70 + 6 * 40 + 40) * $scale
  Draw-Pill $g $x $y $w $h
  $g.DrawImage($logo, [single]($x + 12 * $scale), [single]($y + 8 * $scale), [single](28 * $scale), [single](28 * $scale))
  $chipFont = New-Object System.Drawing.Font 'Segoe UI', ([single](11 * $scale)), ([System.Drawing.FontStyle]::Bold)
  $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 226, 168))), [single]($x + 48 * $scale), [single]($y + 11 * $scale), [single](56 * $scale), [single](22 * $scale))
  $g.DrawString('Aberta', $chipFont, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(92, 60, 0))), [single]($x + 52 * $scale), [single]($y + 13 * $scale))
  $ix = $x + 120 * $scale
  foreach ($img in $icons) {
    $g.DrawImage($img, [single]$ix, [single]($y + ($h - $icon) / 2), [single]$icon, [single]$icon)
    $ix += $icon + $gap
  }
}

# Bloco promocional 440x280
$c = New-Canvas 440 280; $g = $c[1]; $g.Clear($page)
$g.DrawImage($logo, 24, 32, 72, 72)
$g.DrawString('Tarefas ADEMP', (New-Object System.Drawing.Font 'Segoe UI', 22, ([System.Drawing.FontStyle]::Bold)), (New-Object System.Drawing.SolidBrush $ink), 106, 38)
$g.DrawString('para Gmail', (New-Object System.Drawing.Font 'Segoe UI', 14), (New-Object System.Drawing.SolidBrush $teal), 108, 74)
Draw-Bar $g 24 150 1.0
$g.DrawString('Uso interno da ADEMP', (New-Object System.Drawing.Font 'Segoe UI', 11), (New-Object System.Drawing.SolidBrush $muted), 24, 236)
$c[0].Save((Join-Path $out 'promo-440x280.png'), [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $c[0].Dispose()
Write-Host "Promo: $out\promo-440x280.png"

# Captura de tela 1280x800 (e-mail ilustrativo com a barra)
$c = New-Canvas 1280 800; $g = $c[1]; $g.Clear($page)
$g.FillRectangle([System.Drawing.Brushes]::White, 60, 60, 1160, 680)
$g.DrawString('PENDÊNCIAS CONTÁBEIS 04/2026', (New-Object System.Drawing.Font 'Segoe UI', 24), (New-Object System.Drawing.SolidBrush $ink), 140, 100)
$g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(26, 115, 232))), 80, 170, 44, 44)
Draw-Bar $g 140 170 1.3
$g.DrawString('Contabilidade <contato@exemplo.com.br>', (New-Object System.Drawing.Font 'Segoe UI', 14, ([System.Drawing.FontStyle]::Bold)), (New-Object System.Drawing.SolidBrush $ink), 140, 250)
$g.DrawString('para mim', (New-Object System.Drawing.Font 'Segoe UI', 12), (New-Object System.Drawing.SolidBrush $muted), 140, 278)
$g.DrawString("Prezados, bom dia!`nApós análise contábil do mês 04/2026, constatamos as divergências abaixo...", (New-Object System.Drawing.Font 'Segoe UI', 15), (New-Object System.Drawing.SolidBrush $ink), 140, 330)
$g.DrawString('Abrir tarefa  ·  Play  ·  Concluir  ·  Cancelar  ·  Atribuir  ·  Abrir no app', (New-Object System.Drawing.Font 'Segoe UI', 18, ([System.Drawing.FontStyle]::Bold)), (New-Object System.Drawing.SolidBrush $teal), 140, 600)
$g.DrawString('Status, tempo decorrido e responsável sem sair do Gmail.', (New-Object System.Drawing.Font 'Segoe UI', 16), (New-Object System.Drawing.SolidBrush $muted), 140, 645)
$c[0].Save((Join-Path $out 'tela-1280x800.png'), [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $c[0].Dispose()
Write-Host "Tela: $out\tela-1280x800.png"

$logo.Dispose(); $icons | ForEach-Object { $_.Dispose() }
