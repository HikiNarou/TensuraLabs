/**
 * Liquid "slime splash" wipe. Clips an element along an animated, turbulent edge and
 * renders droplets and foam on a canvas overlay that follows the edge.
 *   direction 'rise': edge travels bottom → top, the clipped element disappears.
 *   direction 'fall': edge travels top → bottom, the clipped element is revealed.
 */
const easeInOut = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Slime palette (RGB triplets) shared by the body, foam, and droplets. */
const PALETTE = Object.freeze({
  foam: [240, 244, 255],
  glow: [120, 170, 255],
  body: [94, 150, 255],
  deep: [29, 63, 191],
  silver: [230, 236, 255],
});
const rgba = ([r, g, b], alpha) => `rgba(${r},${g},${b},${alpha.toFixed(3)})`;

/** Bubbles suspended in the liquid band right behind the front. */
function createInnerBubbles(width, lowPower) {
  const count = lowPower ? 12 : 26;
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    depth: 0.15 + Math.random() * 0.8,
    r: 1.2 + Math.random() * 3.6,
    phase: Math.random() * Math.PI * 2,
    drift: (Math.random() - 0.5) * 0.6,
  }));
}

/** 1-D value noise with smooth interpolation; `offset` scrolls it horizontally over time. */
function createOctave(nodes) {
  const values = Array.from({ length: nodes + 2 }, () => Math.random() * 2 - 1);
  return (u, offset) => {
    const v = ((u * nodes + offset) % nodes + nodes) % nodes;
    const i = Math.floor(v);
    return values[i] + (values[i + 1] - values[i]) * smooth(v - i);
  };
}

/** A few rounded "splash fingers" that shoot ahead of the liquid front. */
function createFingers(width) {
  const count = 5 + Math.floor(Math.random() * 5);
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    w: 14 + Math.random() * 46,
    h: 0.5 + Math.random() * 0.9,
    phase: Math.random() * Math.PI * 2,
    speed: 2 + Math.random() * 3,
  }));
}

/** Small / low-core devices get fewer segments, particles and a lower canvas resolution. */
const isLowPower = (width) => width < 768 || (navigator.hardwareConcurrency || 4) <= 4 || navigator.connection?.saveData === true;

/** One pre-rendered bubble sprite reused for every suspended bubble (no per-frame gradients). */
let bubbleSprite = null;
function getBubbleSprite() {
  if (bubbleSprite) return bubbleSprite;
  const size = 48;
  const c = size / 2;
  bubbleSprite = document.createElement('canvas');
  bubbleSprite.width = size; bubbleSprite.height = size;
  const g = bubbleSprite.getContext('2d');
  const glow = g.createRadialGradient(c * 0.65, c * 0.65, c * 0.1, c, c, c);
  glow.addColorStop(0, rgba(PALETTE.foam, 1));
  glow.addColorStop(1, rgba(PALETTE.body, 0));
  g.fillStyle = glow;
  g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
  return bubbleSprite;
}

