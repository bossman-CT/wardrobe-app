// Bump this alongside sw.js's CACHE version on every release. Kept as a
// simple, explicit number instead of relying on the service worker's own
// install/waiting/activate lifecycle to detect updates - that lifecycle
// has too many edge cases (accumulated waiting workers, a controller
// reference an already-open tab won't drop) that left the update banner
// stuck permanently visible for some users.
const APP_VERSION = 28;

const DEFAULT_PLACEMENT = {
  top: { x: 26, y: 15, w: 48, h: 29, r: 0 },
  bottom: { x: 27, y: 49, w: 46, h: 38, r: 0 },
  shoes: { x: 33, y: 79, w: 34, h: 11, r: 0 }
};
const CATEGORIES = ["top", "bottom"];
const LAYER_ORDER = { shoes: 1, bottom: 2, top: 3 };

const BACKDROPS = [
  { name: "Auto", value: "auto" },
  { name: "White", value: "#ffffff" },
  { name: "Soft Grey", value: "#e8e6ef" },
  { name: "Turquoise", value: "linear-gradient(160deg,#2dd4c8,#1a9e94)" },
  { name: "Blush Pink", value: "linear-gradient(160deg,#ffd1e3,#ff9ec4)" },
  { name: "Lavender", value: "linear-gradient(160deg,#d9c8ff,#a98aff)" },
  { name: "Sunset", value: "linear-gradient(160deg,#ffb37b,#ff6f61)" },
  { name: "Sky", value: "linear-gradient(160deg,#bfe3ff,#7fc4ff)" },
  { name: "Navy", value: "linear-gradient(160deg,#3a4a63,#1b2434)" },
  { name: "Charcoal", value: "linear-gradient(160deg,#4a4a52,#232327)" },
  { name: "Forest", value: "linear-gradient(160deg,#4d7a5f,#274a37)" }
];

// Shoes/accessories are picked as a color rather than photographed - a
// small curated palette covers most real shoes without needing a photo.
const SHOE_COLORS = [
  "#1a1a1a", "#ffffff", "#8b5e3c", "#c9a06a", "#7b6a5c",
  "#8c8c94", "#7c5cff", "#c0392b", "#d4788a", "#3d6b45",
  "#d9a441", "#2f4a63"
];

function shoeShapeSVG(color) {
  const fill = color || "#8c8c94";
  const sheenId = "shoe-sheen-" + Math.random().toString(36).slice(2, 9);
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${sheenId}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.45"/>
        <stop offset="45%" stop-color="#ffffff" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.22"/>
      </linearGradient>
    </defs>
    <ellipse cx="30" cy="58" rx="27" ry="20" fill="${fill}"/>
    <ellipse cx="72" cy="58" rx="27" ry="20" fill="${fill}"/>
    <ellipse cx="30" cy="58" rx="27" ry="20" fill="url(#${sheenId})" style="mix-blend-mode:overlay"/>
    <ellipse cx="72" cy="58" rx="27" ry="20" fill="url(#${sheenId})" style="mix-blend-mode:overlay"/>
  </svg>`;
}

let itemsCache = [];
let outfitsCache = [];

const builder = {
  placements: {} // cat -> { itemId, x, y, w, h, r }
};

let pickerTargetCat = null;
let deckIndex = 0;

function openPhotoView(item) {
  $("#photo-view-img").src = item.image;
  $("#photo-view-name").textContent = item.name || "";
  $("#photo-view-modal").classList.add("open");
}
$("#photo-view-close").addEventListener("click", () => $("#photo-view-modal").classList.remove("open"));
$("#photo-view-modal").addEventListener("click", (e) => {
  if (e.target.id === "photo-view-modal") $("#photo-view-modal").classList.remove("open");
});

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

// ---------- Tabs ----------
$all(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

function switchView(view) {
  $all(".view").forEach(v => v.classList.remove("active"));
  $all(".tab-btn").forEach(b => b.classList.remove("active"));
  $(`#view-${view}`).classList.add("active");
  $(`.tab-btn[data-view="${view}"]`).classList.add("active");
  $("#fab-add").style.display = view === "closet" ? "block" : "none";
  if (view === "outfits") renderOutfitDeck();
  if (view === "builder") fitStageBox($("#mannequin-stage").parentElement);
}

// ---------- Closet ----------
async function loadItems() {
  itemsCache = await DB.getAllItems();
  renderCloset();
}

