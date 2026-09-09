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

function removeBackground(img, { tolerance = 30, maxDim = 900 } = {}) {
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

    // Sample the border to find a reference background color (median is
    // robust against a stray shadow or logo pixel on the edge).
    const borderR = [], borderG = [], borderB = [];
    for (let x = 0; x < cw; x++) {
      for (const y of [0, ch - 1]) {
        const di = idxOf(x, y) * 4;
        borderR.push(data[di]); borderG.push(data[di + 1]); borderB.push(data[di + 2]);
      }
    }
    for (let y = 0; y < ch; y++) {
      for (const x of [0, cw - 1]) {
        const di = idxOf(x, y) * 4;
        borderR.push(data[di]); borderG.push(data[di + 1]); borderB.push(data[di + 2]);
      }
    }
    const median = (arr) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    const refR = median(borderR), refG = median(borderG), refB = median(borderB);

    function distToRef(idx) {
      const di = idx * 4;
      const dr = data[di] - refR, dg = data[di + 1] - refG, db = data[di + 2] - refB;
      return Math.sqrt(dr * dr + dg * dg + db * db);
    }

    const visited = new Uint8Array(n);
    const queue = new Int32Array(n);
    let qHead = 0, qTail = 0;

    function tryAdd(x, y) {
      if (x < 0 || x >= cw || y < 0 || y >= ch) return;
      const idx = idxOf(x, y);
      if (visited[idx]) return;
      if (distToRef(idx) <= tolerance) {
        visited[idx] = 1;
        queue[qTail++] = idx;
      }
    }

    for (let x = 0; x < cw; x++) {
      for (const y of [0, ch - 1]) tryAdd(x, y);
    }
    for (let y = 0; y < ch; y++) {
      for (const x of [0, cw - 1]) tryAdd(x, y);
    }

    while (qHead < qTail) {
      const idx = queue[qHead++];
      const x = idx % cw, y = (idx / cw) | 0;
      tryAdd(x - 1, y);
      tryAdd(x + 1, y);
      tryAdd(x, y - 1);
      tryAdd(x, y + 1);
    }

    // Average color over the surviving (non-background) pixels — the
    // "best guess" swatch used for the stylized garment silhouette.
    let sumR = 0, sumG = 0, sumB = 0, fgCount = 0;
    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;
      const di = i * 4;
      sumR += data[di]; sumG += data[di + 1]; sumB += data[di + 2];
      fgCount++;
    }
    const dominantColor = fgCount
      ? `rgb(${Math.round(sumR / fgCount)}, ${Math.round(sumG / fgCount)}, ${Math.round(sumB / fgCount)})`
      : "rgb(200, 197, 214)";

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
    resolve({ dataUrl: canvas.toDataURL("image/png"), color: dominantColor });
  });
}
