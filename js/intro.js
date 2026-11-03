import * as THREE from 'three';
import { cursorTrailLayer, lensFlare } from './dom.js';
import { loadThreeTextFont, createThreeText, createHeartShape } from './meshes.js';
import { reducedMotion, onReducedMotionChange } from './motion.js';

// Devuelve { stop, pause, resume }: pause/resume congelan el rAF sin borrar el canvas
// (se pausa mientras la escena 3D tapa la intro).
export function initMatrixRain(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return { stop() {}, pause() {}, resume() {} };
    }

    const chars = '01$#@%&*+<>[]{};:/\\';
    let width = 0;
    let height = 0;
    let cols = 0;
    let drops = [];
    let rafId = 0;
    let running = false;
    let stillDrawn = false;

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cols = Math.floor(width / 14);
        drops = new Array(cols).fill(0).map(() => Math.random() * height);
        stillDrawn = false;
    }

    function step() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
        ctx.fillRect(0, 0, width, height);
        ctx.font = 'bold 14px Courier New';

        for (let i = 0; i < cols; i++) {
            const x = i * 14;
            const y = drops[i];
            const char = chars[Math.floor(Math.random() * chars.length)];
            ctx.fillStyle = (Math.random() > 0.9) ? '#c7ff99' : '#00ff55';
            ctx.fillText(char, x, y);
            drops[i] = y + 14;
            if (drops[i] > height && Math.random() > 0.975) {
                drops[i] = -20;
            }
        }
    }

    // Con reduced motion queda un cuadro quieto (varios pasos de una vez, con estela).
    function tick() {
        if (!reducedMotion) {
            step();
            stillDrawn = false;
        } else if (!stillDrawn) {
            for (let i = 0; i < 40; i++) {
                step();
            }
            stillDrawn = true;
        }
        rafId = requestAnimationFrame(tick);
    }

    function pause() {
        running = false;
        cancelAnimationFrame(rafId);
    }

    function resume() {
        if (running) {
            return;
        }
        running = true;
        tick();
    }

    resize();
    resume();
    window.addEventListener('resize', resize);

    return {
        pause,
        resume,
        stop() {
            pause();
            window.removeEventListener('resize', resize);
        }
    };
}

