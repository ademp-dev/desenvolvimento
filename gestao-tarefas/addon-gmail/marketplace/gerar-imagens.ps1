# Gera as imagens exigidas pela Google Workspace Marketplace (Windows PowerShell 5.1):
#   icone-128.png, icone-96.png, icone-48.png, icone-32.png, banner-220x140.png, tela-1280x800.png
# Uso: powershell -ExecutionPolicy Bypass -File gerar-imagens.ps1
Add-Type -AssemblyName System.Drawing
$out = $PSScriptRoot
$blue = [System.Drawing.Color]::FromArgb(11, 87, 208)
$light = [System.Drawing.Color]::FromArgb(194, 231, 255)
$page = [System.Drawing.Color]::FromArgb(246, 248, 252)
$ink = [System.Drawing.Color]::FromArgb(31, 31, 31)

function New-Canvas($w, $h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'
  return @($bmp, $g)
}

function Draw-Badge($g, $x, $y, $size) {
  # Círculo azul com um "check" branco
  $g.FillEllipse((New-Object System.Drawing.SolidBrush $blue), $x, $y, $size, $size)
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([single]($size * 0.11))
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
  $pts = @(
    (New-Object System.Drawing.PointF ($x + $size * 0.28), ($y + $size * 0.52)),
    (New-Object System.Drawing.PointF ($x + $size * 0.44), ($y + $size * 0.67)),
    (New-Object System.Drawing.PointF ($x + $size * 0.73), ($y + $size * 0.36))
  )
  $g.DrawLines($pen, $pts)
}

# Ícones
foreach ($s in 128, 96, 48, 32) {
  $c = New-Canvas $s $s; $c[1].Clear([System.Drawing.Color]::White)
  Draw-Badge $c[1] 0 0 $s
  $c[0].Save("$out\icone-$s.png", [System.Drawing.Imaging.ImageFormat]::Png); $c[1].Dispose(); $c[0].Dispose()
}

# Banner 220x140
$c = New-Canvas 220 140; $g = $c[1]; $g.Clear($page)
Draw-Badge $g 20 38 64
$g.DrawString("Tarefas", (New-Object System.Drawing.Font "Segoe UI", 18, ([System.Drawing.FontStyle]::Bold)), (New-Object System.Drawing.SolidBrush $ink), 92, 42)
$g.DrawString("ADEMP", (New-Object System.Drawing.Font "Segoe UI", 14), (New-Object System.Drawing.SolidBrush $blue), 94, 74)
$c[0].Save("$out\banner-220x140.png", [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $c[0].Dispose()

# Tela de apresentação 1280x800
$c = New-Canvas 1280 800; $g = $c[1]; $g.Clear($page)
Draw-Badge $g 80 80 96
$g.DrawString("Tarefas ADEMP", (New-Object System.Drawing.Font "Segoe UI", 40, ([System.Drawing.FontStyle]::Bold)), (New-Object System.Drawing.SolidBrush $ink), 200, 92)
$g.DrawString("Transforme e-mails em tarefas sem sair do Gmail", (New-Object System.Drawing.Font "Segoe UI", 22), (New-Object System.Drawing.SolidBrush $ink), 84, 220)
$labels = @("Abrir tarefa", "Play", "Concluir", "Cancelar")
$status = @("Aberta", "Em andamento", "Concluida", "Cancelada")
for ($i = 0; $i -lt 4; $i++) {
  $x = 84 + $i * 280
  $rect = New-Object System.Drawing.Rectangle $x, 320, 250, 70
  $g.FillRectangle((New-Object System.Drawing.SolidBrush $(if ($i -eq 3) { [System.Drawing.Color]::White } else { $blue })), $rect)
  $fg = if ($i -eq 3) { $blue } else { [System.Drawing.Color]::White }
  $sf = New-Object System.Drawing.StringFormat; $sf.Alignment = 'Center'; $sf.LineAlignment = 'Center'
  $g.DrawString($labels[$i], (New-Object System.Drawing.Font "Segoe UI", 20, ([System.Drawing.FontStyle]::Bold)), (New-Object System.Drawing.SolidBrush $fg), [System.Drawing.RectangleF]$rect, $sf)
  $g.DrawString("-> " + $status[$i], (New-Object System.Drawing.Font "Segoe UI", 16), (New-Object System.Drawing.SolidBrush $ink), $x + 8, 410)
}
$g.FillRectangle((New-Object System.Drawing.SolidBrush $light), 84, 520, 1112, 180)
$g.DrawString("Todo e-mail comeca como ""Nova"". O tempo decorrido e contado automaticamente,`ncom historico de alteracoes, prazos, alertas de atraso e relatorios no app web.", (New-Object System.Drawing.Font "Segoe UI", 20), (New-Object System.Drawing.SolidBrush $ink), 110, 555)
$c[0].Save("$out\tela-1280x800.png", [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $c[0].Dispose()
Get-ChildItem $out -Filter *.png | Select-Object Name, Length
