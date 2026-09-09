const DEFAULT_PLACEMENT = {
  top: { x: 26, y: 17, w: 48, h: 29 },
  bottom: { x: 27, y: 45, w: 46, h: 39 },
  shoes: { x: 33, y: 79, w: 34, h: 11 }
};
const CATEGORIES = ["top", "bottom", "shoes", "other"];

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
  try {
    const img = await loadImageFromSrc(pendingImage);
    image = await removeBackground(img);
  } catch (e) { /* fall back to the original photo if processing fails */ }
  const item = {
    id: uid(),
    image,
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
    slot.style.left = ""; slot.style.top = ""; slot.style.width = ""; slot.style.height = "";
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

  const wrap = document.createElement("div");
  wrap.className = "placed-item";
  wrap.dataset.cat = cat;
  wrap.innerHTML = `
    <button class="swap-handle">↻</button>
    <img src="${item ? item.image : ""}" alt="">
    <div class="resize-handle"></div>
  `;
  slot.appendChild(wrap);

  wrap.querySelector(".swap-handle").addEventListener("click", (e) => {
    e.stopPropagation();
    openPicker(cat);
  });

  makeDraggable(slot, cat, placement);
  makeResizable(wrap.querySelector(".resize-handle"), slot, cat, placement);
}

function resetSlotDefaultRect(slot, cat) {
  const d = DEFAULT_PLACEMENT[cat];
  slot.style.left = d.x + "%";
  slot.style.top = d.y + "%";
  slot.style.width = d.w + "%";
  slot.style.height = d.h + "%";
}

function makeDraggable(slot, cat, placement) {
  let dragging = false, startX, startY, startLeft, startTop;
  slot.onpointerdown = (e) => {
    if (e.target.closest(".resize-handle") || e.target.closest(".swap-handle")) return;
    dragging = true;
    slot.setPointerCapture(e.pointerId);
    startX = e.clientX; startY = e.clientY;
    startLeft = placement.x; startTop = placement.y;
  };
  slot.onpointermove = (e) => {
    if (!dragging) return;
    const rect = $("#mannequin-stage").getBoundingClientRect();
    const dxPct = (e.clientX - startX) / rect.width * 100;
    const dyPct = (e.clientY - startY) / rect.height * 100;
    placement.x = clamp(startLeft + dxPct, -5, 100 - placement.w + 5);
    placement.y = clamp(startTop + dyPct, -5, 100 - placement.h + 5);
    slot.style.left = placement.x + "%";
    slot.style.top = placement.y + "%";
  };
  slot.onpointerup = () => { dragging = false; };
  slot.onpointercancel = () => { dragging = false; };
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
    placement.w = clamp(startW + dxPct, 10, 100);
    placement.h = clamp(startH + dyPct, 8, 100);
    slot.style.width = placement.w + "%";
    slot.style.height = placement.h + "%";
  };
  handle.onpointerup = (e) => { e.stopPropagation(); resizing = false; };
  handle.onpointercancel = () => { resizing = false; };
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
            h: existing ? existing.h : DEFAULT_PLACEMENT[cat].h
          };
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
    try {
      const img = await loadImageFromSrc(it.image);
      image = await removeBackground(img);
    } catch (e) { /* fall back to the original photo if processing fails */ }
    await DB.addItem({ id: uid(), image, category: it.category, name: it.name, createdAt: Date.now() });
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
