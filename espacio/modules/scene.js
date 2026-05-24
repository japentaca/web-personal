'use strict';
// Import audio module
import audio from "./audio.js?v=20260523g";

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

// Cosmic text overlay state
let spawnCosmicTextFn = null;
const cosmicTextSprites = [];

function makeTextSprite(text) {
    const canvasW = 1024;
    const canvasH = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasW, canvasH);

    const fontSize = 46;
    ctx.font = `italic ${fontSize}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Word-wrap
    const maxWidth = canvasW - 100;
    const lineHeight = fontSize * 1.42;
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (ctx.measureText(testLine).width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) lines.push(currentLine);

    const totalTextH = lines.length * lineHeight;
    const startY = (canvasH - totalTextH) / 2 + lineHeight / 2;

    // Glow pass
    ctx.shadowColor = 'rgba(160, 220, 255, 1.0)';
    ctx.shadowBlur = 32;
    ctx.fillStyle = 'rgba(210, 238, 255, 0.45)';
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], canvasW / 2, startY + i * lineHeight);
    }
    // Main text pass
    ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(238, 250, 255, 0.97)';
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], canvasW / 2, startY + i * lineHeight);
    }

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const sprite = new THREE.Sprite(material);
    // canvas is 4:1, keep that ratio in world units
    sprite.scale.set(200, 50, 1);
    return sprite;
}

// Helper function to map values from one range to another
function mapRange(value, inMin, inMax, outMin, outMax) {
    return outMin + (outMax - outMin) * ((value - inMin) / (inMax - inMin));
}

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

function solveKeplerEccentricAnomaly(meanAnomaly, eccentricity) {
    let E = meanAnomaly;
    for (let i = 0; i < 4; i++) {
        const f = E - (eccentricity * Math.sin(E)) - meanAnomaly;
        const fp = 1 - (eccentricity * Math.cos(E));
        E -= f / fp;
    }
    return E;
}

function getSphereSegments(radius) {
    if (radius >= 90) {
        return { width: 64, height: 48 };
    }
    if (radius >= 30) {
        return { width: 40, height: 28 };
    }
    if (radius >= 14) {
        return { width: 28, height: 18 };
    }
    return { width: 18, height: 12 };
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

// Add particle system to a parent object
function addParticles(parent) {
    const particleSystem = new Partykals.ParticlesSystem({
        container: parent,
        particles: {
            globalSize: 2.8,
            ttl: 6,
            velocity: new Partykals.Randomizers.SphereRandomizer(13.5),
            startColor: new Partykals.Randomizers.ColorsRandomizer(
                new THREE.Color(1, 0.22, 0.04),
                new THREE.Color(1, 0.45, 0.06)
            ),
            endColor: new THREE.Color(0.45, 0.02, 0.02),
        },
        system: {
            particlesCount: 560,
            emitters: new Partykals.Emitter({
                onInterval: new Partykals.Randomizers.MinMaxRandomizer(1, 6),
                interval: new Partykals.Randomizers.MinMaxRandomizer(0, 0.11),
            }),
            speed: 1,
        }
    });
    
    myParticles.push(particleSystem);
    return particleSystem;
}

function createFresnelAtmosphere(radius, colorHex, power, intensity) {
    const geometry = new THREE.SphereBufferGeometry(radius, 32, 24);
    const material = new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(colorHex) },
            uPower: { value: power },
            uIntensity: { value: intensity },
            uOpacity: { value: 1.0 },
            uCameraPos: { value: new THREE.Vector3() }
        },
        vertexShader: `
            varying vec3 vWorldPos;
            varying vec3 vWorldNormal;

            void main() {
                vec4 worldPos = modelMatrix * vec4(position, 1.0);
                vWorldPos = worldPos.xyz;
                vWorldNormal = normalize(mat3(modelMatrix) * normal);
                gl_Position = projectionMatrix * viewMatrix * worldPos;
            }
        `,
        fragmentShader: `
            uniform vec3 uColor;
            uniform float uPower;
            uniform float uIntensity;
            uniform float uOpacity;
            uniform vec3 uCameraPos;

            varying vec3 vWorldPos;
            varying vec3 vWorldNormal;

            void main() {
                vec3 viewDir = normalize(uCameraPos - vWorldPos);
                float fresnel = pow(1.0 - max(dot(normalize(vWorldNormal), viewDir), 0.0), uPower);
                float alpha = clamp(fresnel * uIntensity * uOpacity, 0.0, 1.0);
                gl_FragColor = vec4(uColor, alpha);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide
    });

    return new THREE.Mesh(geometry, material);
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
    let probeCurve = null;
    let probePathLine = null;
    let probeParticleCloud = null;
    let fpsHud = null;
    let fpsVisible = false;
    const SHOW_PROBE_PATH = false;
    const probeTargets = [];
    const probeTrails = [];
    const probePathPoints = [
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3()
    ];
    const probeWork = {
        pos: new THREE.Vector3(),
        tan: new THREE.Vector3(),
        look: new THREE.Vector3(),
        tailOrigin: new THREE.Vector3(),
        prevTail: new THREE.Vector3()
    };
    const probeParticles = [];
    const probeState = {
        t: 0,
        speed: 0.02,
        lastPathUpdateAt: -9999,
        pathUpdateMs: 120,
        lastFrameAt: 0
    };
    const fpsState = {
        frames: 0,
        lastSampleAt: 0
    };
    const cameraView = {
        topDown: false,
        topHeight: 2700
    };
    const marsTrails = [];
    const marsTrailWork = {
        curr: new THREE.Vector3(),
        prev: new THREE.Vector3()
    };
    const marsBaseScale = 1;
    
    console.log("map range test:", mapRange(-5, -10, 0, 0, 1));
    
    function init() {
        // Camera setup
        camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 9000);
        camera.position.z = 800;
        
        // Scene setup
        scene = new THREE.Scene();
        window.scene = scene;
        
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

        fpsHud = document.createElement('div');
        fpsHud.id = 'fps-hud';
        fpsHud.textContent = 'FPS --';
        fpsHud.style.position = 'fixed';
        fpsHud.style.top = '10px';
        fpsHud.style.right = '10px';
        fpsHud.style.padding = '4px 8px';
        fpsHud.style.fontFamily = 'monospace';
        fpsHud.style.fontSize = '12px';
        fpsHud.style.color = '#9ff0ff';
        fpsHud.style.background = 'rgba(0, 0, 0, 0.55)';
        fpsHud.style.border = '1px solid rgba(159, 240, 255, 0.55)';
        fpsHud.style.borderRadius = '4px';
        fpsHud.style.zIndex = '9999';
        fpsHud.style.pointerEvents = 'none';
        fpsHud.style.display = 'none';
        document.body.appendChild(fpsHud);
        
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
        venusAtmosphere = createFresnelAtmosphere(16.9, 0xf3b77a, 3.2, 0.58);
        venus.add(venusAtmosphere);

        earthAtmosphere = createFresnelAtmosphere(17.6, 0x5faeff, 3.9, 0.52);
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

        for (let i = 0; i < probeTargets.length; i++) {
            probeTargets[i].getWorldPosition(probePathPoints[i]);
        }

        // Lightweight probe that navigates a spline through current planet positions.
        probeCurve = new THREE.CatmullRomCurve3(probePathPoints, true, 'catmullrom', 0.38);
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
        probeObj.position.copy(probePathPoints[0]);
        scene.add(probeObj);

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

        if (SHOW_PROBE_PATH) {
            const probePathGeometry = new THREE.BufferGeometry().setFromPoints(probeCurve.getPoints(90));
            const probePathMaterial = new THREE.LineBasicMaterial({
                color: 0x65d9ff,
                transparent: true,
                opacity: 0.32
            });
            probePathLine = new THREE.LineLoop(probePathGeometry, probePathMaterial);
            scene.add(probePathLine);
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
        addParticles(mars);

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
    }

    function onKeyDown(event) {
        if (!event || !event.key) {
            return;
        }

        if (event.key.toLowerCase() === 'f') {
            fpsVisible = !fpsVisible;
            if (fpsHud) {
                fpsHud.style.display = fpsVisible ? 'block' : 'none';
            }
        }

        if (event.key.toLowerCase() === 't') {
            cameraView.topDown = !cameraView.topDown;
        }
    }
    
    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    // Cosmic text spawner (needs closure over scene + camera)
    // Sprites live in camera space so they always stay visible as the camera orbits.
    // camRelPos is in camera-local coordinates: +X right, +Y up, -Z forward.
    function spawnCosmicText(text, intervalSec) {
        if (!text || !scene || !camera) return;
        const nowMs = performance.now();
        // Cooldown = 90% of the set's minimum interval, so at most one text per cycle
        const cooldownMs = (intervalSec || 9) * 1000 * 0.9;
        if (cosmicTextSprites.length > 0) {
            const newest = cosmicTextSprites[cosmicTextSprites.length - 1];
            if ((nowMs - newest.userData.spawnedAt) < cooldownMs) return;
        }

        const sprite = makeTextSprite(text);

        // Spawn near the upper third of the screen (camera-local Y > 0).
        const camRelPos = new THREE.Vector3(
            (Math.random() - 0.5) * 38,   // left-right offset in cam space
            82 + ((Math.random() - 0.5) * 16), // upper area, above previous band
            -165                           // distance in front (camera looks along -Z)
        );

        // Place in world space for this frame
        sprite.position.copy(camRelPos.clone().applyMatrix4(camera.matrixWorld));

        const fadeInDur = 1200;
        const totalDuration = (intervalSec || 9) * 1000;

        sprite.userData = {
            spawnedAt: nowMs,
            totalDuration,
            fadeInDur,
            fadeOutDur: totalDuration - fadeInDur,  // lerp 1→0 over this span
            camRelPos,
            recedingSpeed: 62,            // units/sec along -Z (receding)
            lateralDrift: new THREE.Vector2(
                (Math.random() - 0.5) * 5,   // cam-space X drift/sec
                2.8 + Math.random() * 1.8    // cam-space Y drift/sec (upward)
            )
        };

        scene.add(sprite);
        cosmicTextSprites.push(sprite);
    }

    spawnCosmicTextFn = spawnCosmicText;

    // Animation variables
    let level = 0;
    let smoothedLevel = -75;
    let lastAudioSampleAt = 0;
    let lastAnimateNow = 0;
    let probeReactiveDrive = 0;
    let frameCount = 0;
    const reactiveTuning = {
        sampleMs: 38,
        attackFactor: 0.72,
        releaseFactor: 0.2,
        dbInMin: -62,
        dbInMax: -16,
        curvePower: 0.88,
        transientDbMax: 8,
        transientMaxBoost: 0.42,
        emissiveBase: 0.66,
        emissiveGain: 1.42,
        scalePulse: 0.68,
        trailOpacityBoost: 0.18
    };
    const probeColorBase = new THREE.Color(0xa8f7ff);
    const probeColorHot = new THREE.Color(0xff2a2a);
    const probeEmissiveBase = new THREE.Color(0x3aaed1);
    const probeEmissiveHot = new THREE.Color(0xff1414);
    const probeColorWork = new THREE.Color();
    const probeEmissiveWork = new THREE.Color();
        const cameraMotion = {
        radius: 2040,
        orbitSpeed: 0.00022,
        radiusSwing: 160,
        verticalBase: 220,
        verticalAmp: 170,
        verticalSpeed: 0.00031
    };
    
    function animate(now) {
        if (typeof now !== 'number') {
            now = performance.now();
        }

        requestAnimationFrame(animate);
        frameCount++;
        fpsState.frames++;

        if (fpsState.lastSampleAt === 0) {
            fpsState.lastSampleAt = now;
        }

        const fpsElapsed = now - fpsState.lastSampleAt;
        if (fpsElapsed >= 250) {
            const fpsValue = (fpsState.frames * 1000) / fpsElapsed;
            fpsState.frames = 0;
            fpsState.lastSampleAt = now;
            if (fpsHud && fpsVisible) {
                fpsHud.textContent = `FPS ${fpsValue.toFixed(1)}`;
            }
        }

        if (!sceneEnabled) {
            return;
        }

        if (cameraView.topDown) {
            camera.up.set(0, 0, -1);
            camera.position.set(0, cameraView.topHeight, 0.01);
            camera.lookAt(0, 0, 0);
        } else {
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

        if (probeObj && probeCurve && probeTargets.length > 1) {
            if ((now - probeState.lastPathUpdateAt) >= probeState.pathUpdateMs) {
                for (let i = 0; i < probeTargets.length; i++) {
                    probeTargets[i].getWorldPosition(probePathPoints[i]);
                }
                probeCurve.updateArcLengths();
                if (probePathLine) {
                    probePathLine.geometry.dispose();
                    probePathLine.geometry = new THREE.BufferGeometry().setFromPoints(probeCurve.getPoints(90));
                }
                probeState.lastPathUpdateAt = now;
            }

            const deltaSec = probeState.lastFrameAt > 0
                ? Math.min(0.05, (now - probeState.lastFrameAt) * 0.001)
                : 0.016;
            probeState.lastFrameAt = now;

            probeState.t += probeState.speed * deltaSec;
            if (probeState.t >= 1) {
                probeState.t -= 1;
            }

            probeCurve.getPoint(probeState.t, probeWork.pos);
            probeCurve.getTangent(probeState.t, probeWork.tan);
            probeObj.position.copy(probeWork.pos);
            probeWork.look.copy(probeWork.pos).add(probeWork.tan);
            probeObj.lookAt(probeWork.look);

            probeWork.tailOrigin.copy(probeWork.pos).addScaledVector(probeWork.tan, -9);
            for (let i = 0; i < probeTrails.length; i++) {
                const trail = probeTrails[i];
                const target = (i === 0) ? probeWork.tailOrigin : probeWork.prevTail.copy(probeTrails[i - 1].position);
                trail.position.lerp(target, Math.max(0.09, 0.29 - (i * 0.03)));
                trail.material.opacity = (0.23 - (i * 0.028)) + (Math.sin(now * 0.004 + i) * 0.015);
            }

            if (probeParticleCloud) {
                const positions = probeParticleCloud.geometry.attributes.position.array;
                const colors = probeParticleCloud.geometry.attributes.color.array;
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
        
        // Audio sampling kept only for comet brightness reaction.
        if ((now - lastAudioSampleAt) > reactiveTuning.sampleMs) {
            level = audio.getReactiveLevel();
            lastAudioSampleAt = now;
        }
        const smoothingFactor = level > smoothedLevel
            ? reactiveTuning.attackFactor
            : reactiveTuning.releaseFactor;
        smoothedLevel += (level - smoothedLevel) * smoothingFactor;

        const normalizedLevel = THREE.MathUtils.clamp(
            mapRange(smoothedLevel, reactiveTuning.dbInMin, reactiveTuning.dbInMax, 0, 1),
            0,
            1
        );
        const transientRise = Math.max(0, level - smoothedLevel);
        const transientBoost = THREE.MathUtils.clamp(
            mapRange(transientRise, 0, reactiveTuning.transientDbMax, 0, reactiveTuning.transientMaxBoost),
            0,
            reactiveTuning.transientMaxBoost
        );
        probeReactiveDrive = Math.min(2.0, Math.pow(normalizedLevel, reactiveTuning.curvePower) + transientBoost);

        if (sunLight) {
            sunLight.intensity = 1.5;
            sunLight.distance = 2550;
        }
        if (ambientLight) {
            ambientLight.intensity = 0.24;
        }
        if (hemiLight) {
            hemiLight.intensity = 0.3;
        }
        if (sunGlow) {
            const glowScale = 1.08 + (Math.sin(now * 0.001) * 0.02);
            sunGlow.scale.setScalar(glowScale);
            sunGlow.material.opacity = 0.06 + (Math.sin(now * 0.0014) * 0.012);
            sunGlow.material.color.setHSL(0.1, 0.9, 0.58);
        }

        // Keep Jupiter scale stable (no audio modulation).
        jupiter.scale.set(1.72, 1.72, 1.72);

        if (venusAtmosphere) {
            venusAtmosphere.rotation.y += 0.002;
            venusAtmosphere.material.uniforms.uCameraPos.value.copy(camera.position);
        }
        if (earthAtmosphere) {
            earthAtmosphere.rotation.y += 0.0012;
            earthAtmosphere.material.uniforms.uCameraPos.value.copy(camera.position);
        }
        if (saturnRings) {
            saturnRings.rotation.z += 0.00035;
        }

        // Atmospheres use subtle temporal shimmer only.
        if (venusAtmosphere) {
            const venusShimmer = Math.sin(now * 0.0017) * 0.018;
            venusAtmosphere.material.uniforms.uOpacity.value = 0.52 + venusShimmer;
        }
        if (earthAtmosphere) {
            const earthShimmer = Math.sin((now * 0.0014) + 1.1) * 0.015;
            earthAtmosphere.material.uniforms.uOpacity.value = 0.48 + earthShimmer;
        }

        if (probeObj) {
            const probeScale = 1 + (probeReactiveDrive * reactiveTuning.scalePulse);
            const colorMix = THREE.MathUtils.clamp(probeReactiveDrive / 1.4, 0, 1);
            probeColorWork.copy(probeColorBase).lerp(probeColorHot, colorMix);
            probeEmissiveWork.copy(probeEmissiveBase).lerp(probeEmissiveHot, colorMix);

            probeObj.scale.setScalar(probeScale);
            probeObj.material.color.copy(probeColorWork);
            probeObj.material.emissive.copy(probeEmissiveWork);
            probeObj.material.emissiveIntensity = reactiveTuning.emissiveBase + (probeReactiveDrive * reactiveTuning.emissiveGain);

            if (probeParticleCloud && probeParticleCloud.material) {
                probeParticleCloud.material.opacity = 0.45 + (colorMix * 0.3);
            }
        }

        for (let i = 0; i < probeTrails.length; i++) {
            const trail = probeTrails[i];
            const baseOpacity = 0.13 - (i * 0.018);
            trail.material.opacity = baseOpacity + (probeReactiveDrive * reactiveTuning.trailOpacityBoost * (1 - (i * 0.1)));
        }

        // Mars motion stays animated but independent from audio.
        const marsPulse = 1.02 + (Math.sin(now * 0.0028) * 0.07);
        mars.scale.set(
            (marsBaseScale * marsPulse) + (Math.sin(now * 0.0042) * 0.028),
            (marsBaseScale * marsPulse) + (Math.sin((now * 0.0042) + 1.4) * 0.02),
            (marsBaseScale * marsPulse) + (Math.sin((now * 0.0042) + 2.2) * 0.024)
        );
        if (marsAura) {
            const auraPulse = 1.06 + (Math.sin((now * 0.0016) + 0.8) * 0.22);
            marsAura.intensity = auraPulse;
            marsAura.distance = 140 + (auraPulse * 58);
            marsAura.color.setHSL(0.03 + (Math.sin(now * 0.0011) * 0.02), 0.95, 0.52);
        }

        // World-space trail follow chain for a comet-like streak.
        mars.getWorldPosition(marsTrailWork.curr);
        for (let i = 0; i < marsTrails.length; i++) {
            const trail = marsTrails[i];
            const target = (i === 0) ? marsTrailWork.curr : marsTrailWork.prev.copy(marsTrails[i - 1].position);
            const lerpAlpha = 0.25 - (i * 0.025);
            trail.position.lerp(target, Math.max(0.06, lerpAlpha));
            const trailPulse = 1 + (Math.sin((now * 0.0022) + (i * 0.45)) * 0.08);
            const localPulse = trailPulse * (1 - (i * 0.09));
            trail.scale.setScalar(localPulse);
            trail.material.opacity = (0.09 - (i * 0.015)) + (trailPulse * 0.06);
            trail.material.color.setHSL(0.045 - (i * 0.005), 0.95, 0.52);
        }
        
        // Update cosmic text sprites (camera-space tracking + recede)
        if (cosmicTextSprites.length > 0) {
            const textDelta = lastAnimateNow > 0 ? Math.min(0.1, (now - lastAnimateNow) * 0.001) : 0.016;
            for (let i = cosmicTextSprites.length - 1; i >= 0; i--) {
                const s = cosmicTextSprites[i];
                const ud = s.userData;
                const age = now - ud.spawnedAt;
                if (age >= ud.totalDuration) {
                    scene.remove(s);
                    if (s.material.map) s.material.map.dispose();
                    s.material.dispose();
                    cosmicTextSprites.splice(i, 1);
                    continue;
                }
                // Advance in camera space: recede along -Z, drift in X/Y
                ud.camRelPos.z -= ud.recedingSpeed * textDelta;
                ud.camRelPos.x += ud.lateralDrift.x * textDelta;
                ud.camRelPos.y += ud.lateralDrift.y * textDelta;
                // Convert camera-local position to world space each frame
                s.position.copy(ud.camRelPos.clone().applyMatrix4(camera.matrixWorld));

                let opacity;
                if (age < ud.fadeInDur) {
                    // Quick fade-in
                    opacity = age / ud.fadeInDur;
                } else {
                    // Continuous lerp 1 → 0 over fadeOutDur
                    opacity = 1.0 - (age - ud.fadeInDur) / ud.fadeOutDur;
                }
                s.material.opacity = Math.max(0, opacity) * 0.90;
            }
        }
        lastAnimateNow = now;

        renderer.render(scene, camera);
    }

    init();
    animate();
}