function renderCloset() {
  CATEGORIES.forEach(cat => {
    const grid = $(`#grid-${cat}`);
    grid.innerHTML = "";
    const items = itemsCache.filter(i => i.category === cat);
    if (items.length === 0) {
      grid.innerHTML = `<div class="empty-grid-hint">No items yet</div>`;
      return;
    }
    items.forEach(item => grid.appendChild(buildItemCard(item, {
      onClick: (it) => openPhotoView(it)
    })));
  });
}

function buildItemCard(item, opts = {}) {
  const card = document.createElement("div");
  card.className = "item-card";
  card.innerHTML = `<img src="${item.image}" alt="${item.name || item.category}">`;
  if (item.name) {
    const label = document.createElement("div");
    label.className = "item-name";
    label.textContent = item.name;
    card.appendChild(label);
  }
  if (!opts.noDelete) {
    const del = document.createElement("button");
    del.className = "item-delete";
    del.textContent = "✕";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm("Remove this item from your closet?")) {
        await DB.deleteItem(item.id);
        await loadItems();
      }
    });
    card.appendChild(del);
  }
  if (opts.onClick) card.addEventListener("click", () => opts.onClick(item));
  return card;
}

// ---------- Add item modal ----------
let pendingImage = null;

$("#fab-add").addEventListener("click", () => openAddModal());
$("#add-cancel").addEventListener("click", () => closeAddModal());

function openAddModal() {
  pendingImage = null;
  $("#add-preview").hidden = true;
  $("#add-preview").src = "";
  $("#add-name").value = "";
  $("#add-category").value = "top";
  $("#add-save").disabled = true;
  $("#add-modal").classList.add("open");
}
function closeAddModal() {
  $("#add-modal").classList.remove("open");
}

function handleFileInput(input) {
  input.addEventListener("change", () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      pendingImage = reader.result;
      $("#add-preview").src = pendingImage;
      $("#add-preview").hidden = false;
      $("#add-save").disabled = false;
    };
    reader.readAsDataURL(file);
    input.value = "";
  });
}
handleFileInput($("#input-camera"));
handleFileInput($("#input-file"));

$("#add-save").addEventListener("click", async () => {
  if (!pendingImage) return;
  $("#add-save").disabled = true;
  $("#add-save").textContent = "Processing...";
  let image = pendingImage;
  let shoulder = null;
  let color = null;
  let bgColor = null;
  try {
    const img = await loadImageFromSrc(pendingImage);
    const processed = await removeBackground(img);
    image = processed.dataUrl;
    shoulder = processed.shoulder;
    color = processed.color;
    bgColor = processed.bgColor;
  } catch (e) { /* fall back to the original photo if processing fails */ }
  const item = {
    id: uid(),
    image,
    shoulder,
    color,
    bgColor,
    category: $("#add-category").value,
    name: $("#add-name").value.trim(),
    createdAt: Date.now()
  };
  $("#add-save").textContent = "Save Item";
  await DB.addItem(item);
  closeAddModal();
  await loadItems();
});

// ---------- Builder ----------
$("#clear-builder").addEventListener("click", () => {
  if (!confirm("Clear the current outfit?")) return;
  builder.placements = {};
  renderAllSlots();
  refreshBackdrop();
});

function renderAllSlots() {
  ["top", "bottom"].forEach(renderSlot);
}

function renderSlot(cat) {
  const slot = $(`#slot-${cat}`);
  const placement = builder.placements[cat];
  const pickerFn = cat === "shoes" ? openColorPicker : openPicker;
  slot.innerHTML = "";
  if (!placement) {
    slot.classList.add("empty");
    slot.classList.remove("filled");
    const label = document.createElement("span");
    label.className = "slot-label";
    label.textContent = cat === "shoes" ? "Tap to pick shoe color" : `Tap to add ${cat}`;
    slot.appendChild(label);
    slot.onclick = () => pickerFn(cat);
    slot.style.left = ""; slot.style.top = ""; slot.style.width = ""; slot.style.height = ""; slot.style.zIndex = "";
    resetSlotDefaultRect(slot, cat);
    return;
  }
  slot.classList.remove("empty");
  slot.classList.add("filled");
  slot.onclick = null;

  slot.style.left = placement.x + "%";
  slot.style.top = placement.y + "%";
  slot.style.width = placement.w + "%";
  slot.style.height = placement.h + "%";
  slot.style.zIndex = LAYER_ORDER[cat] || 0;

  const wrap = document.createElement("div");
  wrap.className = "placed-item";
  wrap.dataset.cat = cat;
  wrap.style.transform = `rotate(${placement.r || 0}deg)`;

  let content;
  if (cat === "shoes") {
    content = `<div class="shoe-shape">${shoeShapeSVG(placement.color)}</div>`;
  } else {
    const item = itemsCache.find(i => i.id === placement.itemId);
    content = `<img src="${item ? item.image : ""}" alt="">`;
  }
  wrap.innerHTML = content;
  slot.appendChild(wrap);

  makeDraggable(slot, wrap, cat, placement);
}

