import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

let loadedTextFont = null;
export async function loadThreeTextFont() {
    if (loadedTextFont) {
        return loadedTextFont;
    }

    const loader = new FontLoader();
    loadedTextFont = await new Promise((resolve, reject) => {
        loader.load(
            new URL('./assets/fonts/droid_sans_bold.typeface.json', window.location.href).href,
            resolve,
            undefined,
            reject
        );
    });
    return loadedTextFont;
}

export function createThreeText(options) {
    const {
        text,
        font,
        size,
        depth,
        color,
        align = 'center',
        transparent = false,
        opacity = 1
    } = options;

    const geometry = new TextGeometry(text, {
        font,
        size,
        depth,
        curveSegments: 10,
        bevelEnabled: false
    });
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    const width = bb ? (bb.max.x - bb.min.x) : 0;

    if (align === 'center') {
        geometry.translate(-width / 2, 0, 0);
    } else if (align === 'right') {
        geometry.translate(-width, 0, 0);
    }

    const material = new THREE.MeshBasicMaterial({ color, transparent, opacity });
    const mesh = new THREE.Mesh(geometry, material);
    return { mesh, geometry, material, width };
}

export function createHeartShape() {
    const heartShape = new THREE.Shape();
    const samples = 140;
    const sx = 0.06;
    const sy = 0.055;

    for (let i = 0; i <= samples; i++) {
        const t = (i / samples) * Math.PI * 2;
        const x = 16 * Math.pow(Math.sin(t), 3) * sx;
        const y = (
            13 * Math.cos(t) -
            5 * Math.cos(2 * t) -
            2 * Math.cos(3 * t) -
            Math.cos(4 * t)
        ) * sy;

        if (i === 0) {
            heartShape.moveTo(x, y);
        } else {
            heartShape.lineTo(x, y);
        }
    }

    heartShape.closePath();
    return heartShape;
}
