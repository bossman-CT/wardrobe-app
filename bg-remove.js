// Lightweight client-side background removal: flood-fills the background
// starting from the image border (like a magic-wand tool) and feathers the
// resulting edge, so clothing photos with a plain backdrop show just the
// garment instead of a hard rectangle.

function pixelToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s, l };
}

// Lightness is deliberately the least significant term: a solid garment
// photographed with folds and shadows swings a lot in brightness but barely
// at all in hue, so weighting brightness normally would read every wrinkled
// sweater as a print. Hue is scaled by saturation because the hue of a
// near-grey pixel is meaningless noise.
function patternColorDistance(a, b) {
  const dh = Math.abs(a.h - b.h);
  const hue = (Math.min(dh, 360 - dh) / 180) * Math.min(a.s, b.s);
  return hue * 1.6 + Math.abs(a.s - b.s) * 0.9 + Math.abs(a.l - b.l) * 0.55;
}

// Reports whether a garment reads as a solid or a print, and how large the
// print is. Stylists treat a solid as an anchor that goes with any pattern,
// while two prints only work together when their scales clearly differ, so
// the outfit scorer needs both facts.
function analyzePattern(data, visited, cw, ch) {
  const n = cw * ch;
  const stride = Math.max(1, Math.floor(n / 40000));

  const BUCKETS = 6, BUCKET_SIZE = 256 / BUCKETS;
  const hist = new Int32Array(BUCKETS * BUCKETS * BUCKETS);
  const samples = [];
  for (let i = 0; i < n; i += stride) {
    if (visited[i]) continue;
    const di = i * 4;
    const r = data[di], g = data[di + 1], b = data[di + 2];
    const br = Math.min(BUCKETS - 1, (r / BUCKET_SIZE) | 0);
    const bg = Math.min(BUCKETS - 1, (g / BUCKET_SIZE) | 0);
    const bb = Math.min(BUCKETS - 1, (b / BUCKET_SIZE) | 0);
    const bucket = (br * BUCKETS + bg) * BUCKETS + bb;
    samples.push({ r, g, b, bucket, hsl: pixelToHsl(r, g, b) });
    hist[bucket]++;
  }
  if (samples.length < 200) return null;

  let topBucket = 0;
  for (let i = 1; i < hist.length; i++) if (hist[i] > hist[topBucket]) topBucket = i;
  // Averaged over the pixels actually in the bucket rather than taken from
  // the bucket's midpoint - a bucket spans a wide chunk of color space, so
  // its midpoint can sit far enough from the real garment color to make a
  // plain solid look like a print.
  let domR = 0, domG = 0, domB = 0, domCount = 0;
  for (const s of samples) {
    if (s.bucket !== topBucket) continue;
    domR += s.r; domG += s.g; domB += s.b; domCount++;
  }
  const dominant = pixelToHsl(domR / domCount, domG / domCount, domB / domCount);

  let near = 0;
  for (const s of samples) if (patternColorDistance(s.hsl, dominant) < 0.16) near++;
  const dominantShare = near / samples.length;
  // Solids - including heavily shadowed and heather-marl ones - measure at
  // 0.99+, while every print tested lands at 0.78 or below, so the cutoff
  // sits in the empty gap between the two rather than near either group.
  const patterned = dominantShare < 0.88;
  if (!patterned) return { patterned: false, scale: null };

  // A fine print (pinstripes, small dots) averages out to near-nothing once
  // the garment is squashed into a coarse grid; a bold one (large florals,
  // wide stripes, buffalo check) still varies cell to cell. That difference
  // is what separates the two scales.
  const GRID = 14;
  const cellSum = new Float64Array(GRID * GRID * 3);
  const cellCount = new Int32Array(GRID * GRID);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const idx = y * cw + x;
      if (visited[idx]) continue;
      const cell = ((y * GRID / ch) | 0) * GRID + ((x * GRID / cw) | 0);
      const di = idx * 4;
      cellSum[cell * 3] += data[di];
      cellSum[cell * 3 + 1] += data[di + 1];
      cellSum[cell * 3 + 2] += data[di + 2];
      cellCount[cell]++;
    }
  }
  const cells = [];
  for (let c = 0; c < GRID * GRID; c++) {
    if (cellCount[c] < 12) { cells.push(null); continue; }
    cells.push(pixelToHsl(
      cellSum[c * 3] / cellCount[c],
      cellSum[c * 3 + 1] / cellCount[c],
      cellSum[c * 3 + 2] / cellCount[c]
    ));
  }
  let diffSum = 0, diffCount = 0;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const here = cells[y * GRID + x];
      if (!here) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= GRID || ny >= GRID) continue;
        const other = cells[ny * GRID + nx];
        if (!other) continue;
        diffSum += patternColorDistance(here, other);
        diffCount++;
      }
    }
  }
  const coarseVariation = diffCount ? diffSum / diffCount : 0;
  return { patterned: true, scale: coarseVariation > 0.06 ? "bold" : "fine" };
}

