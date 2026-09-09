const DEFAULT_PLACEMENT = {
  top: { x: 26, y: 17, w: 48, h: 29, r: 0 },
  bottom: { x: 27, y: 45, w: 46, h: 39, r: 0 },
  shoes: { x: 33, y: 79, w: 34, h: 11, r: 0 }
};
const CATEGORIES = ["top", "bottom", "shoes", "other"];
const LAYER_ORDER = { shoes: 1, bottom: 2, top: 3 };

// Where the mannequin's own shoulder line sits, in #mannequin-stage percent
// coordinates - derived from the mannequin SVG geometry (shoulder span is
// ~95/200 of the figure's width at y=100/560, rendered at 92% of stage
// height, centered). Used to auto-align a shirt photo's detected shoulders.
const MANNEQUIN_SHOULDER = { y: 20.43, centerX: 50, width: 26 };

function autoTopPlacement(item) {
  const s = item && item.shoulder;
  if (!s || !s.widthFrac) return { ...DEFAULT_PLACEMENT.top };
  const w = clamp(MANNEQUIN_SHOULDER.width / s.widthFrac, 20, 80);
  const h = clamp(w * 0.6 * s.imgAspect, 8, 85);
  const x = clamp(MANNEQUIN_SHOULDER.centerX - s.xFrac * w, -10, 100);
  const y = clamp(MANNEQUIN_SHOULDER.y - s.yFrac * h, -10, 100);
  return { x, y, w, h, r: 0 };
}

let mannequinInstanceCounter = 0;
function instantiateMannequin(gender) {
  const gradId = gender === "male" ? "maleBody" : "femaleBody";
  const uniqueId = `${gradId}-${mannequinInstanceCounter++}`;
  return MANNEQUINS[gender].split(gradId).join(uniqueId);
}

let itemsCache = [];
let outfitsCache = [];

const builder = {
  gender: "female",
  placements: {} // cat -> { itemId, x, y, w, h }
};

let pickerTargetCat = null;
let deckIndex = 0;

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
    items.forEach(item => grid.appendChild(buildItemCard(item)));
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
  try {
    const img = await loadImageFromSrc(pendingImage);
    const processed = await removeBackground(img);
    image = processed.dataUrl;
    shoulder = processed.shoulder;
  } catch (e) { /* fall back to the original photo if processing fails */ }
  const item = {
    id: uid(),
    image,
    shoulder,
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
$all(".gender-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    builder.gender = btn.dataset.gender;
    $all(".gender-btn").forEach(b => b.classList.toggle("active", b === btn));
    renderMannequinBase();
  });
});

$("#clear-builder").addEventListener("click", () => {
  if (!confirm("Clear the current outfit?")) return;
  builder.placements = {};
  renderAllSlots();
});

function renderMannequinBase() {
  $("#mannequin-svg-wrap").innerHTML = instantiateMannequin(builder.gender);
}

function renderAllSlots() {
  ["top", "bottom", "shoes"].forEach(renderSlot);
}

function renderSlot(cat) {
  const slot = $(`#slot-${cat}`);
  const placement = builder.placements[cat];
  slot.innerHTML = "";
  if (!placement) {
    slot.classList.add("empty");
    slot.classList.remove("filled");
    const label = document.createElement("span");
    label.className = "slot-label";
    label.textContent = `Tap to add ${cat}`;
    slot.appendChild(label);
    slot.onclick = () => openPicker(cat);
    slot.style.left = ""; slot.style.top = ""; slot.style.width = ""; slot.style.height = ""; slot.style.zIndex = "";
    resetSlotDefaultRect(slot, cat);
    return;
  }
  slot.classList.remove("empty");
  slot.classList.add("filled");
  slot.onclick = null;

  const item = itemsCache.find(i => i.id === placement.itemId);
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
  wrap.innerHTML = `
    <button class="swap-handle">↻</button>
    <img src="${item ? item.image : ""}" alt="">
    ${rotatable ? '<div class="rotate-handle">⟳</div>' : ""}
    <div class="resize-handle"></div>
  `;
  slot.appendChild(wrap);

  wrap.querySelector(".swap-handle").addEventListener("click", (e) => {
    e.stopPropagation();
    openPicker(cat);
  });

  makeDraggable(slot, wrap, cat, placement, rotatable);
  makeResizable(wrap.querySelector(".resize-handle"), slot, cat, placement);
  if (rotatable) makeRotatable(wrap.querySelector(".rotate-handle"), wrap, placement);
}

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

