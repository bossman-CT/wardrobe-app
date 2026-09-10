// Minimal IndexedDB wrapper for clothing items and saved outfits.
const DB_NAME = "wardrobe-db";
const DB_VERSION = 2;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("items")) {
        db.createObjectStore("items", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("outfits")) {
        db.createObjectStore("outfits", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("profiles")) {
        db.createObjectStore("profiles", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDb().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const DB = {
  async addItem(item) {
    const store = await tx("items", "readwrite");
    await reqToPromise(store.put(item));
    return item;
  },
  async deleteItem(id) {
    const store = await tx("items", "readwrite");
    await reqToPromise(store.delete(id));
  },
  async getAllItems() {
    const store = await tx("items", "readonly");
    return reqToPromise(store.getAll());
  },
  async addOutfit(outfit) {
    const store = await tx("outfits", "readwrite");
    await reqToPromise(store.put(outfit));
    return outfit;
  },
  async deleteOutfit(id) {
    const store = await tx("outfits", "readwrite");
    await reqToPromise(store.delete(id));
  },
  async getAllOutfits() {
    const store = await tx("outfits", "readonly");
    return reqToPromise(store.getAll());
  },
  async addProfile(profile) {
    const store = await tx("profiles", "readwrite");
    await reqToPromise(store.put(profile));
    return profile;
  },
  async deleteProfile(id) {
    const store = await tx("profiles", "readwrite");
    await reqToPromise(store.delete(id));
  },
  async getAllProfiles() {
    const store = await tx("profiles", "readonly");
    return reqToPromise(store.getAll());
  }
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
