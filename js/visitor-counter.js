import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { visitorCounterEl } from './dom.js';

const visitorTickerMs = 2000;
// Se inicializa en initVisitorCounter() a partir de window.visitorCountValue.
let visitorCountValue = 0;

let activeVisitorTextState = null;
// El contador HTML vive dentro de la intro: mientras la escena 3D la tapa no se toca el DOM.
let introCounterVisible = true;
let tickerId = 0;

export function formatVisitorText() {
    return 'Usted es el visitante nro: ' + visitorCountValue.toLocaleString('es-AR');
}

function renderVisitorCounterHtml() {
    visitorCounterEl.textContent = visitorCountValue.toLocaleString('es-AR');
}

function updateActiveVisitorTextGeometry() {
    if (!activeVisitorTextState || !activeVisitorTextState.mesh) {
        return;
    }

    const geometry = new TextGeometry(formatVisitorText(), {
        font: activeVisitorTextState.font,
        size: activeVisitorTextState.size,
        depth: activeVisitorTextState.depth,
        curveSegments: 10,
        bevelEnabled: false
    });
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    const width = bb ? (bb.max.x - bb.min.x) : 0;
    geometry.translate(-width / 2, 0, 0);

    const oldGeometry = activeVisitorTextState.mesh.geometry;
    activeVisitorTextState.mesh.geometry = geometry;
    oldGeometry.dispose();
}

function tickVisitorCounter() {
    const roll = Math.random();
    let increment = 1;
    if (roll < 0.55) {
        increment = 1 + Math.floor(Math.random() * 3); // 1..3 (comun)
    } else if (roll < 0.85) {
        increment = 4 + Math.floor(Math.random() * 3); // 4..6 (ocasional)
    } else if (roll < 0.97) {
        increment = 7 + Math.floor(Math.random() * 2); // 7..8 (raro)
    } else {
        increment = 9 + Math.floor(Math.random() * 2); // 9..10 (muy raro)
    }

    visitorCountValue += increment;
    window.visitorCountValue = visitorCountValue;
    if (introCounterVisible) {
        renderVisitorCounterHtml();
    }
    // Solo hay estado activo mientras existe la escena 3D.
    updateActiveVisitorTextGeometry();
}

function startTicker() {
    if (!tickerId) {
        tickerId = setInterval(tickVisitorCounter, visitorTickerMs);
    }
}

function stopTicker() {
    clearInterval(tickerId);
    tickerId = 0;
}

export function initVisitorCounter() {
    visitorCountValue = Number(window.visitorCountValue);
    if (!Number.isFinite(visitorCountValue)) {
        visitorCountValue = Math.floor(Math.random() * 1000000) + 1000000;
    }
    window.visitorCountValue = visitorCountValue;

    renderVisitorCounterHtml();
    // En pestaña oculta no se ve nada: se pausa el ticker.
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopTicker();
        } else {
            startTicker();
        }
    });
    if (!document.hidden) {
        startTicker();
    }
}

// La escena avisa cuando tapa / destapa la intro; al volver se pinta el valor actual.
export function setIntroCounterVisible(visible) {
    introCounterVisible = visible;
    if (visible) {
        renderVisitorCounterHtml();
    }
}

// Texto 3D del contador dentro de la escena (se regenera en cada tick).
export function setActiveVisitorText(state) {
    activeVisitorTextState = state;
}

export function disposeActiveVisitorText() {
    if (activeVisitorTextState) {
        activeVisitorTextState.mesh.geometry.dispose();
        activeVisitorTextState = null;
    }
}
