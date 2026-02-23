param(
  [string]$RawDir = "skills\xianyu-post-gen\咸鱼数据（未加工）",
  [string]$RefDir = "skills\xianyu-post-gen\references",
  [int]$TopPerCategory = 20
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -Path $RawDir)) {
  throw "RawDir not found: $RawDir"
}

if (-not (Test-Path -Path $RefDir)) {
  New-Item -Path $RefDir -ItemType Directory | Out-Null
}

$categoryMap = @(
  @{ Ref = "reference_major_ai_and_automation.md"; Category = "大类-AI与自动化"; Files = @("AI_自动化_教程_full_data.jsonl", "n8n_自动化_教程_full_data.jsonl", "LangChain_教程_full_data.jsonl", "机器学习_入门_教程_full_data.jsonl"); Desc = "AI 自动化、LangChain、机器学习与相关教程商品"; NormalizedCategory = "ai_automation" },
  @{ Ref = "reference_major_programming_and_development.md"; Category = "大类-编程与开发"; Files = @("Python_爬虫_教程_full_data.jsonl", "Python_自动化_办公_教程_full_data.jsonl", "前端_开发_教程_full_data.jsonl"); Desc = "Python、前端、工程开发类教程商品"; NormalizedCategory = "programming" },
  @{ Ref = "reference_major_deployment_and_ops.md"; Category = "大类-部署与运维"; Files = @("Docker_部署_教程_full_data.jsonl", "openclaw_部署_full_data.jsonl"); Desc = "Docker、服务部署、环境搭建与运维商品"; NormalizedCategory = "deployment_ops" },
  @{ Ref = "reference_major_account_and_misc.md"; Category = "大类-账号与杂项"; Files = @("Cursor_拼车_full_data.jsonl"); Desc = "账号拼车、订阅分摊与其他服务型商品"; NormalizedCategory = "account_misc" }
)

function Parse-Price([string]$raw) {
  if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
  $clean = $raw -replace "[^0-9\.]", ""
  if ([string]::IsNullOrWhiteSpace($clean)) { return $null }
  $num = 0.0
  if ([double]::TryParse($clean, [ref]$num)) { return $num }
  return $null
}

function Median([double[]]$nums) {
  if (-not $nums -or $nums.Count -eq 0) { return $null }
  $s = $nums | Sort-Object
  $n = $s.Count
  if ($n % 2 -eq 1) { return $s[[int]($n / 2)] }
  return (($s[$n / 2 - 1] + $s[$n / 2]) / 2)
}

$knownFiles = @()
foreach ($g in $categoryMap) { $knownFiles += $g.Files }
$allJsonl = @(Get-ChildItem -Path $RawDir -File -Filter *.jsonl | Select-Object -ExpandProperty Name)
$unknownFiles = @($allJsonl | Where-Object { $knownFiles -notcontains $_ })
if ($unknownFiles.Count -gt 0) {
  for ($idx = 0; $idx -lt $categoryMap.Count; $idx++) {
    if ($categoryMap[$idx].Ref -eq "reference_major_account_and_misc.md") {
      $categoryMap[$idx].Files = @($categoryMap[$idx].Files + $unknownFiles)
      break
    }
  }
}

$catalog = @()
$examples = @()

