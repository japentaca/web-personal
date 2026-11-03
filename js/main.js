import { heartTrigger, matrixRain, revealNote } from './dom.js';
import { loadLinksData, showLinksLoadError, sceneHash } from './links.js';
import { initLinksNav } from './links-nav.js';
import { initMatrixRain, initCursorTrails, initIntroLensFlare, initIntroMarquee, drawFlatHeart } from './intro.js';
import { initVisitorCounter } from './visitor-counter.js';
import { setupReveal, runReveal } from './scene.js';

// Los links cargan en paralelo; la intro arranca sin esperarlos.
const linksPromise = loadLinksData();
linksPromise.catch((error) => {
    const message = (error && error.message)
        ? error.message
        : 'No se pudo cargar links.json';
    showLinksLoadError(message);
});

const linksNav = initLinksNav(linksPromise);

// three r163+ solo funciona con WebGL2: sin eso el corazon muestra la lista HTML de enlaces.
function hasWebGL2() {
    try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) {
            return false;
        }
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return true;
    } catch {
        return false;
    }
}
const webglAvailable = hasWebGL2();
if (!webglAvailable) {
    drawFlatHeart(heartTrigger);
    heartTrigger.setAttribute('aria-label', 'Mostrar enlaces');
    linksPromise.then(() => {
        revealNote.textContent = 'Haz click en el corazón para ver los enlaces';
    }, () => {});
}
const onHeartActivate = webglAvailable ? runReveal : linksNav.open;

const matrixRainCtl = initMatrixRain(matrixRain);
const stopCursorTrails = initCursorTrails();
const stopIntroLensFlare = initIntroLensFlare();
initIntroMarquee();

initVisitorCounter();

// Lo que solo se ve en la intro se pausa mientras la escena 3D la tapa.
// (Las estelas del cursor y el lens flare quedan: las estelas se ven sobre la escena
// y el flare solo reacciona a hover sobre links de la intro, que queda sin pointer-events.)
if (webglAvailable) {
    setupReveal(linksPromise, {
        onSceneShown: () => matrixRainCtl.pause(),
        onIntroShown: () => matrixRainCtl.resume()
    });
}

// Con #cosmico (Back desde un proyecto o link compartido) se salta la intro.
// Sin WebGL se abre la lista HTML de enlaces.
function openSceneIfHashed() {
    if (window.location.hash === sceneHash) {
        if (webglAvailable) {
            runReveal({ fast: true });
        } else {
            linksNav.open();
        }
    }
}
openSceneIfHashed();
// Restaurada desde el bfcache: si se salio desde la intro (enlaces HTML) la escena no existe aun.
window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        openSceneIfHashed();
    }
});

heartTrigger.addEventListener('click', onHeartActivate);
heartTrigger.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onHeartActivate();
    }
});

// pagehide (no beforeunload): si la pagina entra al bfcache sigue viva y no se corta nada.
window.addEventListener('pagehide', (event) => {
    if (event.persisted) {
        return;
    }
    matrixRainCtl.stop();
    stopCursorTrails();
    stopIntroLensFlare();
});
