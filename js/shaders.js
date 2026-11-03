import * as THREE from 'three';

export const crtShader = {
    uniforms: {
        tDiffuse: { value: null },
        time: { value: 0 },
        scanlineIntensity: { value: 0.18 },
        noiseIntensity: { value: 0.045 },
        curvature: { value: 0.075 },
        vignetteStrength: { value: 0.36 },
        trackingDrift: { value: 0.0 },
        rgbShift: { value: 0.001 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform float scanlineIntensity;
        uniform float noiseIntensity;
        uniform float curvature;
        uniform float vignetteStrength;
        uniform float trackingDrift;
        uniform float rgbShift;
        varying vec2 vUv;

        float rand(vec2 co) {
            return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
            vec2 uv = vUv;
            vec2 centered = (uv - 0.5) * 2.0;
            vec2 warped = uv + centered * dot(centered, centered) * curvature * 0.15;

            float trackingNoise = sin((warped.y * 190.0) + (time * 13.0)) * trackingDrift;
            warped.x += trackingNoise;

            float shift = rgbShift + (trackingDrift * 0.35);
            float cr = texture2D(tDiffuse, warped + vec2(shift, 0.0)).r;
            float cg = texture2D(tDiffuse, warped).g;
            float cb = texture2D(tDiffuse, warped - vec2(shift * 0.8, 0.0)).b;
            vec4 color = vec4(cr, cg, cb, 1.0);

            float scan = sin((warped.y * 1200.0) + (time * 9.0));
            color.rgb -= scan * scanlineIntensity * 0.12;

            float grain = rand(warped + vec2(time * 0.13, time * 0.07)) - 0.5;
            color.rgb += grain * noiseIntensity;

            float vignette = smoothstep(1.0, 0.15, length(centered));
            color.rgb *= mix(1.0 - vignetteStrength, 1.0, vignette);

            gl_FragColor = color;
        }
    `
};

export function createVideoChromaMaterial(videoTexture) {
    return new THREE.ShaderMaterial({
        uniforms: {
            map: { value: videoTexture },
            keyThreshold: { value: 0.045 },
            keySoftness: { value: 0.06 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D map;
            uniform float keyThreshold;
            uniform float keySoftness;
            varying vec2 vUv;

            void main() {
                vec4 c = texture2D(map, vUv);
                float keyValue = max(c.r, max(c.g, c.b));
                float alpha = smoothstep(keyThreshold, keyThreshold + keySoftness, keyValue);
                vec3 boosted = c.rgb * (0.8 + alpha * 0.5);
                gl_FragColor = vec4(boosted, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });
}

export function createPlasmaMaterial(plasmaUniforms) {
    return new THREE.ShaderMaterial({
        uniforms: plasmaUniforms,
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            uniform float time;

            void main() {
                vec2 p = (vUv - 0.5) * 3.2;
                float v = 0.0;
                v += sin((p.x + time * 0.8) * 3.1);
                v += sin((p.y - time * 0.6) * 4.3);
                v += sin((p.x + p.y + time * 0.5) * 2.7);
                v += sin(sqrt((p.x * p.x) + (p.y * p.y) + 1.0) * 4.0 - (time * 2.0));
                v *= 0.25;

                vec3 c1 = vec3(0.10, 0.04, 0.22);
                vec3 c2 = vec3(0.02, 0.45, 0.55);
                vec3 c3 = vec3(0.72, 0.12, 0.15);
                vec3 col = mix(c1, c2, smoothstep(-0.6, 0.2, v));
                col = mix(col, c3, smoothstep(0.1, 0.8, v));

                gl_FragColor = vec4(col, 0.26);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    });
}
