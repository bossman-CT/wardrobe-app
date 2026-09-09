// Lightweight client-side background removal: flood-fills the background
// starting from the image border (like a magic-wand tool) and feathers the
// resulting edge, so clothing photos with a plain backdrop show just the
// garment instead of a hard rectangle.

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
    resolve({ dataUrl: canvas.toDataURL("image/png"), shoulder });
  });
}
