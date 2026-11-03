// prefers-reduced-motion en un solo lugar. reducedMotion es un live binding: los loops
// de animacion lo leen en cada frame, asi un cambio en el sistema se aplica sin recargar.
// onReducedMotionChange es para lo que no se lee por frame (el <marquee>).
const query = window.matchMedia('(prefers-reduced-motion: reduce)');
const listeners = new Set();

export let reducedMotion = query.matches;

query.addEventListener('change', (event) => {
    reducedMotion = event.matches;
    listeners.forEach((fn) => fn(reducedMotion));
});

export function onReducedMotionChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
