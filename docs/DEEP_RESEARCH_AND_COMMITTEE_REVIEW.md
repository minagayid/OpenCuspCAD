# Dental CAD/CAM research and critic committee

Research snapshot: 16 September 2026. This document records public product documentation, peer-reviewed or open research, limitations of public datasets, and an AI critic review of OpenCusp. Product names identify workflow references only. Nothing here grants access to proprietary code, libraries, case data, or machine profiles.

## What the public products actually expose

### exocad

The official DentalCAD documentation presents a staged CAD workflow with separate case definition, margin detection/editing, insertion-axis assessment, crown-bottom/intaglio construction, tooth placement, freeforming, antagonist/adjacent adaptation, framework/connectors, and save steps [1]. That architecture matters: a restoration is not one mesh-generation operation.

The crown-inside documentation describes zone-based cement gap, separate axial and radial spacing, editable border shape, insertion-direction undercut blocking, an untouchable zone near the margin, and tool-diameter/bullnose compensation. It explicitly warns that some undercut treatments can leave an unmanufacturable fit that needs manual remediation [4]. The documented insertion-axis workflow exposes undercuts and asks for operator review in ambiguous single-unit cases and shared-axis constraints for multi-unit bridges in lower-axis milling modes [3].

The tooth-placement workflow starts from a library model, adapts it to adjacent teeth, provides manual freeforming, and has distinct antagonist modes and manufacturer minimum-thickness behavior [5]. Its AI crown documentation still describes a normal margin/crown-bottom review, manual customization, optional rejection, and known problem cases such as unusual arrangements or missing adjacent teeth; distance/contact controls are described as guidance, followed by exact cutting/adjustment in later steps [6].

CAM is a separate production stage. exocad documentation describes blanks, nesting queues, production state, machine integration and toolpath calculation; published CAD/CAM exchange is not equivalent to a generic STL being machine-ready [7–10]. A CAM profile must be specific to the machine, axis capability, material blank, fixtures, cutters, compensation and postprocessor. A simulated toolpath still needs process validation.

### BlueSkyPlan

BlueSkyPlan’s public manual indexes a crown-and-bridge module, virtual teeth, restoration panels, bridge-part editing, denture workflows, and data export [11]. The vendor’s parts pages describe component catalogs as STL geometry plus structured measurement spreadsheets; implant/abutment part orientation, dimensions, compatibility and scan-body definitions are explicit data, not just a decorative library [13,14]. These are manufacturer/vendor integration mechanisms, not open libraries that OpenCusp can redistribute.

The vendor’s current version 4.13 update page advertises AI tooth design and specifically calls out permanent titanium-base crowns and bridges with design/export at no charge [12]. Its general exports page separately says that designed STL exports consume credits in most modules, while imported/edit-only data can be exported without a fee [15]. These statements are scoped and version-dependent; “BlueSkyPlan is free” does not mean every designed output, add-on, component, or CAM operation is free. No installer was run, account was created, terms were accepted, credit was used, or purchase was made during this project.

### Independent geometry and AI research

The open Teeth3DS+ benchmark is for scan analysis tasks such as tooth detection, segmentation, labeling, modeling, and landmarks; it is not a paired preparation-to-restoration manufacturing dataset [20]. A strong crown-generation paper reports 6,499 adult intraoral-scan cases with tooth-position input, but the authors say the dataset assumes intact surrounding anatomy and that clinical inner-surface construction from an extracted cervical margin and multiple adjacent missing teeth remain future work [21]. Its data are listed as unavailable (“N/A”) on the paper page. This is a useful technical research result, not a dataset or validated commercial dental CAD component we can simply train on.

The practical implication is that a language model can help route a case, explain workflow, capture operator decisions, and summarize QC evidence. It cannot replace geometry algorithms or expert labels by being prompted to “make a crown.” Crown design needs a dental-specific 3D generator, robust CAD operations, tooth/restoration identity, registered surrounding anatomy, and measurable post-generation checks. Training would require explicit rights to paired scan/design data and independent case-level validation; segmentation-only datasets cannot supervise margins, fit, material thickness, or mill outcomes.

