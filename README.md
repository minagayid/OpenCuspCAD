# procad Dental CAD

procad is a local-first dental-geometry demonstrator. It imports common
surface meshes and point clouds, displays them in 3D, creates a generic
single-crown Boolean preview from supported surface inputs, records scan
provenance, and saves review-only geometry locally.

The public repository ships an original synthetic box fixture so a fresh clone
has a deterministic demo without patient data or an unlicensed scan dataset.
It is not a dental scan, anatomical tooth library, clinical system, or CAM
toolpath generator.

## Run from source

Requires Node.js 20+ and npm.

```powershell
cd app
npm ci
npm run dev
```

Open the Vite address printed in the terminal, normally
`http://127.0.0.1:5173`.

For the production server:

```powershell
cd app
npm run build
npm start
```

Then open `http://127.0.0.1:4179`.

On Windows, `npm run desktop:pack` builds a portable Electron package into
`exports/desktop/`. Build output is intentionally ignored by GitHub; release
artifacts can be produced from a tagged checkout.

## Verify

```powershell
cd app
npm test
npm run build
```

GitHub Actions runs the same test and build checks for pushes and pull requests.

## What the demo does

- imports STL, PLY, OBJ, and OFF surface meshes plus XYZ, PTS, CSV, and ASCII PCD point clouds with declared source units;
- checks mesh topology and non-finite coordinates;
- previews a single crown shell with a preparation-derived cavity;
- stores local case manifests, SHA-256 provenance, and generated review STL;
- keeps review export behind an acknowledgement and gates the local CAM handoff behind a fingerprinted approval record and operator-entered CAM profile;
- provides local Markdown skills for input data, professional dental design, anatomy references, and CAM approval.
- includes a restoration-routing library for crowns, copings/cutbacks, inlays/onlays, veneers, bridges, implant crowns, and custom abutments; unsupported geometry remains explicitly brief-only.

The workflow is intentionally bounded. A closed mesh does not prove margin fit,
wall thickness, occlusion, material suitability, or millability.

Point clouds are view-only until they are separately reconstructed and quality-
checked. The CAM handoff creates a local STL/OBJ plus manifest for operator
import and simulation; it does not contact a machine or generate a toolpath.

## Data and privacy

The app binds to loopback by default. Do not put identifiable patient data into
this prototype. Uploaded meshes and saved cases stay under local runtime data
directories and are ignored by Git.

The local `BlueSky_Crown_Practice` dataset used during private engineering work
is intentionally excluded from the public repository because redistribution
rights were not established. See [docs/OPEN_SOURCE_NOTICES.md](docs/OPEN_SOURCE_NOTICES.md).

## Scope and limitations

procad is not a medical device, clinical recommendation system, validated
dental CAD/CAM product, milling engine, or replacement for professional
judgment. It does not provide a traced 3D margin, measured intaglio fit,
validated bite registration, contact map, bridge/implant workflows, material
profiles, machine profiles, nesting, or toolpaths.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
[docs/LIMITATIONS.md](docs/LIMITATIONS.md), and
[docs/OPEN_SOURCE_NOTICES.md](docs/OPEN_SOURCE_NOTICES.md) for the design
boundary and dependency notes.

## License

The source code and original synthetic fixture are available under the
[MIT License](LICENSE). Third-party dependencies retain their own licenses.
