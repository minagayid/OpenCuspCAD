# Restoration design library and routing contract

This is a metadata and review library, not a mesh library. It classifies the prescribed restoration and routes it to the correct evidence gates. The current geometry engine implements only a generic full-contour crown preview. Every other class remains brief-only until its restoration-specific geometry and validation are implemented.

## Library records

Each record should preserve:

- `restorationType`, tooth identity, dentition, arch, side, and prescription source;
- a canonical design-context fingerprint covering source hashes, units/conversions, transforms, registration state, parameters, restoration brief, reference provenance, and geometry-engine version;
- preparation/finish-line evidence and scan provenance;
- desired anatomy or pre-operative/contralateral reference;
- adjacent and antagonist sources, bite-record provenance, and coordinate frames;
- insertion direction, editable regions, clinician constraints, material intent, fabrication route, and release owner;
- required checks, known assumptions, unresolved questions, and the exact artifact fingerprint.

## Supported routing matrix

| Design class | Required design evidence | Current OpenCusp route |
| --- | --- | --- |
| Full-contour crown | Tooth identity, visible finish line, insertion path, intaglio, contacts, occlusion, material/CAM review | Generic crown preview only; approval and CAM handoff remain review-gated |
| Coping / cutback | Margin, reduction prescription, cutback boundary, minimum thickness from the selected material, contacts and occlusion | Brief-only; no geometry generation |
| Inlay / onlay / overlay | Coverage classification, preparation boundary, insertion path, undercut map, cusp/occlusal prescription, thickness and contacts | Brief-only; a full-crown Boolean must not be reused |
| Veneer | Facial/incisal/proximal coverage, visible margin, facial axis, thickness, emergence, contacts and occlusion | Brief-only; no geometry generation |
| Multi-unit bridge | All retainer margins, common insertion path, pontic and hygiene design, connector requirements, contacts, occlusion, material and machine constraints | Brief-only; do not join independent crown previews |
| Implant crown / custom abutment | Manufacturer/system, platform, connection, scan body and orientation, component/library version, Ti-base/abutment ID, interface and screw-channel review | Brief-only; generic interfaces are prohibited |

## Anatomy reference policy

Anatomy references may be a pre-operative scan, contralateral tooth, licensed tooth library, or documented procedural research form. A generic procedural form is not patient-specific anatomy. Primary and permanent dentition are separate branches and must not share templates without evidence and review. The morphology vocabulary is documented in [professional-dental-design.md](professional-dental-design.md) and [academic-dental-library.md](../references/academic-dental-library.md).

## Versioning and provenance

Every future library asset must include a stable identifier, version, source/license, coordinate units, orientation convention, anatomy scope, intended restoration classes, and validation status. Manufacturer implant and material libraries require explicit redistribution rights and current manufacturer documentation; screenshots, guessed cylinders, and copied proprietary assets are not acceptable substitutes.

## Release states

- `BRIEF_ONLY`: prescription and evidence are recorded, but no manufacturing geometry is authorized.
- `REVIEW_ONLY`: a deterministic preview exists and is fingerprinted, but clinical/CAM checks are incomplete.
- `CAM_SIMULATION_AND_OPERATOR_CHECK_REQUIRED`: a local STL/OBJ handoff and manifest exist; the operator must import and simulate them.
- `RELEASED_FOR_MANUFACTURE`: reserved for a future validated machine-specific workflow. OpenCuspCAD does not currently produce this state.
