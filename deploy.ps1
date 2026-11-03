#requires -Version 7
<#
.SYNOPSIS
    Sube el sitio (index.html, css/, js/, assets/) a jape.com.ar.

.DESCRIPTION
    Arma la lista de archivos con git (versionados + nuevos no ignorados) limitada a
    index.html, css, js y assets; empaqueta en un .tar local, lo sube con scp a /tmp
    del servidor y lo extrae sobre la raiz web con una sola sesion ssh.
    Nunca borra nada remoto (solo el .tar temporal propio en /tmp): los archivos del
    servidor que no estan en el repo (app-release.apk, shoutcast-player/, proyectos/...)
    quedan intactos. Luego normaliza permisos (755 dirs / 644 archivos) y ownership
    (jape:jape si existe el usuario) sobre las rutas subidas, como indica instrucciones.txt.

.PARAMETER Only
    'all' (default) sube todo el sitio; 'links' sube solo assets/links.json.

.PARAMETER DryRun
    Lista lo que se subiria, sin conectarse.

.EXAMPLE
    ./deploy.ps1 -DryRun
    ./deploy.ps1 -Only links
    ./deploy.ps1
#>
[CmdletBinding()]
param(
    [ValidateSet('all', 'links')]
    [string]$Only = 'all',
    [switch]$DryRun,
    [string]$HostName = '152.42.140.208',
    [int]$Port = 51312,
    [string]$User = 'root',
    [string]$RemotePath = '/var/www/jape.com.ar',
    # Ruta a la clave privada (no es un secreto en si). Vacio = usar ssh-agent / ~/.ssh/config.
    [string]$IdentityFile = (Join-Path $HOME '.ssh/general_todos')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Native {
    param([string]$Exe, [string[]]$ArgList)
    & $Exe @ArgList
    if ($LASTEXITCODE -ne 0) { throw "$Exe fallo (exit $LASTEXITCODE)" }
}

$repo = $PSScriptRoot
Push-Location $repo
try {
    # Rutas de primer nivel permitidas (lista explicita, nunca "todo").
    [string[]]$include = if ($Only -eq 'links') { @('assets/links.json') } else { @('index.html', 'css', 'js', 'assets') }

    # Versionados + no versionados no ignorados; se filtran los borrados del working tree.
    $files = @(git ls-files --cached --others --exclude-standard -- $include)
    if ($LASTEXITCODE -ne 0) { throw 'git ls-files fallo' }
    $files = @($files | Sort-Object -Unique | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
    if ($files.Count -eq 0) { throw 'No hay archivos para subir.' }

    # Aviso (no bloquea) si hay cambios sin commitear.
    $dirty = @(git status --porcelain)
    if ($dirty.Count -gt 0) {
        Write-Warning "El working tree tiene $($dirty.Count) cambio(s) sin commitear; se sube el estado local tal cual."
    }

    $totalBytes = ($files | ForEach-Object { (Get-Item -LiteralPath $_).Length } | Measure-Object -Sum).Sum
    Write-Host "Archivos a subir ($($files.Count), $([math]::Round($totalBytes / 1MB, 2)) MB) -> ${User}@${HostName}:${RemotePath}"
    $files | ForEach-Object { Write-Host "  $_" }

    if ($DryRun) {
        Write-Host 'DryRun: no se subio nada.'
        return
    }

    $sshOpts = @('-o', 'ConnectTimeout=15')
    if ($IdentityFile -and (Test-Path -LiteralPath $IdentityFile)) {
        $sshOpts += @('-i', $IdentityFile, '-o', 'IdentitiesOnly=yes')
    }
    $target = "$User@$HostName"

    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $localTar = Join-Path ([IO.Path]::GetTempPath()) "jape-deploy-$stamp.tar"
    $listFile = Join-Path ([IO.Path]::GetTempPath()) "jape-deploy-$stamp.txt"
    $remoteTar = "/tmp/jape-deploy-$stamp.tar"
    try {
        # ustar: sin cabeceras pax/xattr de Windows que GNU tar avisaria al extraer.
        [IO.File]::WriteAllLines($listFile, [string[]]$files)
        Invoke-Native 'tar' @('--format', 'ustar', '-cf', $localTar, '-T', $listFile)

        Write-Host 'Subiendo...'
        Invoke-Native 'scp' (@('-P', "$Port") + $sshOpts + @($localTar, "${target}:$remoteTar"))

        # Extrae (sin borrar nada existente), limpia el tar temporal y normaliza permisos
        # solo en las rutas desplegadas.
        $paths = ($include | ForEach-Object { "'$_'" }) -join ' '
        $remoteCmd = @(
            'set -e'
            "cd '$RemotePath'"
            "tar --no-same-owner -xf '$remoteTar'"
            "rm -f '$remoteTar'"
            "find $paths -type d -exec chmod 755 {} +"
            "find $paths -type f -exec chmod 644 {} +"
            "if id -u jape >/dev/null 2>&1; then chown -R jape:jape $paths; fi"
            'ls -l index.html assets/links.json'
        ) -join '; '
        Invoke-Native 'ssh' (@('-p', "$Port") + $sshOpts + @($target, $remoteCmd))

        Write-Host 'Deploy OK. Recarga forzada (Ctrl+F5) para ver los cambios.'
    }
    finally {
        Remove-Item -LiteralPath $localTar, $listFile -ErrorAction SilentlyContinue
    }
}
finally {
    Pop-Location
}