$("#change-top-btn").addEventListener("click", () => openPicker("top"));
$("#change-bottom-btn").addEventListener("click", () => openPicker("bottom"));

function resetSlotDefaultRect(slot, cat) {
  const d = DEFAULT_PLACEMENT[cat];
  slot.style.left = d.x + "%";
  slot.style.top = d.y + "%";
  slot.style.width = d.w + "%";
  slot.style.height = d.h + "%";
}

const MAX_ITEM_SIZE = 85;

// Every stage (the Builder's and each saved outfit's) is sized to this
// same width:height ratio so that identical placement percentages always
// look the same everywhere, regardless of how much other UI surrounds
// the stage in a given view. CSS aspect-ratio can't cleanly "contain" a
// box when both max-width and max-height might need to clamp it, so this
// is done in JS instead: whichever dimension of the available space is
// the tighter fit wins, and the stage is sized down to match it exactly.
const STAGE_RATIO = 6 / 7; // width / height

let lastBuilderStageSize = null;

const STAGE_SIDE_MARGIN = 16; // leaves room for the next outfit to peek in

function fitStageBox(slotEl) {
  const box = slotEl.firstElementChild;
  if (!box) return;
  const availW = slotEl.clientWidth - STAGE_SIDE_MARGIN * 2;
  const availH = slotEl.clientHeight;
  if (!availW || !availH) return;
  let w = availW, h = w / STAGE_RATIO;
  if (h > availH) { h = availH; w = h * STAGE_RATIO; }
  w = Math.round(w);
  h = Math.round(h);
  box.style.width = w + "px";
  box.style.height = h + "px";
  if (box.id === "mannequin-stage") lastBuilderStageSize = { width: w, height: h };
}

const stageResizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) fitStageBox(entry.target);
});

// Outfit cards don't compute their own box size - they copy Builder's
// current one exactly, so an outfit always looks pixel-identical to how
// it was built, never stretched or shrunk to fit whatever room the
// Outfits view happens to have around it. If Builder has never actually
// been shown yet (e.g. Outfits opened first), fall back to computing
// what it would be, since a hidden Builder view measures as 0x0.
function matchBuilderStageSize(stageEl) {
  if (!lastBuilderStageSize) {
    const availW = Math.min(window.innerWidth, 480) - 32 - STAGE_SIDE_MARGIN * 2;
    const w = Math.round(availW);
    lastBuilderStageSize = { width: w, height: Math.round(w / STAGE_RATIO) };
  }
  stageEl.style.width = lastBuilderStageSize.width + "px";
  stageEl.style.height = lastBuilderStageSize.height + "px";
}

// Only the Builder's stage uses fixed-ratio JS sizing; outfit cards
// stretch-fill via plain CSS, so they're deliberately left out here.
window.addEventListener("resize", () => {
  fitStageBox($("#mannequin-stage").parentElement);
});

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function angleOf(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }

