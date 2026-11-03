import { intro, sceneRoot, heartTrigger, skipLink, linksNav, linksNavList, linksNavClose } from './dom.js';
import { rememberScene, groupLinks } from './links.js';

// Version HTML de los carteles 3D: oculta visualmente (sr-only) salvo con foco de teclado
// (:focus-within) o abierta a mano (.open, el modo sin WebGL).
// Se llena con los links ya sanitizados de links.js; si fallan no se muestra nada (el error
// ya queda en .reveal-note).
export function initLinksNav(linksPromise) {
    const ready = linksPromise.then((links) => {
        renderLinks(links);
        linksNav.hidden = false;
        skipLink.hidden = false;
    });
    ready.catch(() => {});

    skipLink.addEventListener('click', (event) => {
        event.preventDefault();
        linksNav.focus();
    });
    linksNavClose.addEventListener('click', close);
    // Click normal en un enlace (no en pestaña nueva): Back vuelve directo a la escena.
    linksNavList.addEventListener('click', (event) => {
        if (event.target.closest('a') && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
            rememberScene();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || linksNav.hidden) {
            return;
        }
        if (linksNav.classList.contains('open') || linksNav.contains(document.activeElement)) {
            close();
        } else if (sceneRoot.classList.contains('visible')) {
            // En la escena 3D (aria-hidden) Escape lleva a los enlaces HTML.
            linksNav.focus();
        }
    });

    function close() {
        const hadFocus = linksNav.contains(document.activeElement);
        linksNav.classList.remove('open');
        if (!hadFocus) {
            return;
        }
        if (intro.classList.contains('fade')) {
            document.activeElement.blur();
        } else {
            heartTrigger.focus();
        }
    }

    // Deja el panel visible (sin depender del foco) y lo enfoca.
    function open() {
        ready.then(() => {
            linksNav.classList.add('open');
            linksNav.focus();
        }, () => {});
    }

    return { open };
}

function renderLinks(links) {
    // Una seccion por categoria (titulo + sublista) y los links sin categoria sueltos.
    const items = groupLinks(links).map((group) => {
        if (group.type === 'link') {
            return renderLink(group.item);
        }
        const children = group.items.map(renderLink).filter(Boolean);
        if (children.length === 0) {
            return null;
        }
        const item = document.createElement('li');
        item.className = 'links-nav-category';
        const title = document.createElement('h3');
        title.className = 'links-nav-category-title';
        title.textContent = group.name;
        const list = document.createElement('ul');
        list.className = 'links-nav-list';
        list.replaceChildren(...children);
        item.append(title, list);
        return item;
    }).filter(Boolean);

    linksNavList.replaceChildren(...items);
}

function renderLink(entry) {
    let href;
    try {
        href = new URL(entry.link, window.location.href);
    } catch {
        return null;
    }
    if (href.protocol !== 'https:' && href.protocol !== 'http:') {
        return null;
    }

    const item = document.createElement('li');
    const anchor = document.createElement('a');
    anchor.href = href.href;
    anchor.textContent = entry.text;
    // Analitica (Umami): mismo evento que el click en el cartel 3D (js/scene.js).
    anchor.dataset.umamiEvent = 'proyecto';
    anchor.dataset.umamiEventNombre = entry.text;
    anchor.dataset.umamiEventUrl = href.href;
    anchor.dataset.umamiEventVia = 'html';
    item.appendChild(anchor);

    if (entry.description) {
        const description = document.createElement('p');
        description.className = 'links-nav-description';
        description.textContent = entry.description;
        item.appendChild(description);
    }
    return item;
}
