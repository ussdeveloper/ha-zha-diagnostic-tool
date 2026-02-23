<#
.SYNOPSIS
    ZHA Diagnostic Tool — Build & Deploy Script
.DESCRIPTION
    Interactive PowerShell menu for building, versioning, and deploying the HA add-on.
    Use arrow keys to navigate, Enter to select.
#>

param(
    [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot
if (-not $RepoRoot) { $RepoRoot = Get-Location }

$AddonDir   = Join-Path $RepoRoot "addons\zha_diagnostic_tool"
$ConfigYaml = Join-Path $AddonDir "config.yaml"
$AddonCL    = Join-Path $AddonDir "CHANGELOG.md"
$RootCL     = Join-Path $RepoRoot "CHANGELOG.md"

# ===== Helpers =====

function Get-AddonVersion {
    $content = Get-Content $ConfigYaml -Raw
    if ($content -match 'version:\s*"(\d+\.\d+\.\d+)"') {
        return $Matches[1]
    }
    throw "Cannot parse version from config.yaml"
}

function Set-AddonVersion {
    param([string]$NewVersion)
    $content = Get-Content $ConfigYaml -Raw
    $content = $content -replace 'version:\s*"\d+\.\d+\.\d+"', "version: `"$NewVersion`""
    Set-Content $ConfigYaml -Value $content -NoNewline
}

function Get-RootVersion {
    param([string]$AddonVersion)
    $parts = $AddonVersion.Split(".")
    $major = [int]$parts[0]
    $minor = [int]$parts[1] + 1
    $patch = [int]$parts[2]
    return "$major.$minor.$patch"
}

function Bump-Version {
    param(
        [ValidateSet("patch","minor","major")]
        [string]$Type = "patch"
    )

    $current = Get-AddonVersion
    $parts = $current.Split(".")
    $major = [int]$parts[0]
    $minor = [int]$parts[1]
    $patch = [int]$parts[2]

    switch ($Type) {
        "patch" { $patch++ }
        "minor" { $minor++; $patch = 0 }
        "major" { $major++; $minor = 0; $patch = 0 }
    }

    $newAddon = "$major.$minor.$patch"
    $newRoot  = Get-RootVersion $newAddon
    $date     = Get-Date -Format "yyyy-MM-dd"

    # Update config.yaml
    Set-AddonVersion $newAddon
    Write-Host "  config.yaml: $current -> $newAddon" -ForegroundColor Green

    # Update add-on CHANGELOG
    $addonContent = Get-Content $AddonCL -Raw
    $entry = "## [$newAddon] - $date`n`n### Changed`n- Version bump`n`n"
    $addonContent = $addonContent -replace '(# Changelog - ZHA Diagnostic Companion\r?\n\r?\n)', "`$1$entry"
    Set-Content $AddonCL -Value $addonContent -NoNewline
    Write-Host "  add-on CHANGELOG: [$newAddon]" -ForegroundColor Green

    # Update root CHANGELOG
    $rootContent = Get-Content $RootCL -Raw
    $rootEntry = "## [$newRoot] - $date`n`n### Changed`n- Version bump`n`n"
    $rootContent = $rootContent -replace '(Format inspirowany Keep a Changelog.*?\r?\n\r?\n)', "`$1$rootEntry"
    Set-Content $RootCL -Value $rootContent -NoNewline
    Write-Host "  root CHANGELOG: [$newRoot]" -ForegroundColor Green

    return $newAddon
}

function Git-CommitAndPush {
    param([string]$Message)
    Push-Location $RepoRoot
    try {
        git add -A
        git commit -m $Message
        git push
        $hash = git log -1 --format="%h"
        Write-Host "`n  Committed: $hash" -ForegroundColor Cyan
        Write-Host "  Pushed to origin/main" -ForegroundColor Cyan
    } finally {
        Pop-Location
    }
}

function Show-Status {
    Write-Host ""
    Write-Host "  ========================================" -ForegroundColor DarkCyan
    Write-Host "  ZHA Diagnostic Tool — Status" -ForegroundColor Cyan
    Write-Host "  ========================================" -ForegroundColor DarkCyan
    $ver = Get-AddonVersion
    Write-Host "  Add-on version : $ver" -ForegroundColor White
    Write-Host "  Root version   : $(Get-RootVersion $ver)" -ForegroundColor White
    Push-Location $RepoRoot
    $branch = git branch --show-current
    $hash   = git log -1 --format="%h %s"
    $status = git status --porcelain
    Pop-Location
    Write-Host "  Git branch     : $branch" -ForegroundColor White
    Write-Host "  Last commit    : $hash" -ForegroundColor White
    if ($status) {
        Write-Host "  Working tree   : DIRTY ($($status.Count) changed files)" -ForegroundColor Yellow
    } else {
        Write-Host "  Working tree   : Clean" -ForegroundColor Green
    }
    Write-Host ""
}

# ===== Interactive Menu =====

function Show-Menu {
    $options = @(
        @{ Key = "1"; Label = "Podbij wersje (patch) + commit + push"; Action = "bump-patch" }
        @{ Key = "2"; Label = "Podbij wersje (minor) + commit + push"; Action = "bump-minor" }
        @{ Key = "3"; Label = "Commit + push (bez bump)";              Action = "push-only" }
        @{ Key = "4"; Label = "Pokaz status";                          Action = "status" }
        @{ Key = "5"; Label = "Wyczysc .bak pliki";                    Action = "clean" }
        @{ Key = "Q"; Label = "Wyjscie";                               Action = "exit" }
    )

    $selected = 0

    while ($true) {
        Clear-Host
        Write-Host ""
        Write-Host "  ╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
        Write-Host "  ║   ZHA Diagnostic Tool — Build & Deploy      ║" -ForegroundColor Cyan
        Write-Host "  ╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
        $ver = Get-AddonVersion
        Write-Host "  Aktualna wersja: $ver" -ForegroundColor DarkGray
        Write-Host ""

        for ($i = 0; $i -lt $options.Count; $i++) {
            if ($i -eq $selected) {
                Write-Host "  ► " -NoNewline -ForegroundColor Cyan
                Write-Host "$($options[$i].Key). $($options[$i].Label)" -ForegroundColor White
            } else {
                Write-Host "    $($options[$i].Key). $($options[$i].Label)" -ForegroundColor DarkGray
            }
        }

        Write-Host ""
        Write-Host "  Użyj ↑↓ + Enter lub wcisnij numer" -ForegroundColor DarkGray

        $key = [System.Console]::ReadKey($true)

        switch ($key.Key) {
            "UpArrow"   { $selected = [Math]::Max(0, $selected - 1) }
            "DownArrow" { $selected = [Math]::Min($options.Count - 1, $selected + 1) }
            "Enter"     { return $options[$selected].Action }
            default {
                $ch = $key.KeyChar.ToString().ToUpper()
                $match = $options | Where-Object { $_.Key -eq $ch }
                if ($match) { return $match.Action }
            }
        }
    }
}

# ===== Main Loop =====

if ($NonInteractive) {
    Write-Host "Non-interactive: bump patch + push"
    $newVer = Bump-Version -Type "patch"
    Git-CommitAndPush "chore: bump version to $newVer"
    exit 0
}

while ($true) {
    $action = Show-Menu

    Clear-Host
    Write-Host ""

    switch ($action) {
        "bump-patch" {
            Write-Host "  Podbijanie wersji (patch)..." -ForegroundColor Yellow
            $newVer = Bump-Version -Type "patch"
            Git-CommitAndPush "chore: bump version to $newVer"
            Show-Status
            Read-Host "  Enter aby kontynuowac"
        }
        "bump-minor" {
            Write-Host "  Podbijanie wersji (minor)..." -ForegroundColor Yellow
            $newVer = Bump-Version -Type "minor"
            Git-CommitAndPush "chore: bump version to $newVer"
            Show-Status
            Read-Host "  Enter aby kontynuowac"
        }
        "push-only" {
            Write-Host "  Commit + push..." -ForegroundColor Yellow
            $msg = Read-Host "  Commit message"
            if (-not $msg) { $msg = "chore: update" }
            Git-CommitAndPush $msg
            Show-Status
            Read-Host "  Enter aby kontynuowac"
        }
        "status" {
            Show-Status
            Read-Host "  Enter aby kontynuowac"
        }
        "clean" {
            $baks = Get-ChildItem -Path $RepoRoot -Recurse -Filter "*.bak" -File
            if ($baks.Count -eq 0) {
                Write-Host "  Brak plikow .bak" -ForegroundColor Green
            } else {
                foreach ($f in $baks) {
                    Remove-Item $f.FullName
                    Write-Host "  Usunieto: $($f.FullName)" -ForegroundColor Yellow
                }
            }
            Read-Host "  Enter aby kontynuowac"
        }
        "exit" {
            Write-Host "  Do zobaczenia!" -ForegroundColor Cyan
            exit 0
        }
    }
}