// Single finger drags the item; a second finger pinches to resize (anchored
// on the item's own center) and twists to rotate at the same time.
function makeDraggable(slot, wrap, cat, placement) {
  const pointers = new Map();
  let dragStart = null;
  let pinchStart = null;

  function applyRect() {
    slot.style.left = placement.x + "%";
    slot.style.top = placement.y + "%";
    slot.style.width = placement.w + "%";
    slot.style.height = placement.h + "%";
  }

  slot.onpointerdown = (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { slot.setPointerCapture(e.pointerId); } catch (err) { /* ignore - not all browsers allow capturing every simultaneous touch */ }
    if (pointers.size === 1) {
      dragStart = { x: e.clientX, y: e.clientY, left: placement.x, top: placement.y };
      pinchStart = null;
    } else if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinchStart = {
        dist: dist(pts[0], pts[1]),
        angle: angleOf(pts[0], pts[1]),
        w: placement.w, h: placement.h, r: placement.r || 0,
        cx: placement.x + placement.w / 2, cy: placement.y + placement.h / 2
      };
      dragStart = null;
    }
  };

  slot.onpointermove = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = $("#mannequin-stage").getBoundingClientRect();

    if (pointers.size === 1 && dragStart) {
      const dxPct = (e.clientX - dragStart.x) / rect.width * 100;
      const dyPct = (e.clientY - dragStart.y) / rect.height * 100;
      placement.x = clamp(dragStart.left + dxPct, -5, 100 - placement.w + 5);
      placement.y = clamp(dragStart.top + dyPct, -5, 100 - placement.h + 5);
      applyRect();
    } else if (pointers.size === 2 && pinchStart) {
      const pts = [...pointers.values()];
      const scale = dist(pts[0], pts[1]) / pinchStart.dist;
      placement.w = clamp(pinchStart.w * scale, 15, MAX_ITEM_SIZE);
      placement.h = clamp(pinchStart.h * scale, 8, MAX_ITEM_SIZE);
      placement.x = pinchStart.cx - placement.w / 2;
      placement.y = pinchStart.cy - placement.h / 2;
      applyRect();
      const angle = angleOf(pts[0], pts[1]);
      placement.r = Math.round(pinchStart.r + (angle - pinchStart.angle) * 180 / Math.PI);
      wrap.style.transform = `rotate(${placement.r}deg)`;
    }
  };

  function release(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 1) {
      const [pos] = pointers.values();
      dragStart = { x: pos.x, y: pos.y, left: placement.x, top: placement.y };
      pinchStart = null;
    } else if (pointers.size === 0) {
      dragStart = null;
      pinchStart = null;
    }
  }
  slot.onpointerup = release;
  slot.onpointercancel = release;
}

// ---------- Picker modal ----------
function openPicker(cat) {
  pickerTargetCat = cat;
  $("#picker-title").textContent = `Choose a ${cat}`;
  const grid = $("#picker-grid");
  grid.innerHTML = "";
  const items = itemsCache.filter(i => i.category === cat);
  if (items.length === 0) {
    grid.innerHTML = `<div class="empty-grid-hint">No ${cat} items yet. Add some from the Clothes tab first.</div>`;
  } else {
    items.forEach(item => {
      grid.appendChild(buildItemCard(item, {
        noDelete: true,
        onClick: (it) => {
          const existing = builder.placements[cat];
          builder.placements[cat] = {
            itemId: it.id,
            x: existing ? existing.x : DEFAULT_PLACEMENT[cat].x,
            y: existing ? existing.y : DEFAULT_PLACEMENT[cat].y,
            w: existing ? existing.w : DEFAULT_PLACEMENT[cat].w,
            h: existing ? existing.h : DEFAULT_PLACEMENT[cat].h,
            r: existing ? (existing.r || 0) : 0
          };
          renderSlot(cat);
          refreshBackdrop();
          closePicker();
        }
      }));
    });
  }
  $("#picker-remove").style.display = builder.placements[cat] ? "block" : "none";
  $("#picker-modal").classList.add("open");
}
function closePicker() {
  $("#picker-modal").classList.remove("open");
  pickerTargetCat = null;
}
$("#picker-cancel").addEventListener("click", closePicker);
$("#picker-remove").addEventListener("click", () => {
  if (pickerTargetCat) {
    delete builder.placements[pickerTargetCat];
    renderSlot(pickerTargetCat);
    refreshBackdrop();
  }
  closePicker();
});

// ---------- Color palette picker (shoes / accessories) ----------
let colorTargetCat = null;
function openColorPicker(cat) {
  colorTargetCat = cat;
  const grid = $("#color-swatch-grid");
  grid.innerHTML = "";
  const current = builder.placements[cat] && builder.placements[cat].color;
  SHOE_COLORS.forEach(color => {
    const btn = document.createElement("button");
    btn.className = "color-swatch" + (color === current ? " selected" : "");
    btn.style.background = color;
    btn.addEventListener("click", () => {
      const existing = builder.placements[cat];
      builder.placements[cat] = {
        color,
        x: existing ? existing.x : DEFAULT_PLACEMENT[cat].x,
        y: existing ? existing.y : DEFAULT_PLACEMENT[cat].y,
        w: existing ? existing.w : DEFAULT_PLACEMENT[cat].w,
        h: existing ? existing.h : DEFAULT_PLACEMENT[cat].h,
        r: existing ? (existing.r || 0) : 0
      };
      renderSlot(cat);
      closeColorPicker();
    });
    grid.appendChild(btn);
  });
  $("#color-remove").style.display = builder.placements[cat] ? "block" : "none";
  $("#color-modal").classList.add("open");
}
function closeColorPicker() {
  $("#color-modal").classList.remove("open");
  colorTargetCat = null;
}
$("#color-cancel").addEventListener("click", closeColorPicker);
$("#color-remove").addEventListener("click", () => {
  if (colorTargetCat) {
    delete builder.placements[colorTargetCat];
    renderSlot(colorTargetCat);
  }
  closeColorPicker();
});

