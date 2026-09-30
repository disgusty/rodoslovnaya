# Third-party components

«Родословная» is distributed under the MIT license (see `LICENSE`). It bundles or builds on
the following components, each under its own license.

## Bundled into the application

| Component | License | Used for |
|---|---|---|
| [React](https://react.dev), React DOM | MIT | user interface |
| [Zustand](https://github.com/pmndrs/zustand) | MIT | application state |
| [Material Color Utilities](https://github.com/material-foundation/material-color-utilities) | Apache-2.0 | Material Design 3 color schemes |
| [Roboto](https://fonts.google.com/specimen/Roboto) via [@fontsource/roboto](https://fontsource.org) | Apache-2.0 (font), MIT (package) | interface font |
| [Material Symbols](https://fonts.google.com/icons) via [material-symbols](https://github.com/marella/material-symbols) | Apache-2.0 | icons |
| [Windows 95 UI Kit](https://github.com/themesberg/windows-95-ui-kit) by Themesberg | MIT | Windows 95 style: font and design (`src/assets/w95/`, license in `src/assets/w95/LICENSE`) |
| [html-to-image](https://github.com/bubkoo/html-to-image) | MIT | PNG export |
| [jsPDF](https://github.com/parallax/jsPDF) | MIT | PDF export |
| [JSZip](https://github.com/Stuk/jszip) | MIT (dual MIT / GPL-3.0, used under MIT) | ODT export |

## Runtime and build tools

| Component | License | Used for |
|---|---|---|
| [Electron](https://www.electronjs.org) (includes Chromium) | MIT (Chromium: BSD-3-Clause and others) | Windows application |
| [Capacitor](https://capacitorjs.com) and its App, Filesystem, Splash Screen plugins | MIT | Android application |
| [AndroidX](https://developer.android.com/jetpack/androidx) | Apache-2.0 | Android application |
| [electron-builder](https://www.electron.build) | MIT | Windows installer |
| [Vite](https://vite.dev), [TypeScript](https://www.typescriptlang.org) | MIT, Apache-2.0 | build |

The full license texts are included in the respective packages (`node_modules/<package>/LICENSE`)
and, for the Windows build, in `LICENSES.chromium.html` next to the executable.

## Test data

GEDCOM samples used for testing are not part of this repository; see `test-data/README.md`.
