import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { intro, sceneRoot, heartTrigger, linksNav } from './dom.js';
import { playDialupOverlay, playStarIrisTransition } from './transitions.js';
import { initIntroHeartPreview } from './intro.js';
import { crtShader, createVideoChromaMaterial, createPlasmaMaterial } from './shaders.js';
import { loadThreeTextFont, createThreeText, createHeartShape } from './meshes.js';
import { createSignTexture, createDescriptionTexture } from './textures.js';
import { forgetScene, rememberScene, rememberedCategory, groupLinks } from './links.js';
import { reducedMotion } from './motion.js';
import { formatVisitorText, setActiveVisitorText, disposeActiveVisitorText, setIntroCounterVisible } from './visitor-counter.js';

const useCubemap = true;
let revealStarted = false;
const cinematic = {
    durationSec: 3,
    startZ: 6.3,
    endZ: 11.2,
    swayX: 0.28,
    swayY: 0.12,
    roll: 0.035
};

let linksPromise = Promise.resolve([]);
let stopIntroHeartPreview = () => {};
let introHooks = { onSceneShown() {}, onIntroShown() {} };
// Coincide con la transition de opacidad de #intro (css/main.css).
const introFadeMs = 700;

// Recibe la promesa de los links (se resuelve en paralelo a la intro) y arranca el corazon 3D.
// hooks.onSceneShown / onIntroShown: pausar / reanudar animaciones propias de la intro.
export function setupReveal(promise, hooks = {}) {
    linksPromise = promise;
    introHooks = { ...introHooks, ...hooks };
    stopIntroHeartPreview = initIntroHeartPreview(heartTrigger);

    // Precarga el cielo cuando la intro esta ociosa, asi ya esta en cache al clickear el corazon.
    if (useCubemap) {
        setTimeout(() => {
            const preload = () => loadSkyCubemap().catch(() => {});
            if ('requestIdleCallback' in window) {
                requestIdleCallback(preload, { timeout: 2000 });
            } else {
                preload();
            }
        }, 3000);
    }
}

// Carga unica del cubemap de estrellas (la comparten la precarga y runReveal).
let skyPromise = null;
function loadSkyCubemap() {
    if (!skyPromise) {
        const cubePath = './assets/cubemap/stars/';
        const cubeFiles = ['px.webp', 'nx.webp', 'py.webp', 'ny.webp', 'pz.webp', 'nz.webp'];
        skyPromise = new Promise((resolve, reject) => {
            new THREE.CubeTextureLoader().setPath(cubePath).load(cubeFiles, resolve, undefined, reject);
        });
        skyPromise.catch(() => {});
    }
    return skyPromise;
}

// El video se baja una sola vez y se reproduce desde un Blob: asi el loop no depende de que
// el servidor soporte Range (sin Range, Chrome se traba unos segundos al volver al inicio).
const babyVideoUrl = new URL('./assets/video/dancing-baby.mp4', window.location.href).href;
let babyVideoSrcPromise = null;
function loadBabyVideoSrc() {
    if (!babyVideoSrcPromise) {
        babyVideoSrcPromise = fetch(babyVideoUrl)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.blob();
            })
            .then((blob) => URL.createObjectURL(blob))
            .catch(() => babyVideoUrl);
    }
    return babyVideoSrcPromise;
}