// ---------- Suggest Outfit (color/fashion matching) ----------
function parseRgb(str) {
  const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(str || "");
  return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
}
function rgbToHsl({ r, g, b }) {
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
function hueDist(a, b) { const d = Math.abs(a - b); return Math.min(d, 360 - d); }

// Buckets a color into a fashion "family" rather than just raw hue/lightness -
// useful for telling apart e.g. navy vs. black, or brown vs. beige, which
// plain hue/lightness math alone would blur together.
function classifyColor(hsl) {
  const { h, s, l } = hsl;
  if (l < 0.15) return "black";
  if (l > 0.92) return "white";
  if (s < 0.14) return "grey";
  if (h >= 195 && h <= 250 && l < 0.32) return "navy";
  if (h >= 15 && h <= 50 && l < 0.55 && s < 0.6) return "brown";
  if (h >= 25 && h <= 55 && l >= 0.55) return "beige";
  return "chromatic";
}
const NEUTRAL_FAMILIES = new Set(["black", "white", "grey", "navy", "brown", "beige"]);
// "Never mix black and brown" is a famously outdated rule - current stylist
// consensus (Elle, InStyle, etc.) is that it works fine, even fashionably,
// when it looks deliberate. No neutral-vs-neutral pairing is treated as a
// hard clash; CLASH_PAIRS is kept as a hook for anything real-world testing
// with an actual closet turns up.
const CLASH_PAIRS = [];

function isClashPair(famA, famB) {
  return CLASH_PAIRS.some(([x, y]) => (famA === x && famB === y) || (famA === y && famB === x));
}

// Scores how well two garment colors work together: negative means a real
// clash, 0 a lukewarm pairing, higher means a more confidently "good"
// pairing. Returns null if either color is unknown (never blocks a pairing
// just because we don't have color data for it).
function outfitColorScore(colorA, colorB) {
  const rgbA = parseRgb(colorA), rgbB = parseRgb(colorB);
  if (!rgbA || !rgbB) return null;
  const a = rgbToHsl(rgbA), b = rgbToHsl(rgbB);
  const famA = classifyColor(a), famB = classifyColor(b);

  if (isClashPair(famA, famB)) return -10;

  const aNeutral = NEUTRAL_FAMILIES.has(famA);
  const bNeutral = NEUTRAL_FAMILIES.has(famB);
  if (aNeutral && bNeutral) return famA === famB ? 3 : 2; // e.g. black+white, brown+beige
  if (aNeutral || bNeutral) return 2; // neutrals are versatile against any color

  const d = hueDist(a.h, b.h);
  if (d <= 40) return 3; // analogous
  if (d >= 140) return 3; // complementary
  if (d <= 65 || d >= 115) return 1; // a looser, still-workable pairing
  return -1; // hues fight each other without being complementary
}

let lastSuggestKey = null;
function suggestOutfit() {
  const tops = itemsCache.filter(i => i.category === "top");
  const bottoms = itemsCache.filter(i => i.category === "bottom");
  if (!tops.length || !bottoms.length) {
    alert("Add at least one top and one bottom to your closet first.");
    return;
  }
  const pairs = [];
  for (const t of tops) {
    for (const b of bottoms) {
      const score = outfitColorScore(t.color, b.color);
      pairs.push({ t, b, score: score === null ? 2 : score }); // no color data - treat as neutral/safe
    }
  }
  const bestScore = Math.max(...pairs.map(p => p.score));
  // Prefer the best-scoring pairings, but only fall down a tier if that
  // tier is too thin to give any real variety day to day.
  let pool = pairs.filter(p => p.score === bestScore);
  if (pool.length < 3) pool = pairs.filter(p => p.score >= bestScore - 1);
  let pick;
  for (let i = 0; i < 6; i++) {
    pick = pool[Math.floor(Math.random() * pool.length)];
    const key = pick.t.id + ":" + pick.b.id;
    if (key !== lastSuggestKey || pool.length === 1) { lastSuggestKey = key; break; }
  }
  builder.placements.top = { itemId: pick.t.id, ...DEFAULT_PLACEMENT.top };
  builder.placements.bottom = { itemId: pick.b.id, ...DEFAULT_PLACEMENT.bottom };
  renderAllSlots();
  refreshBackdrop();
}
$("#suggest-outfit").addEventListener("click", suggestOutfit);

// ---------- Save outfit ----------
$("#save-outfit").addEventListener("click", () => {
  if (Object.keys(builder.placements).length === 0) {
    alert("Add at least one item before saving.");
    return;
  }
  const editing = builder.editingId && outfitsCache.find(o => o.id === builder.editingId);
  $("#outfit-name-input").value = editing ? editing.name : "";
  $("#name-modal").classList.add("open");
});
$("#name-cancel").addEventListener("click", () => $("#name-modal").classList.remove("open"));
$("#name-save").addEventListener("click", async () => {
  const outfit = {
    id: builder.editingId || uid(),
    name: $("#outfit-name-input").value.trim() || "Untitled outfit",
    backdrop: getBackdrop(),
    placements: JSON.parse(JSON.stringify(builder.placements)),
    createdAt: Date.now()
  };
  await DB.addOutfit(outfit);
  builder.editingId = null;
  $("#name-modal").classList.remove("open");
  await loadOutfits();
  switchView("outfits");
});

// ---------- Outfits deck ----------
async function loadOutfits() {
  outfitsCache = await DB.getAllOutfits();
  outfitsCache.sort((a, b) => b.createdAt - a.createdAt);
  if (deckIndex >= outfitsCache.length) deckIndex = Math.max(0, outfitsCache.length - 1);
}

// Each hanger hook rises into the deck's own top padding, which is where
// the stationary .hanger-rod (a sibling outside the scroller) sits - so
// as a card scrolls horizontally, its hook visually slides along the rod
// like a real hanger, while the rod itself never moves.
let hangerGradId = 0;
function hangerHookSVG() {
  const id = "hanger-grad-" + (hangerGradId++);
  return `<svg viewBox="0 0 100 40" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#f5f6f8"/>
        <stop offset="55%" stop-color="#aab0ba"/>
        <stop offset="100%" stop-color="#767c86"/>
      </linearGradient>
    </defs>
    <path d="M50 12 C50 20 42 20 42 28 L58 28 C58 20 50 20 50 12" fill="none" stroke="url(#${id})" stroke-width="4" stroke-linecap="round"/>
    <path d="M6 40 L44 28 L56 28 L94 40" fill="none" stroke="url(#${id})" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function renderOutfitDeck() {
  const deck = $("#outfit-deck");
  const empty = $("#outfits-empty");
  const controls = $(".deck-controls");
  const actions = $(".deck-actions");
  deck.innerHTML = "";

  if (outfitsCache.length === 0) {
    empty.querySelector(".hanger-hook").innerHTML = hangerHookSVG();
    empty.style.display = "flex";
    deck.style.display = "none";
    controls.style.display = "none";
    actions.style.display = "none";
    return;
  }
  empty.style.display = "none";
  deck.style.display = "flex";
  controls.style.display = "flex";
  actions.style.display = "flex";

  outfitsCache.forEach((outfit, idx) => {
    const card = document.createElement("div");
    card.className = "outfit-card";
    const hook = document.createElement("div");
    hook.className = "hanger-hook";
    hook.innerHTML = hangerHookSVG();
    const stage = document.createElement("div");
    stage.className = "outfit-stage";
    stage.innerHTML = `<div class="mannequin-backdrop" style="background:${outfit.backdrop || getBackdrop()}"></div>`;

    Object.entries(outfit.placements).forEach(([cat, p]) => {
      const div = document.createElement("div");
      div.className = "placed-item";
      div.dataset.cat = cat;
      div.style.position = "absolute";
      div.style.left = p.x + "%";
      div.style.top = p.y + "%";
      div.style.width = p.w + "%";
      div.style.height = p.h + "%";
      div.style.zIndex = LAYER_ORDER[cat] || 0;
      div.style.transform = `rotate(${p.r || 0}deg)`;
      if (cat === "shoes") {
        div.innerHTML = `<div class="shoe-shape">${shoeShapeSVG(p.color)}</div>`;
      } else {
        const item = itemsCache.find(i => i.id === p.itemId);
        div.innerHTML = `<img src="${item ? item.image : ""}" alt="">`;
      }
      stage.appendChild(div);
    });

    const title = document.createElement("div");
    title.className = "outfit-title";
    title.textContent = outfit.name;

    const stageSlot = document.createElement("div");
    stageSlot.className = "stage-slot";
    stageSlot.appendChild(stage);

    card.appendChild(hook);
    card.appendChild(stageSlot);
    card.appendChild(title);
    deck.appendChild(card);
    matchBuilderStageSize(stage);
  });

  $("#deck-position").textContent = `${deckIndex + 1} / ${outfitsCache.length}`;
  scrollToCard(deckIndex, false);
  setupDeckScrollTracking();
}

// The rail is a native horizontally-scrolling, scroll-snapping strip (one
// hanger per outfit) - swiping is the primary way through it. This just
// keeps deckIndex (used by the position label and Edit/Delete) in sync
// with whichever hanger the user has scrolled to.
function setupDeckScrollTracking() {
  const deck = $("#outfit-deck");
  deck.onscroll = () => {
    const cards = $all("#outfit-deck .outfit-card");
    if (!cards.length) return;
    const center = deck.scrollLeft + deck.clientWidth / 2;
    let closestIdx = 0, closestDist = Infinity;
    cards.forEach((card, idx) => {
      const dist = Math.abs(card.offsetLeft + card.offsetWidth / 2 - center);
      if (dist < closestDist) { closestDist = dist; closestIdx = idx; }
    });
    if (closestIdx !== deckIndex) {
      deckIndex = closestIdx;
      $("#deck-position").textContent = `${deckIndex + 1} / ${outfitsCache.length}`;
    }
  };
}

function scrollToCard(idx, smooth) {
  const card = $all("#outfit-deck .outfit-card")[idx];
  if (!card) return;
  card.scrollIntoView({ behavior: smooth === false ? "auto" : "smooth", inline: "center", block: "nearest" });
}

function deckMove(delta) {
  if (outfitsCache.length === 0) return;
  deckIndex = clamp(deckIndex + delta, 0, outfitsCache.length - 1);
  $("#deck-position").textContent = `${deckIndex + 1} / ${outfitsCache.length}`;
  scrollToCard(deckIndex, true);
}
$("#deck-prev").addEventListener("click", () => deckMove(-1));
$("#deck-next").addEventListener("click", () => deckMove(1));

$("#deck-delete").addEventListener("click", async () => {
  const outfit = outfitsCache[deckIndex];
  if (!outfit) return;
  if (!confirm(`Delete "${outfit.name}"?`)) return;
  await DB.deleteOutfit(outfit.id);
  await loadOutfits();
  renderOutfitDeck();
});

$("#deck-edit").addEventListener("click", () => {
  const outfit = outfitsCache[deckIndex];
  if (!outfit) return;
  builder.placements = JSON.parse(JSON.stringify(outfit.placements));
  builder.editingId = outfit.id;
  renderAllSlots();
  refreshBackdrop();
  switchView("builder");
});

// ---------- Theme ----------
function applyTheme(theme) {
  if (theme === "light" || theme === "dark") {
    document.documentElement.setAttribute("data-theme", theme);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  const isDark = theme === "dark" || (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  $("#theme-toggle").textContent = isDark ? "☀️" : "🌙";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", isDark ? "#1e1c2c" : "#7c5cff");
}

function initTheme() {
  let stored = null;
  try { stored = localStorage.getItem("wardrobe-theme"); } catch (e) { /* private browsing, etc. */ }
  applyTheme(stored);
  $("#theme-toggle").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const isDark = current === "dark" || (!current && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const next = isDark ? "light" : "dark";
    try { localStorage.setItem("wardrobe-theme", next); } catch (e) { /* ignore */ }
    applyTheme(next);
  });
}

// ---------- Backdrop ----------
// "Auto" (the default) matches the backdrop to the current top/bottom
// item's own original photo background, so the cutout blends in. Picking
// an explicit color overrides that until "Auto" is chosen again.
function getAutoBackdropColor() {
  const topItem = builder.placements.top && itemsCache.find(i => i.id === builder.placements.top.itemId);
  const bottomItem = builder.placements.bottom && itemsCache.find(i => i.id === builder.placements.bottom.itemId);
  return (topItem && topItem.bgColor) || (bottomItem && bottomItem.bgColor) || "#ffffff";
}
function getBackdrop() {
  let stored = null;
  try { stored = localStorage.getItem("wardrobe-backdrop"); } catch (e) { /* ignore */ }
  const value = stored || "auto";
  return value === "auto" ? getAutoBackdropColor() : value;
}
function refreshBackdrop() {
  $("#mannequin-backdrop").style.background = getBackdrop();
}
function setBackdrop(value) {
  try { localStorage.setItem("wardrobe-backdrop", value); } catch (e) { /* ignore */ }
  refreshBackdrop();
  if (currentView() === "outfits") renderOutfitDeck();
}
function currentView() {
  const active = $(".view.active");
  return active ? active.id.replace("view-", "") : "";
}

function openBackdropPicker() {
  const grid = $("#backdrop-swatch-grid");
  grid.innerHTML = "";
  let stored = null;
  try { stored = localStorage.getItem("wardrobe-backdrop"); } catch (e) { /* ignore */ }
  const current = stored || "auto";
  BACKDROPS.forEach(bd => {
    const btn = document.createElement("button");
    btn.className = "backdrop-swatch" + (bd.value === current ? " selected" : "");
    btn.style.background = bd.value === "auto" ? getAutoBackdropColor() : bd.value;
    btn.innerHTML = `<span>${bd.name}</span>`;
    btn.addEventListener("click", () => {
      setBackdrop(bd.value);
      closeBackdropPicker();
    });
    grid.appendChild(btn);
  });
  $("#backdrop-modal").classList.add("open");
}
function closeBackdropPicker() {
  $("#backdrop-modal").classList.remove("open");
}
$("#backdrop-toggle").addEventListener("click", openBackdropPicker);
$("#backdrop-cancel").addEventListener("click", closeBackdropPicker);

// ---------- Service worker / update banner ----------
// Update detection is a plain version-number comparison against a fresh
// (cache-busted) fetch of sw.js, not the service worker install/waiting/
// activate lifecycle - that lifecycle left some phones with a permanently
// stuck "update available" banner (accumulated waiting workers, and an
// already-open tab that never drops its old controller reference). The
// service worker itself is still registered below purely for offline
// asset caching; it has nothing to do with showing this banner.
async function checkForUpdate() {
  try {
    const res = await fetch("sw.js?_=" + Date.now(), { cache: "no-store" });
    const text = await res.text();
    const m = /CACHE\s*=\s*"wardrobe-v(\d+)"/.exec(text);
    if (m && parseInt(m[1], 10) > APP_VERSION) {
      $("#update-banner").hidden = false;
    }
  } catch (e) { /* offline or blocked - just skip the check */ }
}

// Wipes the service worker registration and its Cache Storage (NOT
// IndexedDB, so closet items/outfits are untouched), then loads a
// cache-busted URL so the browser can't serve this exact document or its
// scripts from its own ordinary HTTP cache either.
async function hardRefresh() {
  $("#update-reload-btn").disabled = true;
  $("#update-reload-btn").textContent = "Updating...";
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) await reg.unregister();
    const keys = await caches.keys();
    for (const key of keys) await caches.delete(key);
  } catch (e) { /* ignore */ }
  location.href = location.pathname + "?_=" + Date.now();
}

function initServiceWorker() {
  $("#update-reload-btn").addEventListener("click", hardRefresh);
  checkForUpdate();
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {});
}

// ---------- Init ----------
async function handleResetParam() {
  if (new URLSearchParams(location.search).get("reset") !== "1") return;
  const existingItems = await DB.getAllItems();
  for (const it of existingItems) await DB.deleteItem(it.id);
  const existingOutfits = await DB.getAllOutfits();
  for (const o of existingOutfits) await DB.deleteOutfit(o.id);
  history.replaceState(null, "", location.pathname);
}

// Plays once per browser session (a full close-and-reopen gets the
// animation again; flipping back and forth between apps within the same
// session does not) so it stays a nice touch instead of getting old fast.
function playClosetIntro() {
  const intro = document.getElementById("closet-intro");
  if (!intro) return;
  let alreadyPlayed = false;
  try { alreadyPlayed = sessionStorage.getItem("wardrobe-intro-played") === "1"; } catch (e) { /* ignore */ }
  if (alreadyPlayed) { intro.remove(); return; }
  try { sessionStorage.setItem("wardrobe-intro-played", "1"); } catch (e) { /* ignore */ }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => intro.classList.add("opening"));
  });
  const cleanup = () => intro.remove();
  intro.addEventListener("transitionend", cleanup, { once: true });
  setTimeout(cleanup, 1000); // fallback in case transitionend doesn't fire
}

async function init() {
  playClosetIntro();
  initTheme();
  renderAllSlots();
  stageResizeObserver.observe($("#mannequin-stage").parentElement);
  await handleResetParam();
  await loadItems();
  refreshBackdrop();
  await loadOutfits();
  initServiceWorker();
}
init();
