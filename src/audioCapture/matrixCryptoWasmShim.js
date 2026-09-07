// SPDX-License-Identifier: Apache-2.0
//
// Electron/Webpack adapter for @matrix-org/matrix-sdk-crypto-wasm.
//
// The upstream browser entrypoint resolves the .wasm file relative to its own
// module URL. Electron Forge emits Kenku's preload as a Webpack bundle, where
// that URL is not stable between development and packaged builds. The renderer
// Webpack config aliases the generated bindings and embeds the WASM binary as a
// data URL, making crypto initialization self-contained.

import * as bindings from "kenku-matrix-crypto-wasm-bindings";
import wasmDataUrl from "kenku-matrix-crypto-wasm-binary";

let initPromise;
let initialized = false;

bindings.__wbg_set_wasm(
  new Proxy(
    {},
    {
      get() {
        throw new Error(
          "Matrix crypto WASM was used before initAsync() completed",
        );
      },
    },
  ),
);

async function instantiate(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load Matrix crypto WASM (${response.status})`);
  }

  const bytes = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {
    "./matrix_sdk_crypto_wasm_bg.js": bindings,
  });

  bindings.__wbg_set_wasm(instance.exports);
  instance.exports.__wbindgen_start();
  initialized = true;
}

export async function initAsync(url = wasmDataUrl) {
  if (initialized) return;

  if (!initPromise) {
    initPromise = instantiate(url).catch((error) => {
      initPromise = undefined;
      throw error;
    });
  }

  await initPromise;
}

export * from "kenku-matrix-crypto-wasm-bindings";
