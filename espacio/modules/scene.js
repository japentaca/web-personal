'use strict';
// Import audio module
import audio from "./audio.js?v=20260523g";
import { createSceneState, createAnimationConfig } from "./scene/sceneStateFactory.js";
import {
    makeTextSprite,
    mapRange,
    solveKeplerEccentricAnomaly,
    getSphereSegments,
    createFresnelAtmosphere
} from "./scene/sceneUtils.js";
import { addMarsParticles } from "./scene/marsParticles.js";
import { createToursController } from "./scene/toursController.js";
import { createUiController } from "./scene/uiController.js";
import { createReactiveController } from "./scene/reactiveController.js";
import { createCosmicTextController } from "./scene/cosmicTextController.js";

// Maintenance index:
// - Shared math/render helpers: ./scene/sceneUtils.js
// - Mars particle systems: ./scene/marsParticles.js
// - Scene defaults and tunings: ./scene/sceneStateFactory.js
// - Camera/probe orbit tours: ./scene/toursController.js
// - Input/resize/FPS HUD: ./scene/uiController.js
// - Audio-reactive visuals: ./scene/reactiveController.js
// - Cosmic text spawn/update: ./scene/cosmicTextController.js

// Main export object with function references
export default {
    init: sceneInit,
    audio,
    toggleAudio,
    addBase,
    addAudioSet
};

// Global variables
const myPlanets = [];
const myParticles = [];
let sceneEnabled = true;
const marsParticleTextures = {
    ember: null,
    smoke: null
};

// Cosmic text overlay state
let spawnCosmicTextFn = null;

// Audio control functions
function toggleAudio() {
    Tone.start();
    sceneEnabled = !sceneEnabled;
}

function addBase(path) {
    audio.addBase(path);
}

function addAudioSet(set) {
    const hasText = Array.isArray(set.files) && set.files.some(f => f.text);
    const intervalMin = (set.parms && set.parms.interval) ? set.parms.interval.min : 9;
    const onText = hasText
        ? (text) => { if (spawnCosmicTextFn && text) spawnCosmicTextFn(text, intervalMin); }
        : null;
    audio.addAudioSet(set, onText);
}

// Creates a planet with appropriate texture and orbit
function addPlanet(parent, radius, distance, rotationSpeed, translationSpeed, initialRotation, texturePath, orbitProfile = null) {
    const texture = new THREE.TextureLoader().load(texturePath);
    const segments = getSphereSegments(radius);
    const geometry = new THREE.SphereBufferGeometry(radius, segments.width, segments.height);
    const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.82,
        metalness: 0.02
    });
    const mesh = new THREE.Mesh(geometry, material);
    
    mesh.name = `Planet ${myPlanets.length + 1}`;
    mesh.position.set(distance, 0, 0);
    
    const pivot = new THREE.Group();
    pivot.add(mesh);
    pivot.name = `Pivot ${myPlanets.length + 1}`;
    // Keep pivot at parent's local origin so child orbits are local, not double-offset.
    pivot.position.set(0, 0, 0);
    
    const planetData = { 
        mesh, 
        pivot, 
        parent, 
        radius, 
        distance, 
        rotationSpeed, 
        translationSpeed, 
        texture,
        orbit: orbitProfile || {
            semiMajorAxis: distance,
            eccentricity: 0,
            inclination: 0,
            longitude: 0,
            meanMotion: translationSpeed,
            phase: 0
        }
    };
    
    myPlanets.push(planetData);
    parent.add(pivot);
    
    return mesh;
}


