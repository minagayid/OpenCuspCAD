# Current limits and release boundary

This release is a local engineering demonstrator. It is useful for inspecting scan provenance, testing mesh integrity, and exercising a single-crown Boolean preview with a preparation-derived cavity. It is not a validated dental CAD/CAM system and it is not ready-milling software.

The public repository's demo uses synthetic watertight blocks rather than dental scans. A local BlueSkyPlan-linked practice set can be configured for private engineering work, but it is not redistributed by this repository and its reference crown is not registered to its die. The UI labels any reference placement as unverified and falls back to a closed procedural outer shell when the reference cannot be used as a Boolean solid. The fallback has no tooth library, patient-specific anatomy, traced margin, or contact design.

The preparation cavity is a geometry preview. The displayed relief value is an input to the preview, not a measured cement gap. The app does not calculate a signed fit map, margin adaptation, wall-thickness map, insertion path, undercut blockout, validated bite registration, dynamic articulation, connector or pontic design, implant interface, material shrinkage, machine stock, bur compensation, nesting, or toolpaths.

The review STL is intentionally gated and carries a warning. A qualified dental professional must validate scan identity, registration, margin, intaglio, contacts, occlusion, material, and CAM settings in a validated workflow before any clinical or manufacturing use.

The attached build prompt was treated as an engineering reference for an original system. OpenCusp does not include Exocad or BlueSky proprietary code, protected tooth libraries, license keys, or proprietary CAM components.
