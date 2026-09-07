const path = require("path");
const rules = require("./webpack.rules");
const plugins = require("./webpack.plugins");

// matrix-js-sdk uses a browser WASM loader whose module-relative URL is not
// stable inside Electron Forge preloads. Resolve its generated bindings here
// and embed the WASM binary so development and packaged builds use one path.
const matrixCryptoPackageRoot = path.dirname(
  require.resolve("@matrix-org/matrix-sdk-crypto-wasm")
);
const matrixCryptoBindings = path.join(
  matrixCryptoPackageRoot,
  "pkg",
  "matrix_sdk_crypto_wasm_bg.js"
);
const matrixCryptoBinary = path.join(
  matrixCryptoPackageRoot,
  "pkg",
  "matrix_sdk_crypto_wasm_bg.wasm"
);
const matrixCryptoShim = path.resolve(
  __dirname,
  "src",
  "audioCapture",
  "matrixCryptoWasmShim.js"
);

rules.push({
  test: /\.css$/,
  use: [{ loader: "style-loader" }, { loader: "css-loader" }],
});

rules.push({
  test: /\.worklet\.js$/,
  use: { loader: "worklet-loader", options: { inline: true } },
});

rules.push({
  test: /\.worker\.js$/,
  use: { loader: "worker-loader", options: { inline: "fallback" } },
});

rules.push({
  test: /matrix_sdk_crypto_wasm_bg\.wasm$/,
  type: "asset/inline",
  generator: {
    dataUrl: (content) =>
      `data:application/wasm;base64,${content.toString("base64")}`,
  },
});

module.exports = {
  // MatrixClient.initRustCrypto() uses import(). Electron preload entrypoints
  // cannot fetch a secondary Webpack chunk, so keep async modules in the
  // owning bundle. Kenku itself currently has no renderer dynamic imports.
  output: {
    asyncChunks: false,
  },
  module: {
    rules,
  },
  plugins: plugins,
  resolve: {
    alias: {
      "@matrix-org/matrix-sdk-crypto-wasm$": matrixCryptoShim,
      "kenku-matrix-crypto-wasm-bindings$": matrixCryptoBindings,
      "kenku-matrix-crypto-wasm-binary$": matrixCryptoBinary,
    },
    extensions: [".js", ".ts", ".jsx", ".tsx", ".css"],
  },
};
