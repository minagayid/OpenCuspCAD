# Current limits and release boundary

This release is a local engineering demonstrator. It is useful for inspecting scan provenance, testing mesh integrity, and exercising a single-crown Boolean preview with a preparation-derived cavity. It is not a validated dental CAD/CAM system and it is not ready-milling software.

The importer accepts STL, PLY, OBJ, and OFF surface meshes plus XYZ, PTS, CSV, and ASCII PCD point clouds. Point clouds are view-only and registration-preparation inputs; they are deliberately blocked from Boolean preparation generation until a separate validated surface-reconstruction and QA workflow exists.

The public repository's demo uses synthetic watertight blocks rather than dental scans. A local BlueSkyPlan-linked practice set can be configured for private engineering work, but it is not redistributed by this repository and its reference crown is not registered to its die. The UI labels any reference placement as unverified and falls back to a closed procedural outer shell when the reference cannot be used as a Boolean solid. The fallback has no tooth library, patient-specific anatomy, traced margin, or contact design.

The preparation cavity is a geometry preview. The displayed relief value is an input to the preview, not a measured cement gap. The app does not calculate a signed fit map, margin adaptation, wall-thickness map, insertion path, undercut blockout, validated bite registration, dynamic articulation, connector or pontic design, implant interface, material shrinkage, machine stock, bur compensation, nesting, or toolpaths.

The review STL and the local STL/OBJ CAM handoff package are intentionally gated and carry a warning. A qualified dental professional and authorized CAM operator must validate scan identity, registration, margin, intaglio, contacts, occlusion, material, units, blank, tools, simulation, and machine settings in a validated workflow before any clinical or manufacturing use. The app never contacts a CAM machine or generates a toolpath.

The attached build prompt was treated as an engineering reference for an original system. OpenCusp does not include Exocad or BlueSky proprietary code, protected tooth libraries, license keys, or proprietary CAM components.