export function liquidWipe({ element, canvas, direction = 'rise', duration = 1250 }) {
  return new Promise((resolve) => {
    const ctx = canvas.getContext('2d');
    const width = window.innerWidth;
    const height = window.innerHeight;
    const lowPower = isLowPower(width);
    const dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas.classList.add('is-active');

    const octaves = [[createOctave(5), 0.55, 0.35], [createOctave(14), 0.3, -0.8], [createOctave(42), 0.12, 1.6]];
    const fingers = createFingers(width);
    const innerBubbles = createInnerBubbles(width, lowPower);
    const sprite = getBubbleSprite();
    const segments = Math.round(lowPower ? clamp(width / 12, 40, 90) : clamp(width / 10, 80, 150));
    const bandDepth = clamp(height * 0.13, 64, 130);
    const particles = [];
    const amplitude = Math.min(120, height * 0.14);
    const startY = direction === 'rise' ? height + amplitude * 1.8 : -amplitude * 1.8;
    const endY = direction === 'rise' ? -amplitude * 1.8 : height + amplitude * 1.8;
    const sprayDirection = direction === 'rise' ? -1 : 1;
    const maxParticles = lowPower ? 160 : 460;
    let start = 0;
    let last = 0;
    let finished = false;
    canvas.liquidGeneration = (canvas.liquidGeneration ?? 0) + 1;
    const generation = canvas.liquidGeneration;

    const edgeAt = (x, time, turbulence, base) => {
      const u = x / width;
      let offset = 0;
      for (const [octave, weight, drift] of octaves) offset += octave(u, time * drift) * weight;
      offset += Math.sin(x * 0.01 + time * 3) * 0.08;
      let finger = 0;
      for (const f of fingers) {
        const d = (x - f.x) / f.w;
        if (Math.abs(d) < 3) finger += Math.exp(-d * d) * f.h * (0.55 + 0.45 * Math.sin(time * f.speed + f.phase));
      }
      return base + amplitude * turbulence * (offset + sprayDirection * finger * 0.9);
    };

    function frame(now) {
      if (!start) start = now;
      const elapsed = now - start;
      // Physics is normalised to a 60 fps frame so 120 Hz and throttled devices look identical.
      const f = clamp(last ? (now - last) / 16.667 : 1, 0.25, 3);
      last = now;
      const progress = Math.min(1, elapsed / duration);
      const eased = easeInOut(progress);
      const base = startY + (endY - startY) * eased;
      const turbulence = 0.35 + Math.sin(progress * Math.PI) * 0.9;
      const time = elapsed / 1000;

      const points = [];
      for (let s = 0; s <= segments; s += 1) {
        const x = (s / segments) * width;
        points.push([x, edgeAt(x, time, turbulence, base)]);
      }
      const polygon = ['0px 0px', `${width}px 0px`, ...points.slice().reverse().map(([x, y]) => `${Math.round(x)}px ${Math.round(y)}px`)];
      if (!finished) element.style.clipPath = `polygon(${polygon.join(',')})`;

      // Spawn droplets along the edge.
      const spawn = progress < 0.97 ? Math.round((lowPower ? 9 : 15) * turbulence * Math.min(f, 2)) : 0;
      for (let k = 0; k < spawn && particles.length < maxParticles; k += 1) {
        const x = Math.random() * width;
        const y = edgeAt(x, time, turbulence, base);
        const silver = Math.random() < 0.7;
        particles.push({
          x, y,
          vx: (Math.random() - 0.5) * 3.2,
          vy: sprayDirection * (1.5 + Math.random() * 6.5),
          r: 0.6 + Math.random() * (Math.random() < 0.1 ? 4.2 : 2.2),
          life: 1,
          decay: 0.012 + Math.random() * 0.02,
          color: silver ? PALETTE.silver : PALETTE.body,
        });
      }

      ctx.clearRect(0, 0, width, height);

      // Translucent slime body trailing behind the front: bright meniscus → slime blue → clear.
      if (!finished) {
        const depth = bandDepth * -sprayDirection;
        ctx.beginPath();
        points.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        for (let i = points.length - 1; i >= 0; i -= 1) ctx.lineTo(points[i][0], points[i][1] + depth + Math.sin(points[i][0] * 0.02 + time * 4) * 8);
        ctx.closePath();
        const gradient = ctx.createLinearGradient(0, base, 0, base + depth);
        gradient.addColorStop(0, rgba(PALETTE.foam, 0.62));
        gradient.addColorStop(0.35, rgba(PALETTE.body, 0.42));
        gradient.addColorStop(1, rgba(PALETTE.deep, 0));
        ctx.fillStyle = gradient;
        ctx.fill();

        // Caustic shimmer line inside the body.
        ctx.beginPath();
        points.forEach(([x, y], index) => {
          const yy = y + depth * 0.38 + Math.sin(x * 0.013 - time * 5) * 7 + Math.sin(x * 0.041 + time * 3) * 3;
          if (index === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        });
        ctx.strokeStyle = rgba(PALETTE.foam, 0.22 * turbulence);
        ctx.lineWidth = 1.4;
        ctx.stroke();

        // Suspended bubbles rising/falling with the liquid.
        for (const bubble of innerBubbles) {
          bubble.x += (bubble.drift + Math.sin(time * 2 + bubble.phase) * 0.35) * f;
          if (bubble.x < -10) bubble.x = width + 10;
          if (bubble.x > width + 10) bubble.x = -10;
          const y = edgeAt(bubble.x, time, turbulence, base) + depth * bubble.depth + Math.sin(time * 3 + bubble.phase) * 4;
          ctx.globalAlpha = 0.75 * (1 - bubble.depth * 0.6);
          ctx.drawImage(sprite, Math.round(bubble.x - bubble.r), Math.round(y - bubble.r), Math.round(bubble.r * 2), Math.round(bubble.r * 2));
        }
        ctx.globalAlpha = 1;
      }

      // Soft glow under the meniscus: a wide translucent stroke instead of shadowBlur (which is
      // rasterised as a full Gaussian blur every frame).
      if (!finished) {
        ctx.beginPath();
        points.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.strokeStyle = rgba(PALETTE.glow, 0.16);
        ctx.lineWidth = 14;
        ctx.stroke();
        ctx.strokeStyle = rgba(PALETTE.glow, 0.28);
        ctx.lineWidth = 6;
        ctx.stroke();
      }

      // Foam band following the edge.
      for (let layer = 0; layer < (finished ? 0 : lowPower ? 3 : 4); layer += 1) {
        ctx.beginPath();
        points.forEach(([x, y], index) => {
          const yy = y + layer * 5 * -sprayDirection + Math.sin(x * 0.05 + time * 8 + layer) * 2.5;
          if (index === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        });
        ctx.strokeStyle = layer === 0 ? rgba(PALETTE.foam, 0.95) : `rgba(170,195,255,${0.45 - layer * 0.1})`;
        ctx.lineWidth = layer === 0 ? 2.2 : 5 - layer;
        ctx.stroke();
      }

      // Droplets.
      for (let p = particles.length - 1; p >= 0; p -= 1) {
        const particle = particles[p];
        particle.x += particle.vx * f;
        particle.y += particle.vy * f;
        particle.vy += (direction === 'rise' ? 0.16 : -0.05) * f;
        particle.life -= particle.decay * f;
        if (particle.life <= 0) { particles.splice(p, 1); continue; }
        const [r, g, b] = particle.color;
        ctx.beginPath();
        ctx.fillStyle = `rgba(${r},${g},${b},${(particle.life * 0.9).toFixed(3)})`;
        ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (generation !== canvas.liquidGeneration) return;
      if (progress >= 1 && !finished) {
        finished = true;
        finishClip();
        resolve();
      }
      if (progress < 1 || particles.length) {
        requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, width, height);
        canvas.classList.remove('is-active');
      }
    }

    function finishClip() {
      element.style.clipPath = direction === 'rise' ? 'inset(0 0 100% 0)' : '';
    }

    requestAnimationFrame(frame);
  });
}
