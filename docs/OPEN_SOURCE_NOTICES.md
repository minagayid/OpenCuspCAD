# Open-source dependency notices

procad's application code is an original local prototype. The production bundle uses the following direct npm dependencies (versions resolved in `app/package-lock.json`):

| Package | Resolved version | Package license | Use |
|---|---:|---|---|
| Three.js | 0.186.0 | MIT | 3D scene, mesh loading and display |
| three-mesh-bvh | 0.9.15 | MIT | closest-point queries for unsigned preview samples |
| manifold-3d | 3.5.3 | Apache-2.0 | solid mesh Boolean operation; includes WASM runtime |
| Express | 5.2.1 | MIT | local HTTP service |
| Multer | 2.4.0 | MIT | local STL/PLY upload handling |
| Vite | 7.3.6 | MIT | frontend build and development server |
| concurrently | 9.2.4 | MIT | local development process runner |
| Electron | 39.8.10 | MIT | portable desktop wrapper |
| electron-builder | 26.15.3 | MIT | Windows portable packaging |

`app/server-loaders/` contains the Three.js STLLoader and PLYLoader modules copied from the installed Three.js package so the packaged local service can validate meshes after electron-builder prunes optional `examples` files. They remain under Three.js's MIT license; see `app/server-loaders/THREE-LICENSE.txt`.

The corresponding license files are supplied by the installed packages under `app/node_modules/<package>/LICENSE` (Vite's file is `LICENSE.md`) and are restored by `npm ci`. This inventory is a direct-dependency notice, not a full transitive-license audit. Before redistributing an installer or bundling additional datasets/libraries, generate and review a complete dependency/license inventory for that release.

The public repository includes only the original synthetic fixture in `data/demo/`. The local BlueSkyPlan-linked practice scans in `data/BlueSky_Crown_Practice/` are training inputs, **not** procad source code or an open-source dataset. Their further redistribution rights were not established, so the directory is excluded by `.gitignore` and is not part of the public repository.