function loadImageFromSrc(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function removeBackground(img, { localTolerance = 26, seedTolerance = 55, globalTolerance = 95, maxDim = 900 } = {}) {
  return new Promise((resolve) => {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, cw, ch);

    const imageData = ctx.getImageData(0, 0, cw, ch);
    const data = imageData.data;
    const n = cw * ch;
    const idxOf = (x, y) => y * cw + x;

    // Real photos (a bed, a floor) rarely have one uniform background color -
    // there's wood grain, wrinkled fabric, shadows. So this isn't a single
    // reference color: each pixel we accept as background carries forward
    // the color of the border pixel that originally started its region. A
    // neighbor is accepted only if it's close to BOTH the pixel right next
    // to it (tolerates gradual texture/shadow) AND that original seed color
    // (stops the fill before it drifts, step by step, into the garment).
    const seedR = new Uint8Array(n), seedG = new Uint8Array(n), seedB = new Uint8Array(n);
    const visited = new Uint8Array(n);
    const queue = new Int32Array(n);
    let qHead = 0, qTail = 0;

    const borderR = [], borderG = [], borderB = [];
    function seedPixel(x, y) {
      const idx = idxOf(x, y);
      const di = idx * 4;
      borderR.push(data[di]); borderG.push(data[di + 1]); borderB.push(data[di + 2]);
      if (visited[idx]) return;
      visited[idx] = 1;
      seedR[idx] = data[di]; seedG[idx] = data[di + 1]; seedB[idx] = data[di + 2];
      queue[qTail++] = idx;
    }
    for (let x = 0; x < cw; x++) { seedPixel(x, 0); seedPixel(x, ch - 1); }
    for (let y = 0; y < ch; y++) { seedPixel(0, y); seedPixel(cw - 1, y); }

    // A backstop against the local/seed checks alone: even a photo with real
    // texture rarely swings from, say, light bedsheet to near-black without
    // ever being far from the OVERALL border tone. A garment with strong
    // contrast against the general scene stays excluded even if one shadowed
    // patch of background happens to locally resemble it.
    const median = (arr) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    const globalR = median(borderR), globalG = median(borderG), globalB = median(borderB);
    // The photo's own backdrop color - lets the mannequin stage's backdrop
    // match it automatically so the cutout blends in seamlessly.
    const bgColor = `rgb(${globalR}, ${globalG}, ${globalB})`;

    function tryAdd(x, y, fromIdx) {
      if (x < 0 || x >= cw || y < 0 || y >= ch) return;
      const idx = idxOf(x, y);
      if (visited[idx]) return;
      const di = idx * 4, fi = fromIdx * 4;
      const dr1 = data[di] - data[fi], dg1 = data[di + 1] - data[fi + 1], db1 = data[di + 2] - data[fi + 2];
      if (Math.sqrt(dr1 * dr1 + dg1 * dg1 + db1 * db1) > localTolerance) return;
      const sr = seedR[fromIdx], sg = seedG[fromIdx], sb = seedB[fromIdx];
      const dr2 = data[di] - sr, dg2 = data[di + 1] - sg, db2 = data[di + 2] - sb;
      if (Math.sqrt(dr2 * dr2 + dg2 * dg2 + db2 * db2) > seedTolerance) return;
      const dr3 = data[di] - globalR, dg3 = data[di + 1] - globalG, db3 = data[di + 2] - globalB;
      if (Math.sqrt(dr3 * dr3 + dg3 * dg3 + db3 * db3) > globalTolerance) return;
      visited[idx] = 1;
      seedR[idx] = sr; seedG[idx] = sg; seedB[idx] = sb;
      queue[qTail++] = idx;
    }

    while (qHead < qTail) {
      const idx = queue[qHead++];
      const x = idx % cw, y = (idx / cw) | 0;
      tryAdd(x - 1, y, idx);
      tryAdd(x + 1, y, idx);
      tryAdd(x, y - 1, idx);
      tryAdd(x, y + 1, idx);
    }

    // Find the "shoulder line": the widest point of the garment within the
    // top ~55% of the photo. For a shirt laid flat or hung facing forward,
    // this reliably lands on the shoulder/sleeve span, which is what lets
    // the app line a top up on the mannequin automatically.
    let bestRowWidth = -1, shoulderY = 0, shoulderLeft = 0, shoulderRight = 0;
    const scanLimit = Math.floor(ch * 0.55);
    for (let y = 0; y < scanLimit; y++) {
      let left = -1, right = -1;
      for (let x = 0; x < cw; x++) {
        if (!visited[idxOf(x, y)]) {
          if (left === -1) left = x;
          right = x;
        }
      }
      if (left !== -1 && (right - left) > bestRowWidth) {
        bestRowWidth = right - left;
        shoulderY = y;
        shoulderLeft = left;
        shoulderRight = right;
      }
    }
    const shoulder = bestRowWidth > 0 ? {
      xFrac: (shoulderLeft + shoulderRight) / 2 / cw,
      widthFrac: (shoulderRight - shoulderLeft) / cw,
      yFrac: shoulderY / ch,
      imgAspect: ch / cw
    } : null;

    // Average color over the foreground pixels - a "best guess" swatch
    // used to bias outfit color-matching, not for rendering.
    let sumR = 0, sumG = 0, sumB = 0, fgCount = 0;
    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;
      const di = i * 4;
      sumR += data[di]; sumG += data[di + 1]; sumB += data[di + 2];
      fgCount++;
    }
    const color = fgCount
      ? `rgb(${Math.round(sumR / fgCount)}, ${Math.round(sumG / fgCount)}, ${Math.round(sumB / fgCount)})`
      : null;

    const pattern = analyzePattern(data, visited, cw, ch);

    let alpha = new Float32Array(n);
    for (let i = 0; i < n; i++) alpha[i] = visited[i] ? 0 : 255;

    function blurPass(src) {
      const out = new Float32Array(n);
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          let sum = 0, count = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx, ny = y + dy;
              if (nx < 0 || nx >= cw || ny < 0 || ny >= ch) continue;
              sum += src[idxOf(nx, ny)];
              count++;
            }
          }
          out[idxOf(x, y)] = sum / count;
        }
      }
      return out;
    }
    alpha = blurPass(blurPass(alpha));

    for (let i = 0; i < n; i++) data[i * 4 + 3] = Math.round(alpha[i]);
    ctx.putImageData(imageData, 0, 0);
    resolve({ dataUrl: canvas.toDataURL("image/png"), shoulder, color, bgColor, pattern });
  });
}
