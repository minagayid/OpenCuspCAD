# Public product research: exocad and BlueSkyPlan

Research performed 16 September 2026. This note records public product documentation for workflow design only. Product names and their public documentation are references, not implementation instructions or permissions to copy.

## Observable workflow patterns

- **exocad DentalCAD:** guided wizard and expert workflows, restorations and tooth/implant libraries, scanner and material integrations, add-on modules, and open-format exchanges. Official sources:
  - [DentalCAD product overview](https://exocad.com/our-products/dentalcad)
  - [Integration overview](https://exocad.com/integration/overview)
  - [Implant library integration](https://exocad.com/integration/dentalcad-library-integration)
  - [Prosthetic component libraries](https://exocad.com/integration/prosthetic-component-libraries)
  - [DentalCAD documentation index](https://wiki.exocad.com/wiki/index.php/DentalCAD_Documentation_-_Index_of_topics)
- **Library structure:** vendor integrations cover implant and prosthetic components, scan bodies, titanium bases/abutments, restorative/tooth libraries and material configurations. Access/use is vendor- and license-managed; this app does not read, redistribute or emulate protected library files.
- **Clinical CAD sequence:** official DentalCAD documentation separates margin detection/editing, insertion axis and undercut review, region-based crown-bottom/cement-gap settings, tooth-library placement, contact/anatomy adaptation, framework/connectors and save. This informed OpenCusp's explicit disclosure that its current horizontal trim and prep offset are not those clinical operations. See the [documentation index](https://wiki.exocad.com/wiki/index.php/DentalCAD_Documentation_-_Index_of_topics), [margin workflow](https://wiki.exocad.com/wiki/index.php/Detect_/_edit_margins), [inside-crown design](https://wiki.exocad.com/wiki/index.php/Designing_the_inside_of_the_crown) and [AI crown workflow](https://wiki.exocad.com/wiki/index.php/AI_Crown_Design).
- **exocam/CAM:** published product pages identify nesting in blanks, production queues, material-blank management, machine selection, machine/tool configurations, path generation and simulation. Their integration notes separate CAD geometry exchange from machine-specific CAM/toolpath computation, including XML construction information and STL handoff. CAM is a distinct subsystem; our STL export is only a geometry handoff.
  - [exocad CAM integration](https://exocad.com/integration/cam-integration)
  - [exocam overview](https://exocad.com/our-products/exocam)
  - [exocam module documentation](https://wiki.exocad.com/wiki/index.php/ExoCAM_Module)
  - [Material blank library](https://wiki.exocad.com/wiki/index.php/Material_Blank_Library)
  - [Tool configuration](https://wiki.exocad.com/wiki/index.php/ExoCAM_Tool_configuration)
- **BlueSkyPlan:** public manual contents show STL model import/adjustment, model alignment, virtual teeth, crown-and-bridge restoration panels, tooth-surface editing, bridge parts and data export. The manual is a public workflow reference, not an open-source library.
  - [BlueSkyPlan user manual](https://manual.blueskyplan.com/index.php/Main_Page)
  - [BlueSkyPlan exports](https://www.blueskyplan.com/exports)
- Its parts documentation describes implant, abutment and scan-body integration as STL geometry plus structured measurement spreadsheets and orientation rules; the vendor requires direct cooperation for new catalog components. Those are data/configuration requirements, not an open library grant: [parts overview](https://www.blueskyplan.com/parts), [abutment integration](https://www.blueskyplan.com/addabutments).
- BlueSky Bio's version 4.13 changelog currently advertises AI automatic tooth design and specifically free design/export for permanent titanium-base crowns and bridges. The vendor's general export policy still says design-file exports are charged in most modules. Treat those claims as scoped to named workflows and the installed version; they do not mean every crown, export, part or CAM process is free. See [version updates](https://www.blueskyplan.com/previous-releases) and [export policy](https://www.blueskyplan.com/exports). No registration, terms acceptance, payment or program installation was performed in this project.

## Geometry, occlusion and validation findings

- A closure check only proves a mesh topology property. It does not measure an intaglio gap or margin, wall thickness, antagonist contact, material adequacy or machinability.
- exocad's public crown-bottom documentation describes zoned relief, axial/radial spacing, insertion-axis/undercut behavior and tool compensation; its library-tooth workflow also describes adjacent/antagonist adaptation and material-specific thickness behavior. A generic prep subtraction is not a substitute for those functions.
- The local BlueSkyPlan-linked teaching scans used during private engineering are hash-identified. They are not included in the public repository: the arches are open scans; the die is a separate closed object; the reference crown has one degenerate triangle and is in a different coordinate frame from the die. No source documentation establishes seating or bite registration.
- Peer-reviewed literature identifies registration and scan-record factors that change static MIP accuracy. Independent fit testing of fabricated restorations is necessary; published CAD-program comparisons use triple-scan analysis rather than mesh closure alone.
- Teeth3DS+ covers segmentation/labeling/landmark tasks, not paired crown restorations. A 2025 crown-generation paper reports a large private paired dataset, yet its authors still assume intact surrounding anatomy and list intaglio generation from a cervical margin and multiple adjacent missing teeth as future work. Neither source supplies licensed paired training data for this app.
- See [Deep Research and Committee Review](DEEP_RESEARCH_AND_COMMITTEE_REVIEW.md) for full source citations, committee disagreements, restoration coverage and validation gates.

## Original implementation boundary

OpenCusp uses public mesh formats STL/PLY and independent geometry code. It uses no exocad or BlueSkyPlan program code, proprietary tooth libraries, implant component libraries, CAM tool definitions, brand assets or protected project files. A case can be handed to third-party CAM only after a qualified technician verifies units, transforms, margins, intaglio, contacts, material and the receiving machine's CAM setup.

## Evidence limits

This research is based on publicly available product pages and manuals, not source code or private SDKs. It is sufficient to model broad workflow boundaries and published functions, not to reproduce either application's internal data structures.
