# Reads a Modelart breakdown .xls (read-only, via Excel) and writes the raw rows,
# including which progress cells are coloured, to a JSON file.
# Usage: powershell -File scripts\export-xls.ps1 -Xls "Z:\...\Breakedown.xls" -Out raw.json
param([Parameter(Mandatory)][string]$Xls, [Parameter(Mandatory)][string]$Out)

$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false
try {
  $wb = $xl.Workbooks.Open($Xls, 0, $true)
  $ws = $wb.Worksheets.Item(1)
  $last = $ws.UsedRange.Row + $ws.UsedRange.Rows.Count - 1
  $cols = 'B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U'
  $rows = @()
  for ($r = 1; $r -le $last; $r++) {
    $cells = @{}; $fill = @{}; $any = $false
    foreach ($c in $cols) {
      $cell = $ws.Range("$c$r")
      $t = ([string]$cell.Text).Trim()
      if ($t -ne '') { $cells[$c] = $t; $any = $true }
      $ci = $cell.Interior.ColorIndex
      if ($ci -ne -4142 -and $ci -ne $null -and $ci -ne 2) { $fill[$c] = $ci; $any = $true }
    }
    if ($any) { $rows += [pscustomobject]@{ r = $r; cells = $cells; fill = $fill } }
  }
  $wb.Close($false)
  $rows | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 $Out
  "Exported $($rows.Count) rows to $Out"
} finally {
  $xl.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
}
