// This Vitest install's jsdom environment doesn't expose a working
// `localStorage` global (verified: `window.localStorage` is undefined here,
// likely a jsdom/Node-version interaction, not a code bug). logic.js is
// tested against the real localStorage API contract via this minimal
// polyfill rather than depending on jsdom's implementation to be present.
class MemoryStorage {
  #store = new Map();

  getItem(key) {
    return this.#store.has(key) ? this.#store.get(key) : null;
  }

  setItem(key, value) {
    this.#store.set(key, String(value));
  }

  removeItem(key) {
    this.#store.delete(key);
  }

  clear() {
    this.#store.clear();
  }
}

if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage) {
  globalThis.localStorage = new MemoryStorage();
}