foreach ($group in $categoryMap) {
  $records = @()
  $failed = 0

  foreach ($fname in $group.Files) {
    $path = Join-Path $RawDir $fname
    if (-not (Test-Path $path)) { continue }

    Get-Content -Path $path -Encoding utf8 | ForEach-Object {
      $line = $_
      if ([string]::IsNullOrWhiteSpace($line)) { return }

      try {
        $obj = $line | ConvertFrom-Json -ErrorAction Stop
        $item = $obj."商品信息"
        if (-not $item) { return }

        $title = [string]$item."商品标题"
        if ([string]::IsNullOrWhiteSpace($title)) { return }

        $priceRaw = [string]$item."当前售价"
        if (-not $priceRaw) { $priceRaw = [string]$item."商品价格" }
        $price = Parse-Price $priceRaw

        $want = 0
        if ($item.PSObject.Properties.Name -contains "“想要”人数") { $want = [int]$item."“想要”人数" }
        elseif ($item.PSObject.Properties.Name -contains "想要人数") { $want = [int]$item."想要人数" }

        $publish = [string]$item."发布时间"
        $titleSafe = $title.Replace("|", "/").Replace("`n", " ").Trim()

        $record = [pscustomobject]@{
          title = $titleSafe
          priceRaw = $priceRaw
          price = $price
          want = $want
          publish = $publish
          normalizedCategory = $group.NormalizedCategory
          source = $fname
        }

        $records += $record
      }
      catch {
        $failed++
      }
    }
  }

  $total = $records.Count + $failed
  $priceNums = @($records | Where-Object { $_.price -ne $null } | ForEach-Object { [double]$_.price })
  $wantNums = @($records | ForEach-Object { [int]$_.want })

  $pMin = if ($priceNums.Count) { ($priceNums | Measure-Object -Minimum).Minimum } else { $null }
  $pMax = if ($priceNums.Count) { ($priceNums | Measure-Object -Maximum).Maximum } else { $null }
  $pAvg = if ($priceNums.Count) { [math]::Round((($priceNums | Measure-Object -Average).Average), 2) } else { $null }
  $pMed = if ($priceNums.Count) { [math]::Round((Median $priceNums), 2) } else { $null }

  $wMin = if ($wantNums.Count) { ($wantNums | Measure-Object -Minimum).Minimum } else { $null }
  $wMax = if ($wantNums.Count) { ($wantNums | Measure-Object -Maximum).Maximum } else { $null }
  $wAvg = if ($wantNums.Count) { [math]::Round((($wantNums | Measure-Object -Average).Average), 2) } else { $null }

  $top = $records | Sort-Object -Property @{ Expression = "want"; Descending = $true }, @{ Expression = "price"; Descending = $false } | Select-Object -First ([Math]::Max(5, $TopPerCategory))

  $lines = @()
  $lines += "# Reference: $($group.Category)"
  $lines += ""
  $lines += "## 分类用途"
  $lines += "- $($group.Desc)"
  $lines += ""
  $lines += "## 数据规模与质量"
  $lines += "- 总行数: $total"
  $lines += "- 解析成功: $($records.Count)"
  $lines += "- 解析失败: $failed"
  $lines += ""
  $lines += "## 价格分布（按当前售价）"
  $lines += "- 最低价: " + ($(if ($pMin -ne $null) { "¥" + [math]::Round($pMin, 2) } else { "N/A" }))
  $lines += "- 中位价: " + ($(if ($pMed -ne $null) { "¥" + [math]::Round($pMed, 2) } else { "N/A" }))
  $lines += "- 均价: " + ($(if ($pAvg -ne $null) { "¥" + [math]::Round($pAvg, 2) } else { "N/A" }))
  $lines += "- 最高价: " + ($(if ($pMax -ne $null) { "¥" + [math]::Round($pMax, 2) } else { "N/A" }))
  $lines += ""
  $lines += "## 热度分布（按想要人数）"
  $lines += "- 最低: $wMin"
  $lines += "- 均值: $wAvg"
  $lines += "- 最高: $wMax"
  $lines += ""
  $lines += "## 高热度样本（Top $([Math]::Max(5, $TopPerCategory)))"
  $lines += "| 标题 | 价格 | 想要人数 | 发布时间 |"
  $lines += "|---|---:|---:|---|"
  foreach ($r in $top) {
    $pr = if ($r.priceRaw) { $r.priceRaw } else { "—" }
    $pub = if ($r.publish) { $r.publish } else { "—" }
    $lines += "| $($r.title) | $pr | $($r.want) | $pub |"

    $examples += [pscustomobject]@{
      title = $r.title
      product_name = if ($r.title.Length -gt 24) { $r.title.Substring(0, 24) } else { $r.title }
      price = $r.price
      price_text = $pr
      want_count = $r.want
      category = $group.NormalizedCategory
      condition = "used"
      publish_time = $pub
      selling_points = @()
    }
  }
  $lines += ""
  $lines += "## Agent 使用建议"
  $lines += "- 仅加载当前主题 reference 做标题和定价参考。"
  $lines += "- 优先复用高热度样本的卖点结构（问题-价值-交付-售后）。"
  if ($group.Category -like "*账号*") { $lines += "- 注意该类目有合规风险，避免违规引导。" }

  Set-Content -Path (Join-Path $RefDir $group.Ref) -Value ($lines -join "`r`n") -Encoding utf8

  $catalog += [pscustomobject]@{
    category = $group.Category
    ref = $group.Ref
    total = $total
    success = $records.Count
    failed = $failed
    pMin = $pMin
    pMax = $pMax
  }
}

$sum = @()
$sum += "# Reference Catalog (Processed)"
$sum += ""
$sum += "## 总览"
$sum += "| 分类 | reference | 总行数 | 成功 | 失败 | 价格区间 |"
$sum += "|---|---|---:|---:|---:|---|"
foreach ($c in $catalog) {
  $range = if ($c.pMin -ne $null) { "¥" + [math]::Round($c.pMin, 2) + " ~ ¥" + [math]::Round($c.pMax, 2) } else { "N/A" }
  $sum += "| $($c.category) | $($c.ref) | $($c.total) | $($c.success) | $($c.failed) | $range |"
}
$sum += ""
$sum += "## 约束"
$sum += "- 上层 Agent 仅按大类 reference 按需加载。"
$sum += "- 新数据进入预处理后，直接更新对应 reference。"
Set-Content -Path (Join-Path $RefDir "REFERENCE_CATALOG.md") -Value ($sum -join "`r`n") -Encoding utf8

$examplesPath = Join-Path $RefDir "market_examples.json"
$examples | ConvertTo-Json -Depth 8 | Set-Content -Path $examplesPath -Encoding utf8

Write-Output "DONE"
