import * as THREE from 'three';

export function createTextPlane(options) {
    const {
        text,
        width,
        height,
        font = 'bold 82px Trebuchet MS',
        fg = '#ffffff',
        bg = null,
        border = null,
        align = 'center'
    } = options;

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const g = canvas.getContext('2d');

    if (bg) {
        g.fillStyle = bg;
        g.fillRect(0, 0, canvas.width, canvas.height);
    } else {
        g.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (border) {
        g.strokeStyle = border;
        g.lineWidth = 18;
        g.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    }

    g.fillStyle = fg;
    g.font = font;
    g.textAlign = align;
    g.textBaseline = 'middle';
    const x = align === 'left' ? 48 : (align === 'right' ? canvas.width - 48 : canvas.width / 2);
    g.fillText(text, x, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    const geometry = new THREE.PlaneGeometry(width, height);
    const mesh = new THREE.Mesh(geometry, material);

    return { mesh, texture, material, geometry };
}

// Estilos de cartel: 'link' (amarillo, va a un proyecto), 'category' (cian con carpeta,
// abre una categoria) y 'back' (rosa con flecha, vuelve al primer nivel).
const signStyles = {
    link: { bg: '#fff39a', border: '#2f0a00', fg: '#8a1a00' },
    category: { bg: '#9ff0ff', border: '#00243f', fg: '#003a66' },
    back: { bg: '#ffc2ec', border: '#3f0030', fg: '#7a0058' }
};

export function createSignTexture(label, variant = 'link') {
    const style = signStyles[variant] || signStyles.link;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const g = canvas.getContext('2d');

    g.fillStyle = style.bg;
    g.fillRect(0, 0, canvas.width, canvas.height);

    g.strokeStyle = style.border;
    g.lineWidth = 22;
    g.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

    g.font = 'bold 72px Trebuchet MS';
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    let text = label || 'Enlace';
    if (text.length > 26) {
        text = text.slice(0, 23) + '...';
    }

    // Con icono el texto se corre a la derecha para que el conjunto quede centrado.
    const hasIcon = variant === 'category' || variant === 'back';
    const iconWidth = 96;
    const gap = 28;
    const textWidth = g.measureText(text).width;
    const textX = hasIcon ? (canvas.width / 2) + ((iconWidth + gap) / 2) : canvas.width / 2;
    const iconX = textX - (textWidth / 2) - gap - iconWidth;
    const midY = canvas.height / 2;

    if (variant === 'category') {
        drawFolderIcon(g, iconX, midY, iconWidth, style);
    } else if (variant === 'back') {
        drawBackIcon(g, iconX, midY, iconWidth, style);
    }

    g.fillStyle = style.fg;
    g.fillText(text, textX, midY);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
}

function drawFolderIcon(g, x, midY, w, style) {
    const h = w * 0.72;
    const top = midY - (h / 2);
    g.fillStyle = '#ffd34d';
    g.strokeStyle = style.border;
    g.lineWidth = 8;
    // Pestaña + cuerpo de la carpeta.
    g.beginPath();
    g.moveTo(x, top + (h * 0.18));
    g.lineTo(x, top);
    g.lineTo(x + (w * 0.38), top);
    g.lineTo(x + (w * 0.48), top + (h * 0.18));
    g.lineTo(x + w, top + (h * 0.18));
    g.lineTo(x + w, top + h);
    g.lineTo(x, top + h);
    g.closePath();
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(x, top + (h * 0.34));
    g.lineTo(x + w, top + (h * 0.34));
    g.stroke();
}

function drawBackIcon(g, x, midY, w, style) {
    const h = w * 0.8;
    g.fillStyle = style.fg;
    g.beginPath();
    g.moveTo(x, midY);
    g.lineTo(x + w, midY - (h / 2));
    g.lineTo(x + w, midY + (h / 2));
    g.closePath();
    g.fill();
}

export function createDescriptionTexture(description) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const g = canvas.getContext('2d');

    g.fillStyle = '#17324f';
    g.fillRect(0, 0, canvas.width, canvas.height);

    g.fillStyle = '#66d0ff';
    g.lineWidth = 22;
    g.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

    g.fillStyle = '#d6f7ff';
    g.font = 'bold 54px Trebuchet MS';
    g.textAlign = 'left';
    g.textBaseline = 'top';

    const raw = (description || 'Sin descripcion disponible').trim();
    const words = raw.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    const maxWidth = canvas.width - 120;

    for (const word of words) {
        const candidate = current ? (current + ' ' + word) : word;
        if (g.measureText(candidate).width <= maxWidth) {
            current = candidate;
        } else {
            if (current) {
                lines.push(current);
            }
            current = word;
        }
    }
    if (current) {
        lines.push(current);
    }

    const maxLines = 4;
    const safeLines = lines.slice(0, maxLines);
    if (lines.length > maxLines && safeLines.length > 0) {
        const lastIndex = safeLines.length - 1;
        let lastLine = safeLines[lastIndex];
        while (g.measureText(lastLine + '...').width > maxWidth && lastLine.length > 1) {
            lastLine = lastLine.slice(0, -1);
        }
        safeLines[lastIndex] = lastLine + '...';
    }

    safeLines.forEach((line, idx) => {
        g.fillText(line, 60, 60 + (idx * 108));
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
}