## Restoration coverage: separate jobs, separate evidence

| Restoration / case | Required design evidence and machinery | OpenCusp status |
|---|---|---|
| Single full-coverage crown | Tooth/dentition/side identity; scan quality; approved 3D finish line; insertion path and undercuts; zoned intaglio; patient-specific proximal and static occlusal adaptation; material thickness; specific validated CAM | A single-crown **geometry demonstration only**. Current output is a bounding-box shell with generic cusp perturbations and a Boolean prep subtraction. It is not anatomically targeted, does not trace a margin or measure fit, and is not ready to mill. |
| Coping / framework | Reduction/cutback design, material-specific framework design, connector geometry, support and CAM constraints | Not implemented |
| Bridge | Multi-abutment margin and common or validated per-unit insertion paths; pontic/emergence/hygiene design; connector cross-sections; span/material/fracture validation; contacts and process-specific nesting | Not implemented; must not be created by joining independent preview crowns |
| Implant / Ti-base / screw-retained crown | Exact scan-body and component library with validated orientation; coordinate transfer; implant interface, screw channel, emergence profile, component compatibility and machine tolerances | Not implemented; no implant library or scan-body registration |
| Inlay / onlay / veneer / partial coverage | Different preparation outline and retention geometry, restoration borders, local material thickness and insertion constraints | Not implemented; current full-crown Boolean is not suitable |
| Splint / denture / partial denture | Arch-scale tissue/contact surfaces, insertion/undercut survey, tooth setup, occlusion and different materials/processes | Not implemented |
| Primary teeth, worn/malformed anatomy, missing neighbors, full-mouth rehabilitation | Explicit treatment objective and clinician-prescribed anatomy; primary-tooth proportions/materials; wear and occlusal vertical dimension plans; case-specific validation | Unsupported. Do not silently substitute a “normal” generic tooth or claim to correct a malformation |

The morphology critic emphasized that a maxillary first molar needs asymmetric cusp layout and ridges/fossae/grooves (including a possible Carabelli trait), while a mandibular molar, premolar, canine, incisor, primary tooth, worn tooth, peg lateral, and partially edentulous case each differ. Patient-specific reconstruction and clinician-directed correction of abnormal anatomy are distinct problems. Tooth numbering also needs canonical dentition, arch, side and position rather than an ambiguous display string; Universal #3 maps to FDI/ISO 16 [22].

## Occlusion, fit and manufacturing gates

The committee rejects any claim that six-degree manual movement or a checkbox registers a bite. The current “distance” is a sparse unsigned closest-surface sample from proposal vertices against an opposing mesh. It can miss local contacts, cannot distinguish collision from clearance, and does not model jaw motion. Evidence reviews identify scanner, scan coverage/quality, bite record number/location/extent and force, missing teeth, tooth mobility, and best-fit alignment as accuracy factors; full-arch MIP studies recommend distributed records with adequate landmarks [16,17]. Static MIP and dynamic excursions must be different features with different required evidence.

Mesh closure, signed volume, Boolean success and a saved checksum are software/geometry properties, not clinical fit. A BlueSky CAD comparison study manufactured crowns and measured them with a triple-scan protocol; CAD program selection changed measured marginal fit [18]. Fit method itself affects results, and published acceptance cutoffs vary; do not encode one universal cement-gap or wall-thickness limit [19]. Validate the physical restoration against the die and design using an independent method (for example, triple-scan, replica or micro-CT), and tie limits to the indication, material instructions, manufacturing process and validation protocol.

“Ready to mill” requires more than a closed STL: named material and blank, machine, stock and fixture coordinate frames, permitted axes, tool library and minimum tool geometry, collision/undercut treatment, compensation, supported file contract/postprocessor, simulated path, and a validated machine/material recipe. A review-only STL is not a CAM file. No OpenCusp component is a validated toolpath, machine driver or release gate for manufacturing.

## Critic committee: adversarial findings and resolved decisions

