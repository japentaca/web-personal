import { revealNote } from './dom.js';

// Al salir hacia un proyecto se marca la URL con #cosmico: al volver (Back) o con ese link
// compartido, la pagina abre directo en la escena 3D sin la intro.
export const sceneHash = '#cosmico';

// category: carpeta abierta en la escena al salir (se guarda en history.state para reabrirla al volver).
export function rememberScene(category = null) {
    history.replaceState({ ...history.state, sceneCategory: category }, '', sceneHash);
}

export function rememberedCategory() {
    return history.state?.sceneCategory ?? null;
}

export function forgetScene() {
    if (window.location.hash === sceneHash) {
        history.replaceState({ ...history.state, sceneCategory: null }, '', window.location.pathname + window.location.search);
    }
}

export function showLinksLoadError(message) {
    console.error('[links.json]', message);
    if (revealNote) {
        revealNote.textContent = message;
    }
}

export function sanitizeLinks(input) {
    if (!Array.isArray(input)) {
        throw new Error('links.json invalido: se esperaba un arreglo');
    }

    const clean = input
        .filter((item) => item && typeof item.text === 'string' && typeof item.link === 'string')
        .map((item) => ({
            text: item.text.trim(),
            description: (typeof item.description === 'string' ? item.description.trim() : ''),
            // Opcional: los links con la misma categoria se agrupan en un cartel-carpeta.
            category: (typeof item.category === 'string' ? item.category.trim() : ''),
            link: item.link.trim()
        }))
        .filter((item) => item.text.length > 0 && item.link.length > 0);

    if (clean.length === 0) {
        throw new Error('links.json invalido: no contiene enlaces validos');
    }

    return clean;
}

// Primer nivel de la navegacion: una carpeta por categoria (en orden de aparicion) y los
// links sin categoria sueltos, en el lugar donde aparecen.
// [{ type: 'category', name, items: [...] } | { type: 'link', item }]
export function groupLinks(links) {
    const groups = [];
    const byName = new Map();
    links.forEach((item) => {
        if (!item.category) {
            groups.push({ type: 'link', item });
            return;
        }
        let group = byName.get(item.category);
        if (!group) {
            group = { type: 'category', name: item.category, items: [] };
            byName.set(item.category, group);
            groups.push(group);
        }
        group.items.push(item);
    });
    return groups;
}

export async function loadLinksData() {
    // 'no-cache' revalida siempre con el servidor (ETag/Last-Modified): cambios al instante, sin bajar de nuevo si no cambio.
    const url = new URL('./assets/links.json', window.location.href).href;
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) {
        throw new Error(`No se pudo cargar links.json (HTTP ${response.status})`);
    }

    let data = null;
    try {
        data = await response.json();
    } catch {
        throw new Error('links.json invalido: JSON malformado');
    }

    return sanitizeLinks(data);
}
