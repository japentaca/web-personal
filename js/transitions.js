import { dialupOverlay, dialupFill, dialupText, transitionOverlay, starBurst, irisRing } from './dom.js';

export async function playDialupOverlay() {
    dialupOverlay.classList.add('show');
    dialupFill.style.width = '0%';
    dialupText.textContent = 'Conectando a JapeNet 56k...';

    const steps = [
        { p: 12, t: 'Marcando... piiip-krrr-shhhh' },
        { p: 34, t: 'Negociando protocolo PPP...' },
        { p: 57, t: 'Autenticando usuario invitado...' },
        { p: 78, t: 'Cargando estrellas y glitches VHS...' },
        { p: 100, t: 'Conexion establecida.' }
    ];

    for (const step of steps) {
        await new Promise((resolve) => setTimeout(resolve, 140 + Math.random() * 100));
        dialupFill.style.width = step.p + '%';
        dialupText.textContent = step.t;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
    dialupOverlay.classList.remove('show');
}

export async function playStarIrisTransition() {
    transitionOverlay.classList.add('show');
    starBurst.style.transform = 'translate(-50%, -50%) scale(0.05)';
    irisRing.style.transform = 'translate(-50%, -50%) scale(0.08)';
    starBurst.style.opacity = '1';
    irisRing.style.opacity = '1';

    await new Promise((resolve) => requestAnimationFrame(resolve));
    starBurst.style.transition = 'transform 520ms cubic-bezier(0.2, 0.8, 0.15, 1), opacity 520ms ease';
    irisRing.style.transition = 'transform 620ms cubic-bezier(0.15, 0.85, 0.18, 1), opacity 620ms ease';
    starBurst.style.transform = 'translate(-50%, -50%) scale(34)';
    starBurst.style.opacity = '0';
    irisRing.style.transform = 'translate(-50%, -50%) scale(42)';
    irisRing.style.opacity = '0';

    await new Promise((resolve) => setTimeout(resolve, 680));
    transitionOverlay.classList.remove('show');
    starBurst.style.transition = '';
    irisRing.style.transition = '';
}