The committee was formed from five bounded AI reviews: dental mesh geometry; CAD/CAM architecture; product QA and persistence; tooth morphology; and prosthodontic occlusion/fit. These are **AI critic agents, not licensed dentists, prosthodontists, dental technicians or manufacturer approvals**. Their purpose here was to challenge claims and expose testable gaps.

The geometry reviewer found that the prototype builds its exterior from preparation bounds and four generic Gaussian peaks, trims the base at global Z, and offsets the entire closed prep along vertex normals. This can be a useful boolean-kernel exercise, but it is not a traced margin or a measured uniform gap. The QA critic identified that “Generated from prep” read like a successful fit result, inactive restoration/tooth/material controls implied behavior that did not exist, and save previously stored parameters without the proposal mesh or scan provenance. The morphology reviewer confirmed that the shape is not a #3 tooth-specific anatomical surface and cannot generalize across tooth classes or anomalies. The occlusion reviewer confirmed that the coordinate frames and bite registration in the practice fixture are not verified.

**Debate resolution:** keep the application visibly scoped to one local geometry preview; label operations precisely; preserve source hashes, declared units, transforms, parameters and output mesh; restore only checksum-verified artifacts; keep a future-facing review acknowledgement separate from clinical approval; do not infer occlusion from raw coordinates; and withhold CAM/ready-to-mill claims. For the next credible CAD increment, prioritize a manually editable 3D margin and operator-set insertion axis, followed by independently tested measurements. Do not add a larger generative model before the scan/landmark/margin/fit evidence pipeline exists.

On the second adversarial pass, the architecture and QA critics found asynchronous generation/import races, parameter and antagonist freshness gaps, ambiguous duplicate scan roles, an import-cancel case fallback, non-unique source names, and training tooth #3 metadata leaking into unassigned cases. The implementation now snapshots and rechecks generation inputs around the Boolean, holds case switching during imports/switches, uses UUID upload names, rejects duplicate preparation/opposing/arch roles, retains an empty new case after a cancelled import, includes unit scaling and opposing pose in freshness, and labels generic cases tooth-unassigned. These are verified software workflow fixes; they do not improve the generic shell into a clinically accurate crown.

### Current implementation checks

- A BlueSkyPlan-linked practice set was used as private local training data. Its official case report gives source SHA-256 values and millimetre bounds; all five files were checked against those hashes. The arches are open scan surfaces, the prep die is closed, and the reference crown is in a different coordinate frame with one degenerate triangle. It is not seating or bite ground truth [23]. The dataset is excluded from the public repository.
- The prototype makes a real solid Boolean cavity. In the latest browser run it restored a single connected, consistently oriented closed 31,432-triangle review proposal. The app reports “Boolean completed · fit not measured,” “wall thickness unmeasured,” and “registration NOT EVALUATED.”
- Case save/reopen preserves source URLs, hashes, units/unit provenance, visibility, transforms, slider values, and the generated binary STL. Reload verified the proposal SHA-256 and closure again. The review checkbox stayed unchecked and STL export stayed disabled.
- Freshness captures generation parameters, prep identity/unit scale/transform, and opposing scan identity/transform plus the bite-review note. Parameter changes invalidate review and output; results are discarded if case or inputs change during asynchronous Boolean work.
- Uploads are restricted to STL/PLY extension plus basic file/header validation; sources use UUID filenames; duplicate prep/opposing/arch roles are rejected; mutations with an unapproved browser origin are blocked. These are basic local safeguards, not a security audit.
- Four synthetic mesh-integrity tests pass for one positive closed component, open edges, nonmanifold edges, disconnected components, reversed and inconsistent face winding, degenerate faces, and non-finite coordinates. The local API smoke suite checks STL/PLY parsing, rejection and cleanup of non-finite meshes, distinct same-role upload paths, and origin enforcement. Browser checks exercised new-case retention after cancelled import, import/save/reopen by source hash, duplicate-prep refusal, and antagonist/relief freshness invalidation.
- The current app is a research demonstrator. The only successful geometry operation does **not** satisfy a dental design validation protocol or any milling release condition.

## References