// fast: sin dial-up, sin iris y sin el travelling inicial (volver con Back o link a #cosmico).
// Con reduced motion siempre es fast (el star-burst es un destello).
export async function runReveal({ fast = false } = {}) {
    if (revealStarted) {
        return;
    }
    fast = fast || reducedMotion;
    revealStarted = true;
    const skyReady = useCubemap ? loadSkyCubemap() : null;
    const babyVideoSrcReady = loadBabyVideoSrc();

    // La escena se arma mientras corren las transiciones, asi no queda la intro congelada al final.
    // Los links se esperan durante el dial-up; si fallaron, se corta la revelacion y queda la intro.
    const dialupDone = fast ? Promise.resolve() : playDialupOverlay();
    let linksData;
    try {
        linksData = await linksPromise;
    } catch {
        await dialupDone;
        revealStarted = false;
        return;
    }
    const overlaysDone = fast ? dialupDone : dialupDone.then(playStarIrisTransition);

    let disposed = false;
    let rafId = 0;
    let introHiddenTimer = 0;

    const linkData = linksData.map((entry) => ({
        text: entry.text,
        description: entry.description || '',
        category: entry.category || '',
        href: new URL(entry.link, window.location.href).href
    }));

    // No MSAA on the default framebuffer: the scene is drawn into the composer's
    // render target (multisampled below) and only a fullscreen CRT quad hits the canvas.
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    sceneRoot.appendChild(renderer.domElement);
    // Resolucion adaptativa: escalones de pixel ratio (y MSAA en el ultimo) que se bajan si
    // el FPS no llega. En pantallas tactiles se arranca con tope 1.5.
    const maxPixelRatio = window.matchMedia('(pointer: coarse)').matches ? 1.5 : 2;
    const startPixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
    const qualityLevels = [{ pixelRatio: startPixelRatio, samples: 4 }];
    [1.5, 1, 0.75].filter((value) => value < startPixelRatio).forEach((value) => {
        qualityLevels.push({ pixelRatio: value, samples: value < 1 ? 2 : 4 });
    });
    renderer.setPixelRatio(startPixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;

    // Same options EffectComposer uses by default (HalfFloatType), plus 4x MSAA.
    // samples is ignored on WebGL1 (three r163+ is WebGL2-only anyway).
    const pixelRatio = renderer.getPixelRatio();
    const composerTarget = new THREE.WebGLRenderTarget(
        window.innerWidth * pixelRatio,
        window.innerHeight * pixelRatio,
        { type: THREE.HalfFloatType, samples: 4 }
    );
    composerTarget.texture.name = 'EffectComposer.rt1';
    const composer = new EffectComposer(renderer, composerTarget);
    // With an explicit target EffectComposer takes its size in device pixels, so
    // re-sync it in CSS pixels (it multiplies by the renderer's pixel ratio).
    composer.setSize(window.innerWidth, window.innerHeight);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a1230, 18, 80);

    const plasmaUniforms = {
        time: { value: 0 }
    };

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 220);
    camera.position.set(0, 0.15, cinematic.startZ);

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    const crtPass = new ShaderPass(crtShader);
    // The CRT pass is last and draws to the screen, so no buffer swap is needed.
    // That keeps RenderPass always writing to the same (read) buffer, so only one
    // MSAA target ever gets allocated on the GPU (the write buffer stays unused).
    crtPass.needsSwap = false;
    composer.addPass(crtPass);

    let skyLoaded = false;
    if (useCubemap) {
        try {
            scene.background = await skyReady;
            skyLoaded = true;
        } catch {
            scene.background = new THREE.Color(0x0a1230);
        }
    } else {
        scene.background = new THREE.Color(0x0a1230);
    }

    if (!skyLoaded) {
        const starsGeom = new THREE.BufferGeometry();
        const starsCount = 4000;
        const coords = new Float32Array(starsCount * 3);
        for (let i = 0; i < starsCount; i++) {
            const r = 70 + Math.random() * 90;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            coords[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
            coords[i * 3 + 1] = r * Math.cos(phi);
            coords[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }
        starsGeom.setAttribute('position', new THREE.BufferAttribute(coords, 3));
        const stars = new THREE.Points(
            starsGeom,
            new THREE.PointsMaterial({ color: 0xffffff, size: 0.24, sizeAttenuation: true })
        );
        scene.add(stars);
    }

    scene.add(new THREE.AmbientLight(0xece8ff, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.25);
    key.position.set(2.8, 2.2, 3.6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7cc1ff, 0.95);
    rim.position.set(-3.2, -0.5, -2.5);
    scene.add(rim);

    const panelAssets = [];
    const retroGroup = new THREE.Group();
    retroGroup.position.set(0, 0.45, 0.1);
    scene.add(retroGroup);
    const textFont = await loadThreeTextFont();

    const borderPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(7.6, 5.35),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    borderPlane.position.z = -0.18;
    retroGroup.add(borderPlane);
    panelAssets.push(borderPlane.geometry, borderPlane.material);

    const cyanPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(7.2, 5.0),
        new THREE.MeshBasicMaterial({ color: 0x00ffff })
    );
    cyanPlane.position.z = -0.16;
    retroGroup.add(cyanPlane);
    panelAssets.push(cyanPlane.geometry, cyanPlane.material);

    const blackPanel = new THREE.Mesh(
        new THREE.PlaneGeometry(6.45, 4.25),
        new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    blackPanel.position.z = -0.14;
    retroGroup.add(blackPanel);
    panelAssets.push(blackPanel.geometry, blackPanel.material);

    const title = createThreeText({
        text: 'Bienvenidos a mi portal web',
        font: textFont,
        size: 0.32,
        depth: 0.02,
        color: 0xff00ff
    });
    title.mesh.position.set(0, 1.62, -0.11);
    retroGroup.add(title.mesh);
    panelAssets.push(title.geometry, title.material);

    const visitorBox = new THREE.Mesh(
        new THREE.PlaneGeometry(4.55, 0.45),
        new THREE.MeshBasicMaterial({ color: 0x001a00 })
    );
    visitorBox.position.set(0, 1.16, -0.125);
    retroGroup.add(visitorBox);
    panelAssets.push(visitorBox.geometry, visitorBox.material);

    const visitorBorder = new THREE.Mesh(
        new THREE.PlaneGeometry(4.65, 0.55),
        new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    );
    visitorBorder.position.set(0, 1.16, -0.13);
    retroGroup.add(visitorBorder);
    panelAssets.push(visitorBorder.geometry, visitorBorder.material);

    const visitor = createThreeText({
        text: formatVisitorText(),
        font: textFont,
        size: 0.16,
        depth: 0.015,
        color: 0x00ff00
    });
    visitor.mesh.position.set(0, 1.10, -0.11);
    retroGroup.add(visitor.mesh);
    panelAssets.push(visitor.material);
    setActiveVisitorText({
        mesh: visitor.mesh,
        font: textFont,
        size: 0.16,
        depth: 0.015
    });

    const updated = createThreeText({
        text: 'Última actualización: 12 de Agosto de 1997',
        font: textFont,
        size: 0.145,
        depth: 0.015,
        color: 0xff88ff
    });
    updated.mesh.position.set(0, 0.72, -0.11);
    retroGroup.add(updated.mesh);
    panelAssets.push(updated.geometry, updated.material);

    const underConstruction = createThreeText({
        text: 'Página en construcción!',
        font: textFont,
        size: 0.17,
        depth: 0.015,
        color: 0xffff00,
        transparent: true,
        opacity: 1
    });
    underConstruction.mesh.position.set(0, 0.36, -0.11);
    retroGroup.add(underConstruction.mesh);
    panelAssets.push(underConstruction.geometry, underConstruction.material);

    const expTitle = createThreeText({
        text: 'Aquí algunos de mis experimentos:',
        font: textFont,
        size: 0.125,
        depth: 0.012,
        color: 0xffffff
    });
    expTitle.mesh.position.set(0, -0.94, -0.11);
    retroGroup.add(expTitle.mesh);
    panelAssets.push(expTitle.geometry, expTitle.material);

    const marqueeBar = new THREE.Mesh(
        new THREE.PlaneGeometry(5.55, 0.38),
        new THREE.MeshBasicMaterial({ color: 0xffff00 })
    );
    marqueeBar.position.set(0, -1.77, -0.13);
    retroGroup.add(marqueeBar);
    panelAssets.push(marqueeBar.geometry, marqueeBar.material);

    const marqueeText = createThreeText({
        text: 'Bienvenidos a mi web personal. Espero que disfrute la estadía.  ~  ',
        font: textFont,
        size: 0.09,
        depth: 0.01,
        color: 0x000000,
        align: 'left'
    });
    marqueeText.mesh.position.set(2.75, -1.85, -0.11);
    retroGroup.add(marqueeText.mesh);
    panelAssets.push(marqueeText.geometry, marqueeText.material);

    const navHint = createThreeText({
        text: 'Para mejorar su experiencia use Netscape Navigator.',
        font: textFont,
        size: 0.085,
        depth: 0.01,
        color: 0xffffff
    });
    navHint.mesh.position.set(0, -2.23, -0.11);
    retroGroup.add(navHint.mesh);
    panelAssets.push(navHint.geometry, navHint.material);

    const heartGeo = new THREE.ExtrudeGeometry(createHeartShape(), {
        depth: 0.28,
        bevelEnabled: true,
        bevelSize: 0.06,
        bevelThickness: 0.07,
        bevelSegments: 3,
        curveSegments: 24
    });

    const heartMat = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: new THREE.Color(0x5a0000),
        emissiveIntensity: 0.42,
        roughness: 0.38,
        metalness: 0.08
    });

    const heartMesh = new THREE.Mesh(heartGeo, heartMat);
    heartMesh.scale.set(0.5, 0.5, 0.5);
    heartMesh.position.set(0, 0.02, 0.15);
    heartMesh.rotation.set(0.22, Math.PI, 0.08);
    retroGroup.add(heartMesh);

    const heartLight = new THREE.PointLight(0xff3b3b, 1.4, 7.5);
    heartLight.position.set(0, -0.82, 1.65);
    scene.add(heartLight);

    const plasmaPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 12, 1, 1),
        createPlasmaMaterial(plasmaUniforms)
    );
    plasmaPlane.position.set(0, -0.25, -4.2);
    scene.add(plasmaPlane);

    let babyVideo = null;
    let babyVideoTexture = null;
    let babyMaterial = null;
    let babyBillboard = null;
    let babyBillboardMirror = null;
    let babyRim = null;
    let babyRimMirror = null;

    try {
        babyVideo = document.createElement('video');
        babyVideo.muted = true;
        babyVideo.loop = true;
        babyVideo.playsInline = true;
        babyVideo.preload = 'auto';
        babyVideo.autoplay = true;
        babyVideo.playbackRate = 1.0;
        const video = babyVideo;
        babyVideoSrcReady.then((src) => {
            if (disposed) {
                return;
            }
            video.src = src;
            video.load();
            video.play().catch(() => {});
        });

        babyVideoTexture = new THREE.VideoTexture(babyVideo);
        babyVideoTexture.colorSpace = THREE.SRGBColorSpace;
        babyVideoTexture.minFilter = THREE.LinearFilter;
        babyVideoTexture.magFilter = THREE.LinearFilter;

        babyMaterial = createVideoChromaMaterial(babyVideoTexture);
        const babyGeo = new THREE.PlaneGeometry(1.25, 1.25);
        babyBillboard = new THREE.Mesh(babyGeo, babyMaterial);
        babyBillboard.position.set(1.9, 0.72, 1.15);
        babyBillboard.rotation.y = -0.22;
        babyBillboard.userData.baseX = babyBillboard.position.x;
        babyBillboard.userData.baseY = babyBillboard.position.y;
        babyBillboard.userData.baseZ = babyBillboard.position.z;
        scene.add(babyBillboard);

        // Mirror shares the same video/texture/material (one download + decode);
        // flipped horizontally so the pair reads as a mirrored duo.
        babyBillboardMirror = new THREE.Mesh(babyGeo, babyMaterial);
        babyBillboardMirror.position.set(-1.9, 0.72, 1.15);
        babyBillboardMirror.rotation.y = 0.22;
        babyBillboardMirror.scale.x = -1;
        babyBillboardMirror.userData.baseX = babyBillboardMirror.position.x;
        babyBillboardMirror.userData.baseY = babyBillboardMirror.position.y;
        babyBillboardMirror.userData.baseZ = babyBillboardMirror.position.z;
        scene.add(babyBillboardMirror);

        babyRim = new THREE.PointLight(0x55c8ff, 1.3, 20);
        babyRim.position.set(1.95, 0.78, 1.65);
        scene.add(babyRim);

        babyRimMirror = new THREE.PointLight(0x55c8ff, 1.3, 20);
        babyRimMirror.position.set(-1.95, 0.78, 1.65);
        scene.add(babyRimMirror);
    } catch {
        babyVideo = null;
    }

    // Carteles en dos niveles: el primero tiene una carpeta por categoria (y los links sin
    // categoria); al abrir una carpeta se ven sus links y un cartel "Volver".
    // userData.level: categoria a la que pertenece el cartel (null = primer nivel).
    const signGroups = groupLinks(linkData);
    const categoryNames = signGroups.filter((group) => group.type === 'category').map((group) => group.name);
    const signSpecs = [];
    if (categoryNames.length > 0) {
        signSpecs.push({ kind: 'back', text: 'Volver', description: 'Volver a las categorias', level: null });
    }
    signGroups.forEach((group) => {
        if (group.type === 'link') {
            signSpecs.push({ kind: 'link', ...group.item, level: null });
            return;
        }
        signSpecs.push({
            kind: 'category',
            text: `${group.name} (${group.items.length})`,
            description: group.items.map((item) => item.text).join(' · '),
            category: group.name,
            level: null
        });
        group.items.forEach((item) => {
            signSpecs.push({ kind: 'link', ...item, level: group.name });
        });
    });
    let activeCategory = categoryNames.includes(rememberedCategory()) ? rememberedCategory() : null;
    let visibleSigns = [];

    const signMeshes = [];
    const signAssets = [];
    const signColSpacing = 2.28;
    const signRowSpacing = 0.72;
    // Muchos links: 3 columnas en pantallas anchas, la camara se aleja un poco (hasta signFitMax,
    // para que el texto siga legible) y lo que aun no entra se ve bajando la camara (rueda / arrastre).
    const signFitMax = 1.15;
    const signPlaneZ = 0.55;
    const halfFovTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let signFit = 1;
    let scrollMax = 0;
    let scrollTarget = 0;
    let signScroll = 0;
    const moreHint = document.createElement('div');
    moreHint.className = 'scene-more';
    moreHint.textContent = '▼ más';
    moreHint.hidden = true;
    sceneRoot.appendChild(moreHint);
    signSpecs.forEach((item, i) => {
        const signTexture = createSignTexture(item.text, item.kind);
        const signMat = new THREE.MeshStandardMaterial({
            map: signTexture,
            roughness: 0.72,
            metalness: 0.02,
            emissive: new THREE.Color(0x2a1500),
            emissiveIntensity: 0.2
        });
        const signGeo = new THREE.PlaneGeometry(2.25, 0.56);
        const signMesh = new THREE.Mesh(signGeo, signMat);

        const descriptionTexture = createDescriptionTexture(item.description);
        const descriptionMat = new THREE.MeshStandardMaterial({
            map: descriptionTexture,
            roughness: 0.76,
            metalness: 0.01,
            emissive: new THREE.Color(0x03111f),
            emissiveIntensity: 0.38,
            transparent: true,
            opacity: 0,
            depthTest: false,
            depthWrite: false
        });
        const descriptionGeo = new THREE.PlaneGeometry(2.95, 1.35);
        const descriptionMesh = new THREE.Mesh(descriptionGeo, descriptionMat);
        signMesh.rotation.x = -0.18;
        descriptionMesh.rotation.x = -0.06;
        descriptionMesh.scale.set(0.8, 0.8, 1);
        descriptionMesh.visible = false;
        descriptionMesh.renderOrder = 120;
        signMesh.userData = {
            kind: item.kind,
            linkHref: item.href || null,
            linkText: item.text || '',
            category: item.category || null,
            level: item.level,
            phase: i * 1.6,
            descriptionMesh,
            baseScale: 1.0
        };
        retroGroup.add(signMesh);
        retroGroup.add(descriptionMesh);
        signMeshes.push(signMesh);
        signAssets.push({
            geo: signGeo,
            mat: signMat,
            tex: signTexture,
            descriptionGeo,
            descriptionMat,
            descriptionTexture
        });
    });

    function isSignInView(signMesh) {
        if (signMesh.userData.kind === 'back') {
            return activeCategory !== null;
        }
        return signMesh.userData.level === activeCategory;
    }

    // Grilla de carteles (depende del aspect: se rehace en resize), encuadre y tope de scroll.
    function layoutSigns() {
        visibleSigns = signMeshes.filter(isSignInView);
        signMeshes.forEach((signMesh) => {
            signMesh.visible = visibleSigns.includes(signMesh);
            if (!signMesh.visible) {
                signMesh.userData.descriptionMesh.visible = false;
                signMesh.userData.descriptionMesh.material.opacity = 0;
            }
        });
        const signCount = Math.max(visibleSigns.length, 1);
        const columns = signCount <= 2 ? signCount : ((signCount > 12 && camera.aspect >= 1.2) ? 3 : 2);
        visibleSigns.forEach((signMesh, i) => {
            const row = Math.floor(i / columns);
            const col = i % columns;
            const rowItemCount = Math.min(columns, signCount - (row * columns));
            const x = (col - ((rowItemCount - 1) / 2)) * signColSpacing;
            signMesh.userData.baseX = x;
            signMesh.userData.baseY = -1.55 - (row * signRowSpacing);
            signMesh.userData.baseZ = 0.45 - (Math.abs(x) * 0.12) - (row * 0.05);
            signMesh.position.set(x, signMesh.userData.baseY, signMesh.userData.baseZ);
        });
        // Borde inferior de la ultima fila en el mundo (con hover, flotacion y algo de margen).
        const rows = Math.ceil(signCount / columns);
        const gridBottom = retroGroup.position.y - 1.55 - ((rows - 1) * signRowSpacing) - 0.55;
        const viewZ = cinematic.endZ * Math.max(1, 0.65 / camera.aspect);
        const fitZ = (((0.2 - gridBottom) / halfFovTan) + signPlaneZ) / viewZ;
        signFit = THREE.MathUtils.clamp(fitZ, 1, signFitMax);
        scrollMax = Math.max(0, 0.2 - (halfFovTan * ((viewZ * signFit) - signPlaneZ)) - gridBottom);
        scrollTarget = Math.min(scrollTarget, scrollMax);
        // Solo con scroll el arrastre tactil es nuestro (si no, se deja el touch-action del CSS).
        renderer.domElement.style.touchAction = scrollMax > 0 ? 'none' : '';
    }
    layoutSigns();

    // Abre una carpeta (null = vuelve al primer nivel): cambia los carteles visibles, que
    // aparecen creciendo desde cero, y lleva el scroll arriba.
    // Los carteles nuevos aparecen donde estaba la carpeta: un doble click no debe entrar al proyecto.
    const levelClickGuardMs = 450;
    let levelChangedAt = -Infinity;
    function openCategory(category) {
        if (category === activeCategory) {
            return;
        }
        activeCategory = category;
        levelChangedAt = performance.now();
        hoveredSign = null;
        scrollTarget = 0;
        layoutSigns();
        if (!reducedMotion) {
            visibleSigns.forEach((signMesh) => {
                signMesh.scale.set(0.01, 0.01, 1);
            });
        }
        if (pointerInside) {
            camera.updateMatrixWorld();
            hoveredSign = pickSignFromPointer();
            renderer.domElement.style.cursor = hoveredSign ? 'pointer' : 'default';
        }
        playHoverSound();
    }

    // Escape dentro de una carpeta vuelve al primer nivel (antes que el atajo a los enlaces HTML).
    function onSceneKeyDown(event) {
        if (disposed || event.key !== 'Escape' || activeCategory === null
            || linksNav.classList.contains('open') || linksNav.contains(document.activeElement)) {
            return;
        }
        event.stopImmediatePropagation();
        openCategory(null);
    }

    // Unidades de mundo por pixel en el plano de los carteles.
    function worldPerPixel() {
        return (2 * halfFovTan * (camera.position.z - signPlaneZ)) / window.innerHeight;
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hoveredSign = null;
    let pointerInside = false;
    // Arrastre tactil: pasado dragThreshold px es scroll y no tap (el click que sigue se ignora).
    const dragThreshold = 10;
    let dragStartY = null;
    let dragStartScroll = 0;
    let dragMoved = false;
    // Tactil/lapiz: no hay hover, el primer tap selecciona (cartel + descripcion) y el segundo navega.
    let lastPointerType = 'mouse';
    let audioCtx = null;
    let lastHoverSoundAt = 0;

    // Sin gesto previo (carga directa en #cosmico) el contexto se crea en el primer pointerdown;
    // crearlo antes solo deja un contexto suspendido y un warning de autoplay.
    function ensureAudioContext() {
        if (navigator.userActivation && !navigator.userActivation.isActive && !navigator.userActivation.hasBeenActive) {
            return;
        }
        if (!audioCtx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) {
                audioCtx = new Ctx();
            }
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
        }
    }

    function playHoverSound() {
        if (!audioCtx || audioCtx.state !== 'running') {
            return;
        }

        const now = performance.now();
        if ((now - lastHoverSoundAt) < 90) {
            return;
        }
        lastHoverSoundAt = now;

        const t0 = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, t0);
        osc.frequency.exponentialRampToValueAtTime(520, t0 + 0.08);

        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.032, t0 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.12);
    }

    function updatePointerFromEvent(event) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    }

    function pickSignFromPointer() {
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(visibleSigns, true);
        if (hits.length > 0) {
            return hits[0].object;
        }
        return null;
    }

    function resetToIntro() {
        if (disposed) {
            return;
        }
        disposed = true;

        cancelAnimationFrame(rafId);
        forgetScene();
        renderer.domElement.removeEventListener('click', onSceneClick);
        renderer.domElement.removeEventListener('pointerdown', onScenePointerDown);
        renderer.domElement.removeEventListener('pointermove', onScenePointerMove);
        renderer.domElement.removeEventListener('pointerleave', onScenePointerLeave);
        renderer.domElement.removeEventListener('pointerup', onScenePointerUp);
        renderer.domElement.removeEventListener('pointercancel', onScenePointerUp);
        renderer.domElement.removeEventListener('wheel', onSceneWheel);
        window.removeEventListener('keydown', onSceneKeyDown, true);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('pageshow', onPageShow);

        heartGeo.dispose();
        heartMat.dispose();
        panelAssets.forEach((asset) => {
            asset.dispose();
        });
        plasmaPlane.geometry.dispose();
        plasmaPlane.material.dispose();
        signAssets.forEach((asset) => {
            asset.geo.dispose();
            asset.mat.dispose();
            asset.tex.dispose();
            asset.descriptionGeo.dispose();
            asset.descriptionMat.dispose();
            asset.descriptionTexture.dispose();
        });

        if (babyBillboard) {
            babyBillboard.geometry.dispose();
        }
        if (babyMaterial) {
            babyMaterial.dispose();
        }
        if (babyVideoTexture) {
            babyVideoTexture.dispose();
        }
        if (babyVideo) {
            babyVideo.pause();
            babyVideo.removeAttribute('src');
            babyVideo.load();
        }

        if (babyRim) {
            scene.remove(babyRim);
        }
        if (babyRimMirror) {
            scene.remove(babyRimMirror);
        }

        disposeActiveVisitorText();

        composer.dispose();
        renderer.dispose();
        sceneRoot.replaceChildren();
        sceneRoot.classList.remove('visible');
        clearTimeout(introHiddenTimer);
        setIntroCounterVisible(true);
        introHooks.onIntroShown();
        intro.classList.remove('fade');
        intro.inert = false;
        stopIntroHeartPreview = initIntroHeartPreview(heartTrigger);

        revealStarted = false;
    }

    function onScenePointerDown(event) {
        lastPointerType = event.pointerType || 'mouse';
        dragMoved = false;
        dragStartY = lastPointerType === 'mouse' ? null : event.clientY;
        dragStartScroll = scrollTarget;
        ensureAudioContext();
    }

    function onScenePointerUp() {
        dragStartY = null;
    }

    function onScenePointerMove(event) {
        if (disposed) {
            return;
        }
        // En tactil la seleccion es fija: los pointermove/pointerleave del tap no la tocan;
        // solo un arrastre vertical (pasado el umbral) mueve el scroll.
        if (event.pointerType !== 'mouse') {
            if (dragStartY !== null) {
                const dy = event.clientY - dragStartY;
                dragMoved = dragMoved || Math.abs(dy) > dragThreshold;
                if (dragMoved) {
                    scrollTarget = THREE.MathUtils.clamp(dragStartScroll - (dy * worldPerPixel()), 0, scrollMax);
                    signScroll = scrollTarget;
                }
            }
            return;
        }

        pointerInside = true;
        updatePointerFromEvent(event);
        const prevHovered = hoveredSign;
        hoveredSign = pickSignFromPointer();
        if (hoveredSign && hoveredSign !== prevHovered) {
            playHoverSound();
        }
        renderer.domElement.style.cursor = hoveredSign ? 'pointer' : 'default';
    }

    function onScenePointerLeave(event) {
        if (event.pointerType !== 'mouse') {
            return;
        }
        pointerInside = false;
        hoveredSign = null;
        renderer.domElement.style.cursor = 'default';
    }

    function onSceneWheel(event) {
        if (disposed || scrollMax <= 0) {
            return;
        }
        const unit = event.deltaMode === 1 ? 16 : (event.deltaMode === 2 ? window.innerHeight : 1);
        scrollTarget = THREE.MathUtils.clamp(scrollTarget + (event.deltaY * unit * worldPerPixel()), 0, scrollMax);
    }

    function onSceneClick(event) {
        if (disposed || dragMoved) {
            return;
        }

        updatePointerFromEvent(event);

        raycaster.setFromCamera(pointer, camera);
        const pickables = [heartMesh, ...visibleSigns];
        const hits = raycaster.intersectObjects(pickables, true);
        if (hits.length > 0) {
            const hitObj = hits[0].object;
            if (hitObj === heartMesh) {
                resetToIntro();
                return;
            }

            const kind = hitObj.userData?.kind;
            if (kind && performance.now() - levelChangedAt < levelClickGuardMs) {
                return;
            }
            if (kind === 'category' || kind === 'back') {
                openCategory(hitObj.userData.category);
                return;
            }
            if (kind === 'link' && hitObj.userData.linkHref) {
                if (lastPointerType !== 'mouse' && hoveredSign !== hitObj) {
                    hoveredSign = hitObj;
                    playHoverSound();
                    return;
                }
                rememberScene(activeCategory);
                // Analitica (Umami): el tracker manda con keepalive, sobrevive a la navegacion.
                window.umami?.track('proyecto', {
                    nombre: hitObj.userData.linkText,
                    url: hitObj.userData.linkHref,
                    via: '3d'
                });
                window.location.href = hitObj.userData.linkHref;
                return;
            }
        }
        if (lastPointerType !== 'mouse') {
            hoveredSign = null;
        }
    }

    // Tiempo propio con delta acotado: al volver de una pestaña oculta (o tras un frame muy
    // largo) la animacion sigue donde estaba, sin saltear la cinematica inicial.
    const clock = new THREE.Clock();
    let t = fast ? cinematic.durationSec : 0;
    let marqueeOffset = t * 1.5;

    let qualityIndex = 0;
    let qualityCeiling = 0;
    let fpsWindowStart = 0;
    let fpsFrames = 0;
    let lowWindows = 0;
    let highWindows = 0;
    let lastStepUpAt = -Infinity;

    function applyQuality(index) {
        qualityIndex = index;
        const level = qualityLevels[index];
        renderer.setPixelRatio(level.pixelRatio);
        // composer.setPixelRatio re-escala sus targets desde su tamaño en px CSS.
        composer.setPixelRatio(level.pixelRatio);
        if (composerTarget.samples !== level.samples) {
            // samples se lee al alocar: dispose fuerza a recrear el target en el proximo render.
            composerTarget.samples = level.samples;
            composerTarget.dispose();
        }
    }

    // Ventanas de 1 s: 2 seguidas < 45 fps bajan un escalon; 5 seguidas > 58 fps suben uno.
    // Si tras subir se vuelve a caer enseguida, ese escalon queda como techo (sin oscilar).
    function updateQuality(now) {
        if (!fpsWindowStart) {
            fpsWindowStart = now;
            fpsFrames = 0;
            return;
        }
        fpsFrames++;
        const elapsed = now - fpsWindowStart;
        if (elapsed < 1000) {
            return;
        }
        const fps = (fpsFrames * 1000) / elapsed;
        fpsWindowStart = now;
        fpsFrames = 0;
        lowWindows = fps < 45 ? lowWindows + 1 : 0;
        highWindows = fps > 58 ? highWindows + 1 : 0;
        if (lowWindows >= 2 && qualityIndex < qualityLevels.length - 1) {
            if (now - lastStepUpAt < 8000) {
                qualityCeiling = qualityIndex + 1;
            }
            applyQuality(qualityIndex + 1);
            lowWindows = 0;
            highWindows = 0;
        } else if (highWindows >= 5 && qualityIndex > qualityCeiling) {
            applyQuality(qualityIndex - 1);
            lastStepUpAt = now;
            highWindows = 0;
        }
    }

    function onVisibilityChange() {
        if (disposed) {
            return;
        }
        // La medicion de FPS reinicia: el hueco oculto no cuenta como frame lento.
        fpsWindowStart = 0;
        if (!babyVideo) {
            return;
        }
        if (document.hidden) {
            babyVideo.pause();
        } else if (babyVideo.src) {
            babyVideo.play().catch(() => {});
        }
    }

    // Restaurada desde el bfcache la escena sigue armada: se reanuda el video y se
    // reinicia la medicion de FPS (el rAF sigue solo; el audio vuelve con el proximo pointerdown).
    function onPageShow(event) {
        if (event.persisted) {
            onVisibilityChange();
        }
    }

    function animate(now) {
        if (disposed) {
            return;
        }

        const dt = Math.min(clock.getDelta(), 0.1);
        t += dt;
        updateQuality(now);
        plasmaUniforms.time.value = t;

        // Reduced motion: camara sin vaiven ni roll, CRT sin tracking/glitch (scanlines quietas)
        // y flotacion con menos amplitud.
        const sway = reducedMotion ? 0 : 1;
        const floatAmp = reducedMotion ? 0.3 : 1;

        const driftBase = (Math.sin(t * 0.62) * 0.5) + 0.5;
        const driftPop = Math.random() > 0.996 ? 0.7 : 0.0;
        const glitchBurst = driftBase + driftPop;
        crtPass.uniforms.trackingDrift.value = glitchBurst * 0.00085 * sway;

        const progress = Math.min(t / cinematic.durationSec, 1);
        const eased = 1 - Math.pow(1 - progress, 2.2);

        // En vertical (aspect < 0.65) la camara se aleja para que el panel y los carteles entren de ancho.
        // signFit / signScroll: encuadre y scroll vertical de la grilla de carteles (layoutSigns).
        const prevScroll = signScroll;
        signScroll = reducedMotion ? scrollTarget : THREE.MathUtils.lerp(signScroll, scrollTarget, 0.16);
        camera.position.z = THREE.MathUtils.lerp(cinematic.startZ, cinematic.endZ, eased) * Math.max(1, 0.65 / camera.aspect) * signFit;
        camera.position.x = Math.sin(t * 0.24) * cinematic.swayX * (0.35 + (eased * 0.65)) * sway;
        camera.position.y = 0.2 - signScroll + (Math.sin(t * 0.42) * cinematic.swayY * sway);
        camera.lookAt(0, 0.2 - signScroll, 0);
        camera.rotation.z = Math.sin((t * 0.33) + 0.4) * cinematic.roll * (0.4 + (eased * 0.6)) * sway;
        // Con la rueda los carteles se mueven bajo el mouse quieto: se recalcula el hover.
        if (pointerInside && Math.abs(signScroll - prevScroll) > 0.0001) {
            camera.updateMatrixWorld();
            hoveredSign = pickSignFromPointer();
            renderer.domElement.style.cursor = hoveredSign ? 'pointer' : 'default';
        }
        const showMore = scrollTarget < scrollMax - 0.05;
        if (moreHint.hidden === showMore) {
            moreHint.hidden = !showMore;
        }

        retroGroup.rotation.y = Math.sin(t * 0.18) * 0.09 * floatAmp;
        retroGroup.position.x = Math.sin(t * 0.26) * 0.16 * floatAmp;
        underConstruction.mesh.material.opacity = (reducedMotion || Math.sin(t * 4.0) > 0) ? 1 : 0.32;
        marqueeOffset += dt * (reducedMotion ? 0.5 : 1.5);
        marqueeText.mesh.position.x = 2.75 - (marqueeOffset % 8.8);

        heartMesh.rotation.y = Math.PI + (t * 1.18);
        heartMesh.rotation.x = 0.22 + (Math.sin(t * 1.7) * 0.16);
        heartMesh.position.y = 0.02 + (Math.sin(t * 2.0) * 0.08);
        heartLight.intensity = 1.2 + (Math.sin((t * 2.0) + 0.5) * 0.22);

        if (babyBillboard) {
            babyBillboard.position.x = babyBillboard.userData.baseX + (Math.sin(t * 0.52) * 0.24 * floatAmp);
            babyBillboard.position.y = babyBillboard.userData.baseY + (Math.cos(t * 0.88) * 0.12 * floatAmp);
            babyBillboard.position.z = babyBillboard.userData.baseZ + (Math.sin(t * 0.44) * 0.16 * floatAmp);
            babyBillboard.rotation.y = -0.22 + (Math.sin(t * 0.41) * 0.09);
            babyBillboard.rotation.x = -0.03 + (Math.sin(t * 0.33) * 0.03);
        }
        if (babyBillboardMirror) {
            babyBillboardMirror.position.x = babyBillboardMirror.userData.baseX - (Math.sin(t * 0.52) * 0.24 * floatAmp);
            babyBillboardMirror.position.y = babyBillboardMirror.userData.baseY + (Math.cos((t * 0.88) + 0.6) * 0.12 * floatAmp);
            babyBillboardMirror.position.z = babyBillboardMirror.userData.baseZ + (Math.sin((t * 0.44) + 0.5) * 0.16 * floatAmp);
            babyBillboardMirror.rotation.y = 0.22 - (Math.sin(t * 0.41) * 0.09);
            babyBillboardMirror.rotation.x = -0.03 + (Math.sin((t * 0.33) + 0.4) * 0.03);
        }
        if (babyRim) {
            babyRim.intensity = 1.0 + (Math.sin((t * 1.8) + 1.1) * 0.18);
            babyRim.position.x = (babyBillboard ? babyBillboard.position.x : 0) + 0.2;
            babyRim.position.y = (babyBillboard ? babyBillboard.position.y : 1.2) + 0.1;
        }
        if (babyRimMirror) {
            babyRimMirror.intensity = 1.0 + (Math.sin((t * 1.8) + 1.6) * 0.18);
            babyRimMirror.position.x = (babyBillboardMirror ? babyBillboardMirror.position.x : 0) - 0.2;
            babyRimMirror.position.y = (babyBillboardMirror ? babyBillboardMirror.position.y : 1.2) + 0.1;
        }

        visibleSigns.forEach((sign, idx) => {
            sign.position.y = sign.userData.baseY + (Math.sin((t * 1.25) + sign.userData.phase) * 0.06 * floatAmp);
            sign.position.z = sign.userData.baseZ + (Math.sin((t * 0.66) + sign.userData.phase) * 0.05 * floatAmp);
            sign.rotation.y = Math.sin((t * 0.52) + idx) * 0.1 * floatAmp;

            const isHovered = hoveredSign === sign;
            const targetScale = isHovered ? 1.14 : 1.0;
            sign.scale.x = THREE.MathUtils.lerp(sign.scale.x, targetScale, 0.18);
            sign.scale.y = THREE.MathUtils.lerp(sign.scale.y, targetScale, 0.18);
            const targetEmissive = isHovered ? 0.6 : 0.2;
            sign.material.emissiveIntensity = THREE.MathUtils.lerp(sign.material.emissiveIntensity, targetEmissive, 0.18);

            const descriptionMesh = sign.userData.descriptionMesh;
            if (descriptionMesh) {
                descriptionMesh.position.x = sign.position.x;
                descriptionMesh.position.y = sign.position.y + 1.0 + (Math.sin((t * 1.8) + sign.userData.phase) * 0.03);
                descriptionMesh.position.z = sign.position.z + 1.05;
                descriptionMesh.rotation.y = sign.rotation.y * 0.25;

                const targetOpacity = isHovered ? 0.96 : 0;
                descriptionMesh.material.opacity = THREE.MathUtils.lerp(descriptionMesh.material.opacity, targetOpacity, 0.22);

                const targetScale = isHovered ? 1.0 : 0.8;
                const currentScale = THREE.MathUtils.lerp(descriptionMesh.scale.x, targetScale, 0.2);
                descriptionMesh.scale.set(currentScale, currentScale, 1);

                descriptionMesh.visible = descriptionMesh.material.opacity > 0.02;
            }
        });

        if (!reducedMotion) {
            crtPass.uniforms.time.value = t;
        }
        composer.render();
        rafId = requestAnimationFrame(animate);
    }

    renderer.compile(scene, camera);
    await overlaysDone;
    stopIntroHeartPreview();
    stopIntroHeartPreview = () => {};

    rafId = requestAnimationFrame(animate);

    intro.classList.add('fade');
    // Invisible pero enfocable: inert saca al corazon del orden de Tab mientras se ve la escena.
    intro.inert = true;
    sceneRoot.classList.add('visible');
    // Cuando la intro termina de desvanecerse queda tapada: se pausa lo que solo se ve ahi.
    introHiddenTimer = setTimeout(() => {
        if (!disposed) {
            setIntroCounterVisible(false);
            introHooks.onSceneShown();
        }
    }, introFadeMs + 50);

    function onResize() {
        if (disposed) {
            return;
        }

        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        layoutSigns();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    }

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);
    renderer.domElement.addEventListener('click', onSceneClick);
    renderer.domElement.addEventListener('pointerdown', onScenePointerDown);
    renderer.domElement.addEventListener('pointermove', onScenePointerMove);
    renderer.domElement.addEventListener('pointerleave', onScenePointerLeave);
    renderer.domElement.addEventListener('pointerup', onScenePointerUp);
    renderer.domElement.addEventListener('pointercancel', onScenePointerUp);
    renderer.domElement.addEventListener('wheel', onSceneWheel, { passive: true });
    window.addEventListener('keydown', onSceneKeyDown, true);
    ensureAudioContext();
}
