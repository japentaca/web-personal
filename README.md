# web-personal

Sitio web personal estatico con una portada principal y recursos visuales livianos.

## Estructura

- `index.html`: portada principal (solo HTML; carga `css/main.css` y `js/main.js`)
- `css/main.css`: estilos de la portada
- `js/`: modulos ES de la portada (Three.js desde jsDelivr via importmap)
  - `main.js`: punto de entrada; carga links, arranca la intro y conecta el corazon
  - `dom.js`: referencias a elementos del DOM
  - `links.js`: carga y validacion de `assets/links.json`
  - `intro.js`: lluvia matrix, estela del cursor, lens flare y corazon 3D de la intro
  - `visitor-counter.js`: contador de visitas (HTML y texto 3D)
  - `transitions.js`: overlay dial-up y transicion iris de estrellas
  - `scene.js`: escena 3D principal (carteles, video, animacion)
  - `meshes.js`: fuente 3D, texto 3D y forma de corazon
  - `textures.js`: texturas canvas para carteles y descripciones
  - `shaders.js`: shader CRT, chroma key del video y plasma
- `assets/`: links, cubemap y video
- `_archive/`: archivos legacy archivados
- `deploy.ps1`: script de deploy al servidor (ver abajo)
- `instrucciones.txt`: notas locales (no se sube al repo)

## Deploy

`deploy.ps1` (PowerShell 7) sube solo `index.html`, `css/`, `js/` y `assets/` (archivos versionados + nuevos no ignorados) a `/var/www/jape.com.ar` via tar + scp + ssh, sin borrar nada remoto, y normaliza permisos (755/644) en esas rutas.

```powershell
./deploy.ps1 -DryRun        # lista lo que se subiria, sin conectarse
./deploy.ps1 -Only links    # sube solo assets/links.json
./deploy.ps1                # sube todo el sitio
```

Host, puerto, usuario, ruta remota y clave son parametros con defaults (`-HostName`, `-Port`, `-User`, `-RemotePath`, `-IdentityFile`). Avisa si hay cambios sin commitear. Despues del deploy: Ctrl+F5.
