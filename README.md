# web-personal

Sitio web personal estatico con una portada principal y una experiencia 3D en `espacio/`.

## Estructura

- `index.html`: portada principal
- `assets/`: links, cubemap y video
- `espacio/`: escena 3D, audio, imagenes y modulos JS
- `_archive/`: archivos legacy archivados
- `instrucciones.txt`: notas locales (no se sube al repo)

## Descripcion

El proyecto combina una portada de estilo retro-web con una seccion inmersiva de exploracion espacial en 3D. La portada funciona como hub visual y de navegacion, mientras que `espacio/` concentra la simulacion con recursos graficos, audio y modulos de logica.

## Mantenimiento de escena 3D

- Mapa de cambios por responsabilidad: `espacio/modules/scene/CHANGE_MAP.md`
- Configuracion de arranque de escena (JSON): `espacio/scene.definition.json`
- El arranque ya no depende de `espacio/audio/sets.js`; ese archivo legacy fue retirado y la cola/definiciones de audio se leen desde JSON.
- Scripts de apoyo de audio (`annotate-durations.mjs`, `transcribe-set4.mjs`) actualizan `scene.definition.json`.
- Campos de `scene.definition.json`:
	- `initializeScene`: inicia o no la escena 3D
	- `scene3d`: definicion completa de camara, luces, cuerpos, orbitas y efectos visuales
	- `baseTracks`: modo hibrido con formato canonico (grupos en paralelo + crossfade entre grupos)
		- `{ "tracks": ["./audio/a.mp3", "./audio/b.mp3"], "crossfadeSec": 10, "holdSec": 32, "volumeDb": -3 }`
		- `crossfadeSec` por defecto: `10`
	- `audioSetLibrary`: diccionario de sets disponibles
	- `audioQueue`: orden de reproduccion (ids del diccionario o definiciones inline)
- Orquestador principal de runtime: `espacio/modules/scene.js`
- Utilidades y shaders de escena: `espacio/modules/scene/sceneUtils.js`
- Particulas de Marte: `espacio/modules/scene/marsParticles.js`
- Parametros y estado inicial: `espacio/modules/scene/sceneStateFactory.js`
- Tours orbitales de camara/sonda: `espacio/modules/scene/toursController.js`
- Input, resize y HUD de FPS: `espacio/modules/scene/uiController.js`
- Visuales audio-reactivos: `espacio/modules/scene/reactiveController.js`
- Texto cosmico (spawn/update/fade): `espacio/modules/scene/cosmicTextController.js`
