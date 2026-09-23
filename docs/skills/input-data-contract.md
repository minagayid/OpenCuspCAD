# OpenCuspCAD input data contract

This contract describes what OpenCuspCAD can read, what it can do with each type, and what remains the operator's responsibility.

## Accepted inputs

| Family | Extensions | App behavior | Manufacturing status |
| --- | --- | --- | --- |
| Surface mesh | `.stl`, `.ply`, `.obj`, `.off` | Parses vertices and triangles, records a SHA-256 checksum, applies the user-declared source unit, and validates basic coordinates/topology where applicable. | A surface mesh may be used as a design input only after role assignment, provenance review, and mesh QA. |
| Point cloud | `.xyz`, `.pts`, `.csv`, ASCII `.pcd` | Parses XYZ coordinates, displays points, records checksum and declared units, and preserves the source file in the local case. | View-only and registration-preparation input. It is not a Boolean preparation or CAM-ready surface. |

## Unit and provenance rules

1. The importer requires the operator to declare millimetres, centimetres, or inches.
2. The declaration is stored in the case manifest and the displayed coordinates are normalized to millimetres.
3. The app never infers a scanner's unit, orientation, patient side, dentition, or registration quality from geometry alone.
4. A saved source is reopened only when its path and checksum match the case manifest.
5. Colors, scanner metadata, patient identifiers, and proprietary extensions are not silently reconstructed.

## Point-cloud boundary

Point clouds can be inspected and retained for a future registration or reconstruction workflow. A validated surface reconstruction, hole/edge review, normal-orientation check, and unit verification are required before a point cloud can become a design surface. OpenCuspCAD currently blocks the abutment manufacturing path and does not convert point clouds automatically.

## Unsupported or conversion-required inputs

DICOM, 3MF, GLB/GLTF, scanner project files, and proprietary CAD/CAM formats are not accepted by the current importer. Convert them with an authorized tool, preserve the original file and conversion settings, and import the resulting surface or point-cloud file with its source units documented.

## Operator checklist

- Confirm the scan role: preparation, prepared arch, antagonist, pre-operative, reference, or other.
- Confirm whether the file is a surface or a point cloud.
- Confirm source units and the anatomic side/arch.
- Check for missing data, duplicate role assignments, non-manifold edges, disconnected components, and implausible scale.
- Keep the original source and conversion record with the case.

