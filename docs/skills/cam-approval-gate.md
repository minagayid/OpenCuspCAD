# CAM approval and handoff gate

OpenCuspCAD produces a local handoff package; it does not connect to or transmit to a CAM machine. The machine operator remains responsible for importing the geometry, selecting a validated strategy, simulating the toolpath, and releasing the job.

## Required sequence

1. Generate a fresh closed preview from the current case inputs.
2. Review the source roles, units, FDI brief, preparation, antagonist, reference anatomy, and design limitations.
3. Check the professional review acknowledgement.
4. Record reviewer name, role, approval/case ID, and review note.
5. Confirm the current design fingerprint matches the approval record.
6. Enter the CAM version, material, blank or puck ID, and validated tool profile.
7. Export the selected STL or OBJ plus the JSON manifest.
8. Import the geometry into the actual CAM system, simulate it, inspect the result, and approve the machine-specific job there.

## Handoff invariants

- The manifest contains the design fingerprint, case ID, source format list, geometry format, millimetre units, approval summary, machine profile, CAM version, material, blank, and tool profile.
- A changed design invalidates the approval and blocks the handoff until it is reviewed again.
- The generic machine profile is an explicit placeholder and is not a machine postprocessor.
- The handoff status is `CAM_SIMULATION_AND_OPERATOR_CHECK_REQUIRED`.
- No toolpath, feed/speed set, fixture plan, nesting plan, or machine command is generated.

## Stop conditions

Stop and return to review when the file is stale, the checksum differs, approval is missing, the restoration is an abutment brief, units are uncertain, the mesh is open or invalid, the CAM profile is unvalidated, or the material/blank/tool data do not match the manufacturing prescription.

