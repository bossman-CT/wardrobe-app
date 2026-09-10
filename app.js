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

  const rotatable = cat !== "top";
  const wrap = document.createElement("div");
  wrap.className = "placed-item";
  wrap.dataset.cat = cat;
  wrap.style.transform = rotatable ? `rotate(${placement.r || 0}deg)` : "";

  let content;
  if (cat === "shoes") {
    content = `<div class="shoe-shape">${shoeShapeSVG(placement.color)}</div>`;
  } else {
    const item = itemsCache.find(i => i.id === placement.itemId);
    content = `<img src="${item ? item.image : ""}" alt="">`;
  }
  wrap.innerHTML = `
    ${content}
    ${rotatable ? '<div class="rotate-handle">⟳</div>' : ""}
  `;
  slot.appendChild(wrap);

  makeDraggable(slot, wrap, cat, placement, rotatable);
  if (rotatable) makeRotatable(wrap.querySelector(".rotate-handle"), wrap, placement);
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

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function angleOf(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }

// Single finger drags the item; a second finger pinches to resize (anchored
// on the item's own center) and, on a rotatable item, twists to rotate too.
function makeDraggable(slot, wrap, cat, placement, rotatable) {
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
    if (e.target.closest(".rotate-handle")) return;
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
      if (rotatable) {
        const angle = angleOf(pts[0], pts[1]);
        placement.r = Math.round(pinchStart.r + (angle - pinchStart.angle) * 180 / Math.PI);
        wrap.style.transform = `rotate(${placement.r}deg)`;
      }
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

function makeRotatable(handle, wrap, placement) {
  let rotating = false, centerX, centerY, startAngle, startR;
  handle.onpointerdown = (e) => {
    e.stopPropagation();
    rotating = true;
    handle.setPointerCapture(e.pointerId);
    const rect = wrap.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
    startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    startR = placement.r || 0;
  };
  handle.onpointermove = (e) => {
    if (!rotating) return;
    const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    const deltaDeg = (angle - startAngle) * 180 / Math.PI;
    placement.r = Math.round(startR + deltaDeg);
    wrap.style.transform = `rotate(${placement.r}deg)`;
  };
  handle.onpointerup = (e) => { e.stopPropagation(); rotating = false; };
  handle.onpointercancel = () => { rotating = false; };
}

// ---------- Picker modal ----------
function openPicker(cat) {
  pickerTargetCat = cat;
  $("#picker-title").textContent = `Choose a ${cat}`;
  const grid = $("#picker-grid");
  grid.innerHTML = "";
  const items = itemsCache.filter(i => i.category === cat);
  if (items.length === 0) {
    grid.innerHTML = `<div class="empty-grid-hint">No ${cat} items yet. Add some from the Closet tab first.</div>`;
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

// ---------- Random outfit (color matching) ----------
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
function isNeutral(hsl) { return hsl.s < 0.18 || hsl.l < 0.14 || hsl.l > 0.92; }
function hueDist(a, b) { const d = Math.abs(a - b); return Math.min(d, 360 - d); }
function colorsWork(colorA, colorB) {
  const rgbA = parseRgb(colorA), rgbB = parseRgb(colorB);
  if (!rgbA || !rgbB) return true; // no data - don't block the pairing
  const a = rgbToHsl(rgbA), b = rgbToHsl(rgbB);
  if (isNeutral(a) || isNeutral(b)) return true; // neutrals pair with anything
  const d = hueDist(a.h, b.h);
  return d <= 40 || d >= 140; // analogous or complementary-ish
}

let lastShuffleKey = null;
function shuffleOutfit() {
  const tops = itemsCache.filter(i => i.category === "top");
  const bottoms = itemsCache.filter(i => i.category === "bottom");
  if (!tops.length || !bottoms.length) {
    alert("Add at least one top and one bottom to your closet first.");
    return;
  }
  const pairs = [];
  for (const t of tops) {
    for (const b of bottoms) pairs.push({ t, b, good: colorsWork(t.color, b.color) });
  }
  const goodPairs = pairs.filter(p => p.good);
  const pool = goodPairs.length ? goodPairs : pairs;
  let pick;
  for (let i = 0; i < 6; i++) {
    pick = pool[Math.floor(Math.random() * pool.length)];
    const key = pick.t.id + ":" + pick.b.id;
    if (key !== lastShuffleKey || pool.length === 1) { lastShuffleKey = key; break; }
  }
  builder.placements.top = { itemId: pick.t.id, ...DEFAULT_PLACEMENT.top };
  builder.placements.bottom = { itemId: pick.b.id, ...DEFAULT_PLACEMENT.bottom };
  renderAllSlots();
  refreshBackdrop();
}
$("#shuffle-outfit").addEventListener("click", shuffleOutfit);

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

function renderOutfitDeck() {
  const deck = $("#outfit-deck");
  const empty = $("#outfits-empty");
  const controls = $(".deck-controls");
  const actions = $(".deck-actions");
  deck.innerHTML = "";

  if (outfitsCache.length === 0) {
    empty.style.display = "block";
    deck.style.display = "none";
    controls.style.display = "none";
    actions.style.display = "none";
    return;
  }
  empty.style.display = "none";
  deck.style.display = "block";
  controls.style.display = "flex";
  actions.style.display = "flex";

  outfitsCache.forEach((outfit, idx) => {
    const card = document.createElement("div");
    card.className = "outfit-card" + (idx === deckIndex ? " current" : "");
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
      div.style.transform = cat === "top" ? "" : `rotate(${p.r || 0}deg)`;
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

    card.appendChild(stage);
    card.appendChild(title);
    deck.appendChild(card);
  });

  $("#deck-position").textContent = `${deckIndex + 1} / ${outfitsCache.length}`;
  setupDeckSwipe();
}

function setupDeckSwipe() {
  const deck = $("#outfit-deck");
  let startX = null;
  deck.onpointerdown = (e) => { startX = e.clientX; };
  deck.onpointerup = (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (dx > 60) deckMove(-1);
    else if (dx < -60) deckMove(1);
  };
}

function deckMove(delta) {
  if (outfitsCache.length === 0) return;
  deckIndex = clamp(deckIndex + delta, 0, outfitsCache.length - 1);
  renderOutfitDeck();
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
// One-time cleanup for phones that got stuck showing the update banner
// from before update checks were forced to bypass the cache. Wipes the
// old service worker registration and its Cache Storage (NOT IndexedDB,
// so closet items/outfits are untouched) and re-registers fresh.
async function resetStuckServiceWorker() {
  const FLAG = "wardrobe-sw-reset-1";
  let alreadyReset = false;
  try { alreadyReset = localStorage.getItem(FLAG) === "1"; } catch (e) { /* ignore */ }
  if (alreadyReset || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) await reg.unregister();
    const keys = await caches.keys();
    for (const key of keys) await caches.delete(key);
  } catch (e) { /* ignore */ }
  try { localStorage.setItem(FLAG, "1"); } catch (e) { /* ignore */ }
}

function initServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
    reg.addEventListener("updatefound", () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          $("#update-banner").hidden = false;
        }
      });
    });
  }).catch(() => {});

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  // Deterministic refresh: rather than relying on postMessage/skipWaiting
  // handoff (which no-ops if reg.waiting is empty by the time this fires),
  // just unregister everything, drop the cache, and hard-reload. IndexedDB
  // (closet items/outfits) lives in separate storage and isn't touched.
  $("#update-reload-btn").addEventListener("click", async () => {
    $("#update-reload-btn").disabled = true;
    $("#update-reload-btn").textContent = "Updating...";
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) await reg.unregister();
      const keys = await caches.keys();
      for (const key of keys) await caches.delete(key);
    } catch (e) { /* ignore */ }
    location.reload();
  });
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

async function init() {
  initTheme();
  renderAllSlots();
  await handleResetParam();
  await loadItems();
  refreshBackdrop();
  await loadOutfits();
  await resetStuckServiceWorker();
  initServiceWorker();
}
init();
