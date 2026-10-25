// Fails during collection, so Vitest never runs this file's afterAll hooks.
// The next file in the same worker (isolate: false) must still get working transactions.
throw new Error("intentional collection error");