[1] exocad, [DentalCAD Documentation Index](https://wiki.exocad.com/wiki/index.php/DentalCAD_Documentation_-_Index_of_topics).

[2] exocad, [Detect / edit margins](https://wiki.exocad.com/wiki/index.php/Detect_/_edit_margins).

[3] exocad, [Setting insertion axis](https://wiki.exocad.com/wiki/index.php/Setting_insertion_axis).

[4] exocad, [Designing the inside of the crown](https://wiki.exocad.com/wiki/index.php/Designing_the_inside_of_the_crown).

[5] exocad, [Place Model Tooth](https://wiki.exocad.com/wiki/index.php/Place_Model_Tooth).

[6] exocad, [AI Crown Design](https://wiki.exocad.com/wiki/index.php/AI_Crown_Design).

[7] exocad, [CAM Module](https://wiki.exocad.com/wiki/index.php/CAM_Module).

[8] exocad, [CAM integration](https://exocad.com/integration/cam-integration).

[9] exocad, [exocam module](https://wiki.exocad.com/wiki/index.php/ExoCAM_Module) and [Material Blank Library](https://wiki.exocad.com/wiki/index.php/Material_Blank_Library).

[10] exocad, [exocam overview](https://exocad.com/our-products/exocam).

[11] Blue Sky Bio, [BlueSkyPlan User Manual](https://manual.blueskyplan.com/index.php/Main_Page), sections “Crown and Bridge module” and “Create Bridge.” The publicly indexed manual page identifies those workflows; details must be checked against the actual software version.

[12] Blue Sky Bio, [BlueSkyPlan software updates](https://www.blueskyplan.com/previous-releases), version 4.13 release notes.

[13] Blue Sky Bio, [BlueSkyPlan parts](https://www.blueskyplan.com/parts).

[14] Blue Sky Bio, [Add abutments and component records](https://www.blueskyplan.com/addabutments).

[15] Blue Sky Bio, [BlueSkyPlan export policy](https://www.blueskyplan.com/exports).

[16] Revilla-León M, et al. Factors that influence the accuracy of maxillomandibular relationship at maximum intercuspation acquired by using intraoral scanners: a systematic review. *J Dent.* 2023;138:104718. [PubMed](https://pubmed.ncbi.nlm.nih.gov/37775027/).

[17] Chinam N, et al. Virtual occlusal records acquired by using intraoral scanners: a review of factors that influence maxillo-mandibular relationship accuracy. *J Prosthodont.* 2023;32(S2):192–207. [PubMed](https://pubmed.ncbi.nlm.nih.gov/37882237/).

[18] Evaluation of the marginal and internal fit of CAD/CAM crowns designed using three different dental CAD programs: a 3-dimensional digital analysis study. *J Prosthet Dent.* [PubMed](https://pubmed.ncbi.nlm.nih.gov/36100722/).

[19] Assessment Methods for Marginal and Internal Fit of Partial Crown Restorations: a systematic review. [PubMed](https://pubmed.ncbi.nlm.nih.gov/37568450/).

[20] Ben-Hamadou A, et al. Teeth3DS+: An Extended Benchmark for Intraoral 3D Scans Analysis. [arXiv:2210.06094](https://arxiv.org/abs/2210.06094).

[21] Wang L, et al. VBCD: A Voxel-Based Framework for Personalized Dental Crown Design. *MICCAI 2025.* [Open-access paper and author response](https://papers.miccai.org/miccai-2025/0999-Paper2280.html).

[22] ADA, [Universal Tooth Designation System value set](https://www.ada.org/-/media/project/ada-organization/ada/ada-org/files/publications/cdt/universal_tooth_designation_system_valueset_2.pdf?hash=4C41BD09B3D776E69F6CDB3854C052F9&rev=5938db8b7a72425a912cc09fff3ea8f0); ISO, [ISO 3950 tooth designation system](https://www.iso.org/standard/68292.html).

[23] BlueSkyPlan official tutorial-linked [Crown Design, Print, Polish practice files](https://drive.google.com/drive/folders/169dem1aQXEo3AzVXfDyLRepFVnMMfzUr), recorded locally with hashes/bounds in `data/BlueSky_Crown_Practice/geometry_report.json`. Redistribution rights were not established; keep these files local.