// Main scene initialization function
function sceneInit() {
    audio.init();
    
    let camera, scene, renderer;
    let sunObj, skyObj;
    let sunGlow = null;
    let sunLight = null;
    let ambientLight = null;
    let hemiLight = null;
    let mars, jupiter, mercury, venus, earth, saturn, uranus, neptune, earthMoon;
    let venusAtmosphere = null;
    let earthAtmosphere = null;
    let saturnRings = null;
    let marsAura = null;
    let probeObj = null;
    let probePathLine = null;
    let probeParticleCloud = null;
    const {
        SHOW_PROBE_PATH,
        probeTargets,
        probeTourOrder,
        cameraTourTargets,
        cameraTourOrder,
        probeTrails,
        probeWork,
        probeTour,
        probeTourWork,
        probeParticles,
        probeState,
        fpsState,
        cameraView,
        cameraModeSwitch,
        cameraTour,
        cameraTourWork,
        marsTrails,
        marsTrailWork,
        equatorBasisWork,
        marsBaseScale
    } = createSceneState(THREE);
    const tourRefs = {
        camera: null,
        probeObj: null,
        probePathLine: null,
        renderer: null
    };
    const cosmicTextRefs = {
        scene: null,
        camera: null
    };
    const toursController = createToursController({
        threeLib: THREE,
        state: {
            cameraModeSwitch,
            cameraView,
            cameraTour,
            cameraTourWork,
            cameraTourOrder,
            cameraTourTargets,
            probeTour,
            probeTourWork,
            probeTourOrder,
            probeTargets,
            probeWork,
            probeState,
            equatorBasisWork
        },
        refs: tourRefs
    });
    const uiController = createUiController({
        refs: tourRefs,
        cameraView,
        cameraModeSwitch,
        scheduleNextModeSwitch: (nowMs) => toursController.scheduleNextModeSwitch(nowMs),
        switchOrbitModeSmooth: (enableSonda, nowMs) => toursController.switchOrbitModeSmooth(enableSonda, nowMs)
    });
    const cosmicTextController = createCosmicTextController({
        threeLib: THREE,
        refs: cosmicTextRefs,
        makeTextSpriteFn: (text) => makeTextSprite(text, THREE)
    });
    
    function init() {
        // Camera setup
        camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 9000);
        camera.position.z = 800;
        tourRefs.camera = camera;
        cosmicTextRefs.camera = camera;
        
        // Scene setup
        scene = new THREE.Scene();
        window.scene = scene;
        cosmicTextRefs.scene = scene;
        
        // Sun creation
        const sunTexture = new THREE.TextureLoader().load('./img/1k_sun.jpg');
        const sunGeometry = new THREE.SphereBufferGeometry(100, 64, 48);
        const sunMaterial = new THREE.MeshBasicMaterial({ map: sunTexture });
        sunObj = new THREE.Mesh(sunGeometry, sunMaterial);
        sunObj.name = "Sol";
        scene.add(sunObj);

        // Add a soft additive shell and point light so the sun can react to audio energy.
        const sunGlowGeometry = new THREE.SphereBufferGeometry(114, 32, 22);
        const sunGlowMaterial = new THREE.MeshBasicMaterial({
            color: 0xffbb66,
            transparent: true,
            opacity: 0.06,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.FrontSide
        });
        sunGlow = new THREE.Mesh(sunGlowGeometry, sunGlowMaterial);
        sunGlow.name = "SunGlow";
        sunObj.add(sunGlow);

        sunLight = new THREE.PointLight(0xffb84d, 1.15, 2400);
        sunLight.position.set(0, 0, 0);
        sunObj.add(sunLight);

        // Fill lights to avoid flat shading on the night side and improve depth.
        ambientLight = new THREE.AmbientLight(0x2f3c58, 0.26);
        scene.add(ambientLight);

        hemiLight = new THREE.HemisphereLight(0x6f8fc5, 0x1a0f08, 0.34);
        hemiLight.position.set(0, 1, 0);
        scene.add(hemiLight);
        
        // Sky/background creation
        const skyTexture = new THREE.TextureLoader().load('./img/2k_stars_milky_way.jpg');
        const skyGeometry = new THREE.SphereBufferGeometry(5000, 48, 28);
        const skyMaterial = new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide });
        skyObj = new THREE.Mesh(skyGeometry, skyMaterial);
        skyObj.name = "Sky";
        scene.add(skyObj);
        
        // Renderer setup
        renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.domElement.style.display = 'block';
        document.body.appendChild(renderer.domElement);
        tourRefs.renderer = renderer;
        uiController.createFpsHud();
        
        // Add planets
        mars = addPlanet(sunObj, 18, 520, 0.003, 0.009, [1, 0.009, 0.008], "./img/1k_mars.jpg", {
            semiMajorAxis: 520,
            eccentricity: 0.093,
            inclination: THREE.MathUtils.degToRad(1.85),
            longitude: THREE.MathUtils.degToRad(49.5),
            meanMotion: 0.0052,
            phase: 1.2
        });
        mercury = addPlanet(sunObj, 9, 150, 0.0085, 0.011, [0.2, 0.012, 0.4], "./img/2k_mercury.jpg", {
            semiMajorAxis: 150,
            eccentricity: 0.205,
            inclination: THREE.MathUtils.degToRad(7.0),
            longitude: THREE.MathUtils.degToRad(48.3),
            meanMotion: 0.36,
            phase: 0.7
        });

        venus = addPlanet(sunObj, 15, 220, 0.006, 0.007, [0.3, 0.007, 1], "./img/1k_venus_surface.jpg", {
            semiMajorAxis: 220,
            eccentricity: 0.01,
            inclination: THREE.MathUtils.degToRad(3.4),
            longitude: THREE.MathUtils.degToRad(76.7),
            meanMotion: 0.279,
            phase: 3.4
        });

        earth = addPlanet(sunObj, 16, 390, 0.0055, 0.0086, [0.4, 0.007, 0.2], "./img/earth_day_4096.jpg", {
            semiMajorAxis: 390,
            eccentricity: 0.0167,
            inclination: THREE.MathUtils.degToRad(0.4),
            longitude: THREE.MathUtils.degToRad(11.3),
            meanMotion: 0.0062,
            phase: 2.15
        });

        const earthMoonColor = new THREE.TextureLoader().load('./img/pv_moon_213_moon.jpg');
        const earthMoonDisplacement = new THREE.TextureLoader().load('./img/moon_ldem_3_8bit.jpg');
        const earthMoonSegments = getSphereSegments(4.2);
        const earthMoonGeometry = new THREE.SphereBufferGeometry(4.2, earthMoonSegments.width + 8, earthMoonSegments.height + 6);
        const earthMoonMaterial = new THREE.MeshPhongMaterial({
            map: earthMoonColor,
            displacementMap: earthMoonDisplacement,
            displacementScale: 0.32,
            shininess: 5
        });
        earthMoon = new THREE.Mesh(earthMoonGeometry, earthMoonMaterial);
        earthMoon.position.set(34, 0, 0);

        const earthMoonPivot = new THREE.Group();
        earthMoonPivot.add(earthMoon);
        // Moon pivot must remain local to Earth's origin.
        earthMoonPivot.position.set(0, 0, 0);
        earth.add(earthMoonPivot);

        myPlanets.push({
            mesh: earthMoon,
            pivot: earthMoonPivot,
            parent: earth,
            radius: 4.2,
            distance: 34,
            rotationSpeed: 0.006,
            translationSpeed: 0.028,
            texture: earthMoonColor,
            orbit: {
                semiMajorAxis: 34,
                eccentricity: 0.055,
                inclination: THREE.MathUtils.degToRad(18),
                longitude: THREE.MathUtils.degToRad(28),
                meanMotion: 0.028,
                phase: 0.9
            }
        });

        // Fresnel atmospheres (rim lighting look).
        venusAtmosphere = createFresnelAtmosphere(16.9, 0xf3b77a, 3.2, 0.58, THREE);
        venus.add(venusAtmosphere);

        earthAtmosphere = createFresnelAtmosphere(17.6, 0x5faeff, 3.9, 0.52, THREE);
        earth.add(earthAtmosphere);

        jupiter = addPlanet(sunObj, 38, 860, 0.003, 0.006, [1, 0.006, -0.5], "./img/1k_jupiter.jpg", {
            semiMajorAxis: 860,
            eccentricity: 0.049,
            inclination: THREE.MathUtils.degToRad(1.3),
            longitude: THREE.MathUtils.degToRad(100.5),
            meanMotion: 0.0027,
            phase: 5.0
        });

        // Saturn + ring texture set.
        saturn = addPlanet(sunObj, 31, 1200, 0.0024, 0.0048, [1, 0.006, -0.5], "./img/2k_saturn.jpg", {
            semiMajorAxis: 1200,
            eccentricity: 0.056,
            inclination: THREE.MathUtils.degToRad(2.5),
            longitude: THREE.MathUtils.degToRad(113.7),
            meanMotion: 0.0032,
            phase: 0.6
        });

        const saturnRingAlpha = new THREE.TextureLoader().load('./img/2k_saturn_ring_alpha.png');
    saturnRingAlpha.wrapS = THREE.ClampToEdgeWrapping;
    saturnRingAlpha.wrapT = THREE.ClampToEdgeWrapping;
    saturnRingAlpha.minFilter = THREE.LinearFilter;
    saturnRingAlpha.magFilter = THREE.LinearFilter;
    saturnRingAlpha.generateMipmaps = false;
        const saturnRingGeo = new THREE.RingBufferGeometry(46, 74, 96);
        const saturnRingPositions = saturnRingGeo.attributes.position;
        const saturnRingUvs = saturnRingGeo.attributes.uv;
        const saturnRingSpan = 74 - 46;

        for (let i = 0; i < saturnRingPositions.count; i += 1) {
            const x = saturnRingPositions.getX(i);
            const y = saturnRingPositions.getY(i);
            const radius = Math.sqrt((x * x) + (y * y));
            const radialU = THREE.MathUtils.clamp((radius - 46) / saturnRingSpan, 0, 1);

            saturnRingUvs.setXY(i, radialU, 0.5);
        }

        saturnRingUvs.needsUpdate = true;
        const saturnRingMat = new THREE.MeshBasicMaterial({
            map: saturnRingAlpha,
            alphaMap: saturnRingAlpha,
            transparent: true,
            opacity: 0.86,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        saturnRings = new THREE.Mesh(saturnRingGeo, saturnRingMat);
        saturnRings.rotation.x = THREE.MathUtils.degToRad(80);
        saturn.add(saturnRings);

        uranus = addPlanet(sunObj, 28, 1450, 0.0024, 0.0034, [0.6, 0.004, 0.3], "./img/2k_uranus.jpg", {
            semiMajorAxis: 1450,
            eccentricity: 0.047,
            inclination: THREE.MathUtils.degToRad(0.8),
            longitude: THREE.MathUtils.degToRad(74.0),
            meanMotion: 0.0042,
            phase: 1.9
        });

        neptune = addPlanet(sunObj, 27, 1780, 0.0022, 0.003, [0.7, 0.003, 0.1], "./img/2k_neptune.jpg", {
            semiMajorAxis: 1780,
            eccentricity: 0.009,
            inclination: THREE.MathUtils.degToRad(1.8),
            longitude: THREE.MathUtils.degToRad(131.8),
            meanMotion: 0.0035,
            phase: 4.2
        });

        // Additional textured moons from the downloaded PV pack.
        // Inclinations are intentionally exaggerated for clearer visual separation.
        addPlanet(mars, 2.4, 28, 0.012, 0.055, [0, 0, 0], "./img/pv_moon_215_phobos.jpg", {
            semiMajorAxis: 28,
            eccentricity: 0.018,
            inclination: THREE.MathUtils.degToRad(24),
            longitude: THREE.MathUtils.degToRad(5),
            meanMotion: 0.055,
            phase: 0.3
        });
        addPlanet(mars, 1.8, 40, 0.01, 0.038, [0, 0, 0], "./img/pv_moon_201_deimos.jpg", {
            semiMajorAxis: 40,
            eccentricity: 0.012,
            inclination: THREE.MathUtils.degToRad(34),
            longitude: THREE.MathUtils.degToRad(88),
            meanMotion: 0.038,
            phase: 2.1
        });

        addPlanet(jupiter, 4.4, 66, 0.01, 0.05, [0, 0, 0], "./img/pv_moon_209_io.jpg", {
            semiMajorAxis: 66,
            eccentricity: 0.004,
            inclination: THREE.MathUtils.degToRad(12),
            longitude: THREE.MathUtils.degToRad(140),
            meanMotion: 0.05,
            phase: 1.4
        });
        addPlanet(jupiter, 4.1, 78, 0.009, 0.041, [0, 0, 0], "./img/pv_moon_205_europa.jpg", {
            semiMajorAxis: 78,
            eccentricity: 0.009,
            inclination: THREE.MathUtils.degToRad(26),
            longitude: THREE.MathUtils.degToRad(220),
            meanMotion: 0.041,
            phase: 3.1
        });
        addPlanet(jupiter, 5.0, 93, 0.008, 0.032, [0, 0, 0], "./img/pv_moon_206_ganymede.jpg", {
            semiMajorAxis: 93,
            eccentricity: 0.002,
            inclination: THREE.MathUtils.degToRad(37),
            longitude: THREE.MathUtils.degToRad(300),
            meanMotion: 0.032,
            phase: 5.5
        });

        addPlanet(saturn, 4.8, 88, 0.009, 0.023, [0, 0, 0], "./img/pv_moon_221_titan.jpg", {
            semiMajorAxis: 88,
            eccentricity: 0.029,
            inclination: THREE.MathUtils.degToRad(21),
            longitude: THREE.MathUtils.degToRad(170),
            meanMotion: 0.023,
            phase: 0.8
        });

        addPlanet(neptune, 4.2, 72, 0.009, 0.02, [0, 0, 0], "./img/pv_moon_223_triton.jpg", {
            semiMajorAxis: 72,
            eccentricity: 0,
            inclination: THREE.MathUtils.degToRad(140),
            longitude: THREE.MathUtils.degToRad(250),
            meanMotion: 0.02,
            phase: 4.0
        });

        probeTargets.push(mercury, venus, earth, mars, jupiter, saturn, uranus, neptune);
        // Camera tour avoids inner planets for longer cinematic flybys.
        cameraTourTargets.push(earth, mars, jupiter, saturn, uranus, neptune);

        // Probe uses the same phased tour logic as camera, but across all planets.
        const probeGeometry = new THREE.SphereBufferGeometry(3.6, 12, 10);
        const probeMaterial = new THREE.MeshStandardMaterial({
            color: 0xa8f7ff,
            emissive: 0x3aaed1,
            emissiveIntensity: 1.35,
            roughness: 0.45,
            metalness: 0.05
        });
        probeObj = new THREE.Mesh(probeGeometry, probeMaterial);
        probeObj.name = 'Probe';
        probeObj.position.set(0, 0, 0);
        scene.add(probeObj);
        tourRefs.probeObj = probeObj;
        startProbeTour(performance.now());

        for (let i = 0; i < 6; i++) {
            const trailGeo = new THREE.SphereBufferGeometry(1.8 - (i * 0.22), 8, 6);
            const trailMat = new THREE.MeshBasicMaterial({
                color: 0x73e8ff,
                transparent: true,
                opacity: 0.24 - (i * 0.03),
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const trailMesh = new THREE.Mesh(trailGeo, trailMat);
            scene.add(trailMesh);
            probeTrails.push(trailMesh);
        }

        const probeParticleCount = 64;
        const probeParticlePositions = new Float32Array(probeParticleCount * 3);
        const probeParticleColors = new Float32Array(probeParticleCount * 3);
        const probeParticleGeometry = new THREE.BufferGeometry();
        probeParticleGeometry.setAttribute('position', new THREE.BufferAttribute(probeParticlePositions, 3));
        probeParticleGeometry.setAttribute('color', new THREE.BufferAttribute(probeParticleColors, 3));
        const probeParticleMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 2.4,
            vertexColors: true,
            transparent: true,
            opacity: 0.52,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        probeParticleCloud = new THREE.Points(probeParticleGeometry, probeParticleMaterial);
        scene.add(probeParticleCloud);

        for (let i = 0; i < probeParticleCount; i++) {
            probeParticles.push({
                pos: new THREE.Vector3().copy(probeObj.position),
                vel: new THREE.Vector3(0, 0, 0),
                life: 0,
                tint: (Math.random() - 0.5) * 0.24
            });
            probeParticlePositions[i * 3] = probeObj.position.x;
            probeParticlePositions[(i * 3) + 1] = probeObj.position.y;
            probeParticlePositions[(i * 3) + 2] = probeObj.position.z;
            probeParticleColors[i * 3] = 0.66;
            probeParticleColors[(i * 3) + 1] = 0.97;
            probeParticleColors[(i * 3) + 2] = 1;
        }

        tourRefs.probePathLine = null;
        if (SHOW_PROBE_PATH) {
            const probePathGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(),
                new THREE.Vector3()
            ]);
            const probePathMaterial = new THREE.LineBasicMaterial({
                color: 0x65d9ff,
                transparent: true,
                opacity: 0.32
            });
            probePathLine = new THREE.LineLoop(probePathGeometry, probePathMaterial);
            tourRefs.probePathLine = probePathLine;
            scene.add(probePathLine);
            updateProbeRouteLine(performance.now(), true);
        }
        
        // Add moon to Mars
        const moon = addPlanet(mars, 4, 42, 0.008, 0.005, [0.002, 0.002, 1], "./img/1k_moon.jpg", {
            semiMajorAxis: 42,
            eccentricity: 0.035,
            inclination: THREE.MathUtils.degToRad(5.1),
            longitude: THREE.MathUtils.degToRad(12),
            meanMotion: 0.021,
            phase: 2.3
        });
        addMarsParticles(mars, myParticles, marsParticleTextures, THREE, Partykals);

        marsAura = new THREE.PointLight(0xff4d1f, 1.1, 210);
        marsAura.position.set(0, 0, 0);
        mars.add(marsAura);

        // Ghost trails: subtle additive spheres that lag behind Mars in world space.
        for (let i = 0; i < 4; i++) {
            const trailGeo = new THREE.SphereBufferGeometry(3.6 - (i * 0.5), 10, 8);
            const trailMat = new THREE.MeshBasicMaterial({
                color: 0xff5a2a,
                transparent: true,
                opacity: 0.14 - (i * 0.02),
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const trailMesh = new THREE.Mesh(trailGeo, trailMat);
            trailMesh.visible = true;
            scene.add(trailMesh);
            marsTrails.push(trailMesh);
        }
        
        // Event listeners
        window.addEventListener('resize', onWindowResize, false);
        window.addEventListener('keydown', onKeyDown, false);

        scheduleNextModeSwitch(performance.now());
    }
    function scheduleNextModeSwitch(nowMs) {
        toursController.scheduleNextModeSwitch(nowMs);
    }

    function switchOrbitModeSmooth(enableSonda, nowMs) {
        toursController.switchOrbitModeSmooth(enableSonda, nowMs);
    }

    function onKeyDown(event) {
        uiController.onKeyDown(event);
    }

    function onWindowResize() {
        uiController.onWindowResize();
    }

    function startProbeTour(nowMs) {
        toursController.startProbeTour(nowMs);
    }

    function updateProbeRouteLine(nowMs, force = false) {
        toursController.updateProbeRouteLine(nowMs, force);
    }

    function updateProbeTour(now, deltaSec) {
        toursController.updateProbeTour(now, deltaSec);
    }

    function updatePlanetTourCamera(now, deltaSec) {
        toursController.updatePlanetTourCamera(now, deltaSec);
    }

    function spawnCosmicText(text, intervalSec) {
        cosmicTextController.spawn(text, intervalSec);
    }

    spawnCosmicTextFn = spawnCosmicText;

    // Animation variables
    let frameCount = 0;
    const animationConfig = createAnimationConfig(THREE);
    const { cameraMotion } = animationConfig;
    const reactiveController = createReactiveController({
        threeLib: THREE,
        audioModule: audio,
        mapRangeFn: mapRange,
        config: animationConfig
    });

    function animate(now) {
        if (typeof now !== 'number') {
            now = performance.now();
        }

        requestAnimationFrame(animate);
        frameCount++;
        uiController.updateFps(now, fpsState);

        if (!sceneEnabled) {
            return;
        }

        const deltaSec = probeState.lastFrameAt > 0
            ? Math.min(0.05, (now - probeState.lastFrameAt) * 0.001)
            : 0.016;
        probeState.lastFrameAt = now;

        if (!cameraView.topDown && cameraModeSwitch.enabled && !cameraModeSwitch.active && now >= cameraModeSwitch.nextSwitchAt) {
            switchOrbitModeSmooth(!cameraView.planetTour, now);
        }

        if (cameraView.topDown) {
            camera.up.set(0, 0, -1);
            camera.position.set(0, cameraView.topHeight, 0.01);
            camera.lookAt(0, 0, 0);
        } else if (!cameraView.planetTour) {
            camera.up.set(0, 1, 0);
            const orbitAngle = now * cameraMotion.orbitSpeed;
            const orbitRadius = cameraMotion.radius + (Math.sin(now * 0.00019) * cameraMotion.radiusSwing);
            camera.position.x = Math.cos(orbitAngle) * orbitRadius * 0.32;
            camera.position.z = Math.sin(orbitAngle) * orbitRadius;
            camera.position.y = cameraMotion.verticalBase + (Math.sin(now * cameraMotion.verticalSpeed) * cameraMotion.verticalAmp);
            camera.lookAt(0, 30, 0);
        }
        
        // Update planets
        for (let i = 0; i < myPlanets.length; i++) {
            const planet = myPlanets[i];
            planet.mesh.rotation.y += planet.rotationSpeed;

            const orbit = planet.orbit;
            const meanAnomaly = (now * 0.001 * orbit.meanMotion) + orbit.phase;
            const E = solveKeplerEccentricAnomaly(meanAnomaly, orbit.eccentricity);
            const a = orbit.semiMajorAxis;
            const b = a * Math.sqrt(1 - (orbit.eccentricity * orbit.eccentricity));
            const x = a * (Math.cos(E) - orbit.eccentricity);
            const z = b * Math.sin(E);

            planet.mesh.position.set(x, 0, z);
            planet.pivot.rotation.x = orbit.inclination;
            planet.pivot.rotation.y = orbit.longitude;
        }

        if (cameraView.planetTour) {
            updatePlanetTourCamera(now, deltaSec);
        }

        if (cameraModeSwitch.active) {
            const transitionProgress = THREE.MathUtils.clamp(
                (now - cameraModeSwitch.startedAt) / cameraModeSwitch.transitionMs,
                0,
                1
            );
            const smoothTransition = transitionProgress * transitionProgress * (3 - (2 * transitionProgress));

            cameraModeSwitch.blendPos.lerpVectors(cameraModeSwitch.startPos, camera.position, smoothTransition);
            cameraModeSwitch.targetQuat.copy(camera.quaternion);
            camera.quaternion.copy(cameraModeSwitch.startQuat).slerp(cameraModeSwitch.targetQuat, smoothTransition);
            camera.position.copy(cameraModeSwitch.blendPos);

            if (transitionProgress >= 1) {
                cameraModeSwitch.active = false;
            }
        }

        if (probeObj && probeTargets.length > 0) {
            updateProbeTour(now, deltaSec);

            probeWork.tailOrigin.copy(probeObj.position).addScaledVector(probeWork.tan, -9);
            for (let i = 0; i < probeTrails.length; i++) {
                const trail = probeTrails[i];
                const target = (i === 0) ? probeWork.tailOrigin : probeWork.prevTail.copy(probeTrails[i - 1].position);
                trail.position.lerp(target, Math.max(0.09, 0.29 - (i * 0.03)));
                trail.material.opacity = (0.23 - (i * 0.028)) + (Math.sin(now * 0.004 + i) * 0.015);
            }

            if (probeParticleCloud) {
                const positions = probeParticleCloud.geometry.attributes.position.array;
                const colors = probeParticleCloud.geometry.attributes.color.array;
                const probeColorWork = reactiveController.getProbeColorWork();
                for (let i = 0; i < probeParticles.length; i++) {
                    const particle = probeParticles[i];
                    particle.life -= deltaSec;
                    if (particle.life <= 0) {
                        particle.life = 0.4 + (Math.random() * 0.9);
                        particle.pos.copy(probeWork.tailOrigin).add(
                            new THREE.Vector3(
                                (Math.random() - 0.5) * 2.2,
                                (Math.random() - 0.5) * 2.2,
                                (Math.random() - 0.5) * 2.2
                            )
                        );
                        particle.vel.copy(probeWork.tan).multiplyScalar(-16 - (Math.random() * 9)).add(
                            new THREE.Vector3(
                                (Math.random() - 0.5) * 4,
                                (Math.random() - 0.5) * 4,
                                (Math.random() - 0.5) * 4
                            )
                        );
                    }

                    particle.pos.addScaledVector(particle.vel, deltaSec);
                    particle.vel.multiplyScalar(0.985);

                    positions[i * 3] = particle.pos.x;
                    positions[(i * 3) + 1] = particle.pos.y;
                    positions[(i * 3) + 2] = particle.pos.z;

                    const tintMult = 1 + particle.tint;
                    colors[i * 3] = THREE.MathUtils.clamp(probeColorWork.r * tintMult, 0, 1);
                    colors[(i * 3) + 1] = THREE.MathUtils.clamp(probeColorWork.g * tintMult, 0, 1);
                    colors[(i * 3) + 2] = THREE.MathUtils.clamp(probeColorWork.b * tintMult, 0, 1);
                }
                probeParticleCloud.geometry.attributes.position.needsUpdate = true;
                probeParticleCloud.geometry.attributes.color.needsUpdate = true;
            }
        }
        
        // Update particles
        if ((frameCount % 2) === 0) {
            for (let i = 0; i < myParticles.length; i++) {
                myParticles[i].update();
            }
        }
        
        // Update celestial bodies
        sunObj.rotation.y += 0.0007;
        skyObj.rotation.x += 0.0006;
        skyObj.rotation.y += 0.0005;
        skyObj.rotation.z -= 0.0004;
        reactiveController.update(now, {
            sunLight,
            ambientLight,
            hemiLight,
            sunGlow,
            jupiter,
            venusAtmosphere,
            earthAtmosphere,
            saturnRings,
            camera,
            probeObj,
            probeParticleCloud,
            probeTrails,
            mars,
            marsAura,
            marsBaseScale,
            marsTrails,
            marsTrailWork
        });
        
        cosmicTextController.update(now);

        renderer.render(scene, camera);
    }

    init();
    animate();
}