// Single finger drags the item; a second finger turns the gesture into a
// pinch-to-resize + twist-to-rotate, like placing a sticker in a photo app.
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
    if (e.target.closest(".resize-handle") || e.target.closest(".rotate-handle") || e.target.closest(".swap-handle")) return;
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
      placement.w = clamp(pinchStart.w * scale, 10, MAX_ITEM_SIZE);
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

function makeResizable(handle, slot, cat, placement) {
  let resizing = false, startX, startY, startW, startH;
  handle.onpointerdown = (e) => {
    e.stopPropagation();
    resizing = true;
    handle.setPointerCapture(e.pointerId);
    startX = e.clientX; startY = e.clientY;
    startW = placement.w; startH = placement.h;
  };
  handle.onpointermove = (e) => {
    if (!resizing) return;
    const rect = $("#mannequin-stage").getBoundingClientRect();
    const dxPct = (e.clientX - startX) / rect.width * 100;
    const dyPct = (e.clientY - startY) / rect.height * 100;
    placement.w = clamp(startW + dxPct, 10, MAX_ITEM_SIZE);
    placement.h = clamp(startH + dyPct, 8, MAX_ITEM_SIZE);
    slot.style.width = placement.w + "%";
    slot.style.height = placement.h + "%";
  };
  handle.onpointerup = (e) => { e.stopPropagation(); resizing = false; };
  handle.onpointercancel = () => { resizing = false; };
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
          if (cat === "top") {
            // Shirts are auto-aligned to the mannequin's shoulders rather
            // than left at a manual position, so re-align fresh each time.
            builder.placements[cat] = { itemId: it.id, ...autoTopPlacement(it) };
          } else {
            const existing = builder.placements[cat];
            builder.placements[cat] = {
              itemId: it.id,
              x: existing ? existing.x : DEFAULT_PLACEMENT[cat].x,
              y: existing ? existing.y : DEFAULT_PLACEMENT[cat].y,
              w: existing ? existing.w : DEFAULT_PLACEMENT[cat].w,
              h: existing ? existing.h : DEFAULT_PLACEMENT[cat].h,
              r: existing ? (existing.r || 0) : 0
            };
          }
          renderSlot(cat);
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
  }
  closePicker();
});

// ---------- Save outfit ----------
$("#save-outfit").addEventListener("click", () => {
  if (Object.keys(builder.placements).length === 0) {
    alert("Add at least one item before saving.");
    return;
  }
  $("#outfit-name-input").value = "";
  $("#name-modal").classList.add("open");
});
$("#name-cancel").addEventListener("click", () => $("#name-modal").classList.remove("open"));
$("#name-save").addEventListener("click", async () => {
  const outfit = {
    id: builder.editingId || uid(),
    name: $("#outfit-name-input").value.trim() || "Untitled outfit",
    gender: builder.gender,
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
    stage.innerHTML = `<div class="mannequin-bg-wrap" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">${instantiateMannequin(outfit.gender)}</div>`;
    stage.querySelector("svg").style.height = "92%";
    stage.querySelector("svg").style.width = "auto";

    Object.entries(outfit.placements).forEach(([cat, p]) => {
      const item = itemsCache.find(i => i.id === p.itemId);
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
      div.innerHTML = `<img src="${item ? item.image : ""}" alt="">`;
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
  builder.gender = outfit.gender;
  builder.placements = JSON.parse(JSON.stringify(outfit.placements));
  builder.editingId = outfit.id;
  $all(".gender-btn").forEach(b => b.classList.toggle("active", b.dataset.gender === outfit.gender));
  renderMannequinBase();
  renderAllSlots();
  switchView("builder");
});

// ---------- Init ----------
async function seedIfEmpty() {
  if (new URLSearchParams(location.search).get("reset") === "1") {
    const existingItems = await DB.getAllItems();
    for (const it of existingItems) await DB.deleteItem(it.id);
    const existingOutfits = await DB.getAllOutfits();
    for (const o of existingOutfits) await DB.deleteOutfit(o.id);
    history.replaceState(null, "", location.pathname);
  }
  const existing = await DB.getAllItems();
  if (existing.length > 0) return;
  for (const it of SEED_ITEMS) {
    let image = it.image;
    let shoulder = null;
    try {
      const img = await loadImageFromSrc(it.image);
      const processed = await removeBackground(img);
      image = processed.dataUrl;
      shoulder = processed.shoulder;
    } catch (e) { /* fall back to the original photo if processing fails */ }
    await DB.addItem({ id: uid(), image, shoulder, category: it.category, name: it.name, createdAt: Date.now() });
  }
}

async function init() {
  renderMannequinBase();
  renderAllSlots();
  await seedIfEmpty();
  await loadItems();
  await loadOutfits();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
init();