export function initCursorTrails() {
    let trailCooldown = 0;
    function onMove(event) {
        const now = performance.now();
        if (reducedMotion || (now - trailCooldown) < 20) {
            return;
        }
        trailCooldown = now;

        const dot = document.createElement('span');
        dot.className = 'trail-dot';
        dot.style.left = event.clientX + 'px';
        dot.style.top = event.clientY + 'px';
        cursorTrailLayer.appendChild(dot);

        const dx = (Math.random() - 0.5) * 24;
        const dy = (Math.random() - 0.5) * 24;
        dot.animate(
            [
                { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95 },
                { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(0.2)', opacity: 0 }
            ],
            { duration: 430, easing: 'ease-out', fill: 'forwards' }
        ).onfinish = () => {
            dot.remove();
        };
    }

    window.addEventListener('mousemove', onMove);
    return () => {
        window.removeEventListener('mousemove', onMove);
        cursorTrailLayer.replaceChildren();
    };
}

export function initIntroLensFlare() {
    const introLinks = Array.from(document.querySelectorAll('.links a'));
    let flareVisible = false;

    function showFlare(event) {
        if (reducedMotion) {
            return;
        }
        flareVisible = true;
        lensFlare.style.opacity = '1';
        lensFlare.style.left = event.clientX + 'px';
        lensFlare.style.top = event.clientY + 'px';
        lensFlare.style.transform = 'translate(-50%, -50%) scale(1)';
    }

    function moveFlare(event) {
        if (!flareVisible) {
            return;
        }
        lensFlare.style.left = event.clientX + 'px';
        lensFlare.style.top = event.clientY + 'px';
    }

    function hideFlare() {
        flareVisible = false;
        lensFlare.style.opacity = '0';
        lensFlare.style.transform = 'translate(-50%, -50%) scale(0.2)';
    }

    introLinks.forEach((link) => {
        link.addEventListener('mouseenter', showFlare);
        link.addEventListener('mousemove', moveFlare);
        link.addEventListener('mouseleave', hideFlare);
    });

    return () => {
        introLinks.forEach((link) => {
            link.removeEventListener('mouseenter', showFlare);
            link.removeEventListener('mousemove', moveFlare);
            link.removeEventListener('mouseleave', hideFlare);
        });
    };
}

export function initIntroHeartPreview(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    let disposed = false;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 30);
    camera.position.set(0, 0.1, 4.1);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const key = new THREE.PointLight(0xff6666, 1.7, 16);
    key.position.set(0.6, 0.7, 2.6);
    scene.add(key);
    const rim = new THREE.PointLight(0xffa1a1, 1.2, 14);
    rim.position.set(-0.9, -0.2, -2.0);
    scene.add(rim);

    const heartGeo = new THREE.ExtrudeGeometry(createHeartShape(), {
        depth: 0.32,
        bevelEnabled: true,
        bevelSize: 0.065,
        bevelThickness: 0.08,
        bevelSegments: 4,
        curveSegments: 30
    });
    const heartMat = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: new THREE.Color(0x650000),
        emissiveIntensity: 0.5,
        roughness: 0.32,
        metalness: 0.1
    });

    const heart = new THREE.Mesh(heartGeo, heartMat);
    heart.scale.set(0.95, 0.95, 0.95);
    heart.rotation.set(0.2, Math.PI, 0.1);
    scene.add(heart);

    let promptText = null;
    let promptTextOutline = null;
    loadThreeTextFont().then((font) => {
        if (disposed) {
            return;
        }

        const textValue = 'Pinchame para acceder a mis proyectos';
        const textMeshData = createThreeText({
            text: textValue,
            font,
            size: 0.13,
            depth: 0.04,
            color: 0x7aff3d,
            align: 'left'
        });
        promptText = textMeshData.mesh;
        scene.add(promptText);

        textMeshData.material.dispose();
        const neonMaterial = new THREE.MeshStandardMaterial({
            color: 0x7aff3d,
            emissive: new THREE.Color(0x2cff00),
            emissiveIntensity: 1.1,
            roughness: 0.3,
            metalness: 0.08
        });
        promptText.material = neonMaterial;

        const outlineData = createThreeText({
            text: textValue,
            font,
            size: 0.136,
            depth: 0.02,
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.86,
            align: 'left'
        });
        promptTextOutline = outlineData.mesh;
        scene.add(promptTextOutline);

        const startX = 1.45;
        const baseY = 0.97;
        const wrapX = -1.55 - textMeshData.width;

        promptText.position.set(startX, baseY, 0.62);
        promptTextOutline.position.set(startX, baseY - 0.01, 0.58);

        promptText.userData.disposeAssets = [textMeshData.geometry, neonMaterial];
        promptTextOutline.userData.disposeAssets = [outlineData.geometry, outlineData.material];

        promptText.userData.ticker = { startX, wrapX, baseY, speed: 0.7 };
        promptTextOutline.userData.ticker = { startX, wrapX, baseY: baseY - 0.01, speed: 0.7 };
    }).catch(() => {});

    let rafId = 0;
    const clock = new THREE.Clock();

    function resize() {
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }

    function animate() {
        const t = clock.getElapsedTime();
        heart.rotation.y = Math.PI + (t * 1.35);
        heart.rotation.x = 0.2 + (Math.sin(t * 2.2) * 0.13);
        heart.position.y = Math.sin(t * 2.5) * 0.08;
        key.intensity = 1.55 + (Math.sin((t * 3.1) + 0.4) * 0.25);

        if (promptText && promptText.userData.ticker) {
            const ticker = promptText.userData.ticker;
            const travel = ticker.startX - ticker.wrapX;
            const phase = (t * ticker.speed) % travel;
            promptText.position.x = ticker.startX - phase;
            promptText.position.y = ticker.baseY + (Math.sin(t * 2.4) * 0.018);
            if (promptText.material && promptText.material.emissive) {
                promptText.material.emissiveIntensity = 1.0 + (Math.sin((t * 4.2) + 0.8) * 0.35);
            }
        }
        if (promptTextOutline && promptTextOutline.userData.ticker) {
            const ticker = promptTextOutline.userData.ticker;
            const travel = ticker.startX - ticker.wrapX;
            const phase = (t * ticker.speed) % travel;
            promptTextOutline.position.x = ticker.startX - phase;
            promptTextOutline.position.y = ticker.baseY + (Math.sin((t * 2.4) + 0.4) * 0.018);
            promptTextOutline.material.opacity = 0.62 + (Math.sin((t * 4.2) + 2.1) * 0.2);
        }

        renderer.render(scene, camera);
        rafId = requestAnimationFrame(animate);
    }

    resize();
    rafId = requestAnimationFrame(animate);
    window.addEventListener('resize', resize);

    return () => {
        disposed = true;
        cancelAnimationFrame(rafId);
        window.removeEventListener('resize', resize);
        if (promptText) {
            scene.remove(promptText);
            (promptText.userData.disposeAssets || []).forEach((asset) => asset.dispose());
        }
        if (promptTextOutline) {
            scene.remove(promptTextOutline);
            (promptTextOutline.userData.disposeAssets || []).forEach((asset) => asset.dispose());
        }
        heartGeo.dispose();
        heartMat.dispose();
        renderer.dispose();
    };
}

// Con reduced motion el <marquee> se cambia por el mismo texto quieto.
export function initIntroMarquee() {
    const marquee = document.querySelector('.marquee marquee');
    if (!marquee) {
        return () => {};
    }
    const still = document.createElement('span');
    still.textContent = marquee.textContent;
    marquee.after(still);

    function apply(reduce) {
        marquee.style.display = reduce ? 'none' : '';
        still.hidden = !reduce;
        if (reduce) {
            marquee.stop();
        } else {
            marquee.start();
        }
    }

    apply(reducedMotion);
    return onReducedMotionChange(apply);
}

// Sin WebGL: corazon plano en 2D (misma curva que createHeartShape) para que el disparador se vea.
export function drawFlatHeart(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.max(1, Math.round(rect.width));
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return;
    }
    const scale = (canvas.width / 2) / 22;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2 - canvas.height * 0.03);
    ctx.beginPath();
    for (let i = 0; i <= 140; i++) {
        const t = (i / 140) * Math.PI * 2;
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        ctx.lineTo(x * scale, -y * scale);
    }
    ctx.closePath();
    const gradient = ctx.createRadialGradient(-5 * scale, -6 * scale, 0, 0, 0, 20 * scale);
    gradient.addColorStop(0, '#ff7b7b');
    gradient.addColorStop(1, '#d10000');
    ctx.fillStyle = gradient;
    ctx.shadowColor = 'rgba(255, 60, 60, 0.8)';
    ctx.shadowBlur = 12 * dpr;
    ctx.fill();
    ctx.restore();
}
