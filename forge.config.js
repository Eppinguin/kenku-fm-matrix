const path = require("path");

const config = {
  packagerConfig: {
    executableName: "kenku-fm-matrix",
    out: "./out",
    icon: "./src/assets/icon",
    appBundleId: "io.github.eppinguin.kenku-fm-matrix",
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "kenku_fm_matrix",
        setupIcon: path.join(__dirname, "src", "assets", "setup.ico"),
        loadingGif: path.join(__dirname, "src", "assets", "loading.gif"),
      },
    },
    {
      name: "@electron-forge/maker-deb",
      config: {
        name: "kenku-fm-matrix",
        productName: "Kenku FM Matrix",
        homepage: "https://github.com/Eppinguin/kenku-fm-matrix",
        icon: path.join(__dirname, "src", "assets", "icons", "256x256.png"),
      },
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["linux", "darwin"],
    },
    {
      name: "@electron-forge/maker-rpm",
      config: {
        name: "kenku-fm-matrix",
        productName: "Kenku FM Matrix",
        homepage: "https://github.com/Eppinguin/kenku-fm-matrix",
        icon: path.join(__dirname, "src", "assets", "icons", "256x256.png"),
      },
    },
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "Eppinguin",
          name: "kenku-fm-matrix",
        },
        prerelease: false,
        draft: false,
      },
    },
  ],
  plugins: [
    {
      name: "@electron-forge/plugin-webpack",
      config: {
        mainConfig: "./webpack.main.config.js",
        renderer: {
          config: "./webpack.renderer.config.js",
          entryPoints: [
            {
              html: "./src/index.html",
              js: "./src/renderer.ts",
              name: "main_window",
              preload: {
                js: "./src/preload.ts",
              },
            },
            {
              html: "./src/player/index.html",
              js: "./src/player/renderer.ts",
              name: "player_window",
              preload: {
                js: "./src/player/preload.ts",
              },
            },
            {
              html: "./src/audioCapture/index.html",
              js: "./src/audioCapture/renderer.ts",
              name: "audio_capture_window",
              preload: {
                js: "./src/audioCapture/preload.ts",
              },
            },
          ],
        },
        devContentSecurityPolicy: "",
      },
    },
    {
      name: "@timfish/forge-externals-plugin",
      config: {
        externals: ["opusscript", "prism-media", "@snazzah/davey", "zlib-sync"],
        includeDeps: true,
      },
    },
  ],
};

module.exports = config;
