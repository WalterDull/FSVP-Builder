"use strict";

const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType, Header, Footer, PageNumber, LevelFormat,
  VerticalAlign,
} = require("docx");

// FTC International brand accent — matches PCP-Planner's branding, so both
// tools look like the same product family.
const ORANGE = "D9622B";
const DARK = "2B2B2B";

const PAGE_W = 12240, PAGE_H = 15840; // US Letter, DXA
const MARGIN = 720; // 0.5"
const USABLE = PAGE_W - MARGIN * 2;

// ---------- low-level helpers ----------
function H1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 150 }, children: [new TextRun({ text, bold: true, color: ORANGE })] });
}
function H2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 100 }, children: [new TextRun({ text, bold: true, color: DARK })] });
}
function H3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 140, after: 70 }, children: [new TextRun({ text, bold: true, italics: true })] });
}
function P(text, opts = {}) {
  return new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, ...opts })] });
}
function bullets(items) {
  return items.map((t) => new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, spacing: { after: 50 }, children: [new TextRun(t)] }));
}
function label(text) {
  return new Paragraph({ children: [new TextRun({ text, bold: true, color: ORANGE })], spacing: { before: 100, after: 30 } });
}
function value(text) {
  return new Paragraph({ children: [new TextRun({ text: text && String(text).trim() ? String(text) : "Not provided" })], spacing: { after: 90 } });
}
function field(labelText, valText) {
  return [label(labelText), value(valText)];
}
function listOrNone(arr) {
  if (!arr || !arr.length) return "None identified / not selected";
  return Array.isArray(arr) ? arr.join(", ") : String(arr);
}
function spacer() {
  return new Paragraph({ text: "", spacing: { after: 100 } });
}

// ---------- table helpers (fixed column widths — required so Word doesn't
// collapse columns to 1 character; see docx skill gotchas) ----------
function cell(text, opts = {}) {
  return new TableCell({
    width: { size: opts.width || 1000, type: WidthType.DXA },
    shading: opts.header ? { type: ShadingType.CLEAR, fill: ORANGE } : opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text: String(text), bold: !!opts.header, color: opts.header ? "FFFFFF" : "000000", size: opts.size || 20 })] })],
  });
}
function table(colWidths, headerRow, bodyRows) {
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: totalW, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({ tableHeader: true, children: headerRow.map((h, i) => cell(h, { header: true, width: colWidths[i] })) }),
      ...bodyRows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, { width: colWidths[i] })) })),
    ],
  });
}
function dtRow(step, question, yes, no) {
  return [step, question, yes, no];
}

// ---------- SOP library (mirrors the optional/prerequisite SOP set built
// for the PCP-Planner and the FSVP_Program_Manual.docx reference document,
// adapted to the FSVP importer's verification role). Selected in the wizard
// and rendered in full here. ----------
const SOP_LIBRARY = {
  supplierApproval: {
    title: "Foreign Supplier Approval SOP",
    citation: "21 CFR 1.505",
    purpose: "To ensure the company imports food only from foreign suppliers that have been evaluated and approved based on documented risk factors.",
    scope: "Applies to every foreign supplier of every food imported by the company.",
    responsibility: "FSVP Qualified Individual (QI).",
    procedure: [
      "Before first importing a food from a new foreign supplier, compile the hazard analysis for the food.",
      "Evaluate the supplier considering: the hazard requiring a control; the entity that will control it; the supplier's food safety procedures and practices; applicable FDA compliance history; the supplier's food safety/testing/audit history; and other relevant factors (e.g., storage/transportation).",
      "Document the evaluation and approve, conditionally approve, or reject the supplier.",
      "Food may be imported from an unapproved supplier only temporarily, and only with adequate verification applied to that shipment before import.",
    ],
    verification: "QI countersigns each approval decision; management reviews the approved supplier list annually.",
    records: ["Foreign Supplier Evaluation & Approval Log", "Approved Foreign Supplier List"],
  },
  verificationDetermination: {
    title: "Determination of Verification Activities SOP",
    citation: "21 CFR 1.506(d)",
    purpose: "To determine, before importing a food, which verification activity or activities (and at what frequency) provide adequate assurance the hazard is controlled.",
    scope: "Every food/foreign supplier combination with a hazard requiring a control.",
    responsibility: "FSVP Qualified Individual.",
    procedure: [
      "Select one or more of: onsite audit, sampling and testing, review of food safety records, or another appropriate activity.",
      "If a hazard controlled by the supplier carries a reasonable probability of serious adverse health consequences or death (SAHCODHA), an onsite audit is required before first import and at least annually, unless a written justification documents an adequate alternative.",
      "Document the determination and its rationale before the first shipment; revisit at reassessment or upon new information.",
    ],
    verification: "QI sign-off required on every determination.",
    records: ["Verification Activity Determination Log"],
  },
  onsiteAudit: {
    title: "Onsite Audit SOP",
    citation: "21 CFR 1.506(e)(1)(i)",
    purpose: "To verify, through an audit conducted by a qualified auditor, that the foreign supplier's food safety processes adequately control identified hazards.",
    scope: "Suppliers for which onsite audit has been selected as a verification activity.",
    responsibility: "Qualified Auditor.",
    procedure: [
      "Schedule the audit before first import and at the determined frequency thereafter.",
      "The audit must consider applicable FDA regulations and review the supplier's written food safety plan and its implementation.",
      "Document procedures used, dates, findings, deficiencies, and corrective actions taken.",
      "A written inspection result from FDA or a recognized-equivalent country's authority may substitute if conducted within 1 year of when the audit would be due.",
    ],
    verification: "QI reviews every audit report promptly; unresolved deficiencies trigger corrective action.",
    records: ["Audit reports", "Qualified auditor credentials"],
  },
  samplingTesting: {
    title: "Sampling & Testing SOP",
    citation: "21 CFR 1.506(e)(1)(ii)",
    purpose: "To verify hazard control through laboratory sampling and testing of the imported food.",
    scope: "Foods/suppliers for which sampling and testing has been selected as a verification activity.",
    responsibility: "Qualified Individual; testing performed by a qualified laboratory.",
    procedure: [
      "Identify the food/lot(s) and hazard(s) being tested for; draw samples using a documented sampling plan.",
      "Submit to the lab with chain-of-custody documentation; record analytical methods used.",
      "Review results promptly; any hazard detection triggers corrective action.",
    ],
    verification: "QI reviews and documents assessment of every test report.",
    records: ["Food/lot ID, sample count, methods, dates, results, lab ID, QI review"],
  },
  recordsReview: {
    title: "Review of Food Safety Records SOP",
    citation: "21 CFR 1.506(e)(1)(iii)",
    purpose: "To verify hazard control through periodic review of the foreign supplier's relevant food safety records.",
    scope: "Foods/suppliers for which records review has been selected as a verification activity.",
    responsibility: "Qualified Individual.",
    procedure: ["Request relevant food safety records; review for completeness and evidence the hazard is controlled.", "Document date of review, records reviewed, conclusions, and deficiencies."],
    verification: "QI countersigns each review; deficiencies trigger corrective action.",
    records: ["Records Review Log"],
  },
  vendorGuaranteeCoa: {
    title: "Vendor Guarantee & Certificate of Analysis (CoA) SOP",
    citation: "Supports 21 CFR 1.505 / 1.506(e)(1)(iv)",
    purpose: "To obtain and verify written vendor guarantees and CoAs confirming imported product is free from contamination, adulteration, and defects.",
    scope: "All foreign suppliers and imported lots.",
    responsibility: "Qualified Individual; Receiving personnel.",
    procedure: [
      "Obtain a signed vendor guarantee from each approved supplier.",
      "Require a lot-specific CoA per shipment where testing is part of the determined verification activities.",
      "Compare CoA results against specification; quarantine out-of-spec lots pending QI review.",
    ],
    verification: "QI spot-checks CoA authenticity against the issuing laboratory periodically.",
    records: ["Vendor guarantees", "Lot-specific CoAs"],
  },
  labelReview: {
    title: "Label Review SOP",
    citation: "21 CFR 1.502(a) referencing FD&C Act §403(w)",
    purpose: "To ensure imported food is not misbranded, and that labeling accurately declares major food allergens.",
    scope: "All imported food offered for retail sale or further distribution in the U.S.",
    responsibility: "Qualified Individual / Label Reviewer.",
    procedure: [
      "Compare the formulation and ingredient statement against the finished label.",
      "Confirm major allergens are declared per FALCPA/FASTER Act requirements.",
      "Confirm mandatory labeling elements are present and accurate for the U.S. market.",
    ],
    verification: "QI sign-off required before first shipment of any new label version.",
    records: ["Label Review Checklist", "Approved label artwork"],
  },
  receivingTraceability: {
    title: "Import Receiving & Lot Traceability SOP",
    citation: "Supports 21 CFR 1.510 and 1.508",
    purpose: "To ensure every imported lot is logged on receipt and remains traceable one-up (to the supplier) and one-back (through distribution).",
    scope: "All imported food lots.",
    responsibility: "Receiving personnel; QI oversight.",
    procedure: [
      "Record the supplier's lot code, country of origin, quantity, receipt date, and the assigned internal lot code.",
      "Attach CoA, vendor guarantee, and customs entry documentation.",
      "If repacked or used in further processing, record the mapping from supplier lot code(s) to finished lot code(s).",
    ],
    verification: "QI conducts a mock recall/traceability exercise at least annually.",
    records: ["Import Receiving Log", "Batch/Repack Records"],
  },
  correctiveAction: {
    title: "Corrective Action SOP",
    citation: "21 CFR 1.508",
    purpose: "To promptly identify and correct instances where a foreign supplier is not producing food consistent with U.S. requirements.",
    scope: "Whenever a problem is identified via verification, reassessment, complaints, or other information.",
    responsibility: "Qualified Individual.",
    procedure: [
      "Document the finding and its source.",
      "Determine and implement appropriate action: supplier corrective action plan, increased verification, or discontinuing use of the supplier.",
      "Investigate whether the FSVP itself needs modification.",
    ],
    verification: "QI closes out each corrective action only after confirming effectiveness.",
    records: ["Corrective Action Log"],
  },
  complaintRecall: {
    title: "Customer Complaint & Recall SOP",
    citation: "Supports 21 CFR 1.508(c)",
    purpose: "To capture, investigate, and respond to food-safety-related complaints, and trigger a recall when warranted.",
    scope: "All complaints related to imported product safety, quality, or labeling.",
    responsibility: "Qualified Individual; Recall Coordinator.",
    procedure: [
      "Log every complaint; assess whether it indicates inadequate hazard control.",
      "Use receiving/batch records to identify affected lots and distribution.",
      "Initiate a recall and notify FDA as required if warranted.",
    ],
    verification: "Mock recall exercise at least annually.",
    records: ["Complaint Log", "Recall records"],
  },
  reassessment: {
    title: "Reassessment (Reevaluation) SOP",
    citation: "21 CFR 1.505(c)",
    purpose: "To ensure the hazard analysis, supplier evaluation, and verification activities remain current.",
    scope: "Every food/foreign supplier combination.",
    responsibility: "Qualified Individual.",
    procedure: ["Reevaluate promptly upon new information, and at minimum every 3 years.", "Determine and document whether it remains appropriate to continue importing and whether activities need to change."],
    verification: "Management reviews the reassessment schedule annually.",
    records: ["Reassessment Log"],
  },
  recordkeeping: {
    title: "Recordkeeping SOP",
    citation: "21 CFR 1.510",
    purpose: "To maintain FSVP records in a form and duration that satisfies FDA requirements.",
    scope: "All records generated under this FSVP.",
    responsibility: "Qualified Individual; Document Control Coordinator.",
    procedure: ["Keep legible originals, copies, or electronic records, signed/dated on completion and modification.", "Retain at least 2 years (or 2 years after discontinued use for process/procedure records).", "Ensure offsite records can be produced onsite within 24 hours of an FDA request."],
    verification: "Annual internal audit of the record system.",
    records: ["Master FSVP record index"],
  },
  jobDescriptions: {
    title: "Employee Job Descriptions & Qualified Individual/Auditor Designation SOP",
    citation: "21 CFR 1.503",
    purpose: "To document that the FSVP is developed and performed by personnel meeting the 'qualified individual' (and 'qualified auditor') definition.",
    scope: "All personnel assigned FSVP responsibilities.",
    responsibility: "Company Management.",
    procedure: ["Maintain written job descriptions specifying required education/training/experience for the QI and any Qualified Auditor.", "Retain training records and confirm no financial conflict of interest ties to verification outcomes."],
    verification: "Management reviews qualifications annually.",
    records: ["Job descriptions", "Training records"],
  },
  sanitation: {
    title: "Sanitation SOP (If You Also Operate a Domestic Facility)",
    citation: "Applicable under 21 CFR Part 117",
    purpose: "To maintain a clean, sanitary environment for any domestic warehousing, repacking, or processing of imported food.",
    scope: "Any company-operated facility handling imported food.",
    responsibility: "Sanitation Supervisor.",
    procedure: ["Follow a master sanitation schedule.", "Use approved sanitizers at validated concentrations.", "Document sanitation tasks as scheduled."],
    verification: "Pre-operational inspection before each production run.",
    records: ["Sanitation checklist"],
  },
  pestControl: {
    title: "Pest Control SOP (If You Also Operate a Domestic Facility)",
    citation: "Applicable under 21 CFR Part 117",
    purpose: "To prevent pest activity from contaminating stored or processed imported food.",
    scope: "Any company-operated facility handling imported food.",
    responsibility: "Pest Control Coordinator.",
    procedure: ["Maintain a device map and inspection schedule.", "Engage a licensed pest control operator.", "Investigate and correct pest findings immediately."],
    verification: "Review service reports each visit.",
    records: ["Service reports"],
  },
  preOpInspection: {
    title: "Pre-Operational Inspection SOP (If You Also Operate a Domestic Facility)",
    citation: "Applicable under 21 CFR Part 117",
    purpose: "To confirm the facility and equipment are clean and ready before operations affecting imported food begin.",
    scope: "Any company-operated facility repacking or processing imported food.",
    responsibility: "Shift Supervisor / QI.",
    procedure: ["Inspect equipment/surfaces before each shift.", "Record pass/fail and any corrective action before releasing the line."],
    verification: "QI spot-checks records weekly.",
    records: ["Pre-op inspection checklist"],
  },
  preventiveMaintenance: {
    title: "Preventive Maintenance SOP (If You Also Operate a Domestic Facility)",
    citation: "Applicable under 21 CFR Part 117",
    purpose: "To keep equipment in good repair to prevent contamination during domestic handling.",
    scope: "All food-contact equipment at company-operated facilities.",
    responsibility: "Maintenance Supervisor.",
    procedure: ["Maintain a preventive maintenance schedule per manufacturer recommendations.", "Log completed maintenance and deficiencies."],
    verification: "Annual review of completion rate.",
    records: ["Preventive maintenance log"],
  },
  waterTesting: {
    title: "Water Potability & Annual Testing SOP (If Applicable)",
    citation: "Applicable if using a domestic food-contact water source",
    purpose: "To confirm water used in contact with imported food is safe and sanitary.",
    scope: "Any facility using water in contact with imported food.",
    responsibility: "QI / Facility Manager.",
    procedure: ["Test potable water sources at least annually.", "Address out-of-specification results immediately and retest before resuming use."],
    verification: "QI review of test results each cycle.",
    records: ["Water Testing Log"],
  },
  temperatureMonitoring: {
    title: "Temperature Monitoring SOP (If Applicable)",
    citation: "Applicable to temperature-sensitive imported food",
    purpose: "To ensure temperature-sensitive imported food is held within safe ranges from receipt through distribution.",
    scope: "Refrigerated/frozen imported product.",
    responsibility: "Receiving and Warehouse personnel.",
    procedure: ["Record temperature at receipt; reject out-of-spec shipments.", "Monitor and log storage temperatures at set intervals."],
    verification: "QI review of temperature logs weekly.",
    records: ["Temperature Monitoring Log"],
  },
};

function renderSop(sop) {
  const out = [H2(sop.title)];
  out.push(P(`Regulatory basis: ${sop.citation}`, { italics: true, size: 18, color: "666666" }));
  out.push(H3("Purpose"));
  out.push(P(sop.purpose));
  out.push(H3("Scope"));
  out.push(P(sop.scope));
  out.push(H3("Responsibility"));
  out.push(P(sop.responsibility));
  out.push(H3("Procedure"));
  out.push(...bullets(sop.procedure));
  out.push(H3("Verification"));
  out.push(P(sop.verification));
  out.push(H3("Records"));
  out.push(...bullets(sop.records));
  out.push(spacer());
  return out;
}

/**
 * Builds an FSVP plan .docx Buffer from wizard answers.
 * @param {object} d - form data collected from the wizard
 * @param {string[]} selectedSops - array of SOP_LIBRARY keys chosen in the wizard
 * @returns {Promise<Buffer>}
 */
async function generateFsvpDocument(d, selectedSops) {
  d = d || {};
  selectedSops = Array.isArray(selectedSops) ? selectedSops : [];
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const children = [];

  children.push(
    new Paragraph({ children: [new TextRun({ text: "Foreign Supplier Verification Program (FSVP) Plan", bold: true, size: 40, color: ORANGE })], spacing: { after: 100 } }),
    new Paragraph({ children: [new TextRun({ text: `Prepared ${today} using the FSVP Builder`, italics: true, size: 20 })], spacing: { after: 200 } }),
    P(
      "This document was generated as an aid for organizing FSVP program documentation under 21 CFR Part 1, Subpart L. It should be reviewed by a qualified individual and does not constitute legal advice.",
      { italics: true, size: 18 }
    ),
    spacer()
  );

  // 1. Company Info
  children.push(H1("1. Importer of Record Information"));
  children.push(...field("Company Name", d.companyName));
  children.push(...field("Company Address", d.companyAddress));
  children.push(...field("Qualified Individual / FSVP Contact", d.contactName));
  children.push(...field("Contact Email", d.contactEmail));
  children.push(...field("Contact Phone", d.contactPhone));
  children.push(...field("FDA Facility/Importer Registration Number", d.fdaRegistration));
  children.push(...field("Unique Facility Identifier (DUNS) — used at CBP entry per 21 CFR 1.509", d.importerDuns));

  // 2. Foreign Supplier
  children.push(H1("2. Foreign Supplier Information"));
  children.push(...field("Supplier Name", d.supplierName));
  children.push(...field("Supplier Address", d.supplierAddress));
  children.push(...field("Country of Production", d.supplierCountry));
  children.push(...field("Supplier Contact", d.supplierContact));
  children.push(...field("Supplier DUNS Number", d.dunsNumber));
  children.push(...field("Recognized-Equivalent Country? (21 CFR 1.513)", d.recognizedEquivalentCountry));

  // 3. Product
  children.push(H1("3. Food Product Description"));
  children.push(...field("Product Name", d.productName));
  children.push(...field("Product Description", d.productDescription));
  children.push(...field("Intended Use", d.intendedUse));
  children.push(...field("Raw Materials / Ingredients of Note", d.rawMaterials));

  // 4. Hazard Analysis
  children.push(H1("4. Hazard Analysis"));
  children.push(P("Regulatory basis: 21 CFR 1.504. A written hazard analysis is required for each food imported, identifying known or reasonably foreseeable biological, chemical, and physical hazards, and evaluating severity and probability absent controls."));

  children.push(H2("Hazard Analysis & Verification-Pathway Decision Tree"));
  children.push(P("Work through these questions for each hazard identified below. This is the FSVP analog to a domestic PCP's CCP decision tree — FSVP has no CCPs, because the foreign supplier (not the importer) applies the control. The question here is whether the hazard requires a control at all, and who is responsible for controlling it, which determines the applicable pathway."));
  children.push(table(
    [700, 3400, 3350, 3350],
    ["Step", "Question", "→ If YES", "→ If NO"],
    [
      dtRow("Q1", "Is this a known or reasonably foreseeable hazard for this food? (§ 1.504(b))", "Go to Q2.", "Not a hazard for FSVP purposes; document and move on."),
      dtRow("Q2", "Is the food “covered produce” under 21 CFR Part 112, and is this a biological hazard?", "Deemed a hazard requiring a control (§ 1.504(e)) — go to Q4.", "Go to Q3."),
      dtRow("Q3", "Weighing severity and probability, would a knowledgeable person establish a control for this hazard? (§ 1.504(c))", "This is a “Hazard Requiring a Control.” Go to Q4.", "Document rationale; no supplier evaluation or verification is required (§ 1.504(f))."),
      dtRow("Q4", "Will this hazard be controlled by your supplier, or an entity upstream of the supplier?", "Go to Q5 — full evaluation/verification pathway.", "Controlled downstream by your customer, or the food cannot be consumed without a later control. Use the § 1.507 Written Assurance pathway instead."),
      dtRow("Q5", "Reasonable probability of serious adverse health consequences or death (SAHCODHA)?", "Onsite audit required before first import and at least annually, unless justified otherwise.", "An activity is still required — select one in Q6."),
      dtRow("Q6", "Based on the supplier evaluation, which activity gives adequate assurance?", "Select: Onsite Audit / Sampling & Testing / Records Review / Other Appropriate Activity.", "—"),
    ]
  ));
  children.push(spacer());
  children.push(H3("A Common Misclassification: Step-Designed Control vs. Reliance on a Prerequisite SOP"));
  children.push(P("A processing step only counts as “designed to eliminate or reduce” a hazard when the step's own process parameters (time, temperature, pH, metal detection, etc.) achieve the reduction and can be monitored at that step. If control instead depends on a supporting SOP (sanitation, allergen changeover, pest control) being followed correctly around the step, the step itself is not the control — the SOP is. When you review a foreign supplier's own hazard analysis under § 1.504(d), check whether their labeled controls are genuinely step-designed, or actually SOP-dependent steps that should be verified directly through records review or audit rather than assumed reliable."));
  children.push(spacer());

  children.push(H3("Hazards Identified for This Product"));
  children.push(...field("Biological Hazards", listOrNone(d.biologicalHazards)));
  children.push(...field("Chemical Hazards", listOrNone(d.chemicalHazards)));
  children.push(...field("Physical Hazards", listOrNone(d.physicalHazards)));
  children.push(...field("Hazard Analysis Notes", d.hazardNotes));
  children.push(...field("Hazard Requiring a Control? (Q3 outcome)", d.hazardRequiringControl));
  children.push(...field("Controlled by Supplier/Upstream, or Downstream/Customer? (Q4 outcome)", d.hazardControlledBy));

  // 5. Approval & Verification
  children.push(H1("5. Supplier Approval & Verification Activities"));
  children.push(...field("Basis for Supplier Approval", d.approvalBasis));
  children.push(...field("Primary Verification Activity (Q5–Q6 outcome)", d.verificationActivity));
  children.push(...field("Verification Frequency", d.verificationFrequency));
  children.push(...field("Justification", d.verificationJustification));

  // 6. Selected SOPs
  if (selectedSops.length) {
    children.push(H1("6. Standard Operating Procedures"));
    children.push(P("The following SOPs were selected in the wizard to operationalize this FSVP, mirroring the SOP set used in the company's domestic PCP, adapted to the FSVP importer's verification role."));
    selectedSops.forEach((key) => {
      const sop = SOP_LIBRARY[key];
      if (sop) children.push(...renderSop(sop));
    });
  }

  // 7. Corrective Actions
  children.push(H1("7. Corrective Actions"));
  children.push(P("Regulatory basis: 21 CFR 1.508."));
  children.push(...field("Corrective Action Procedure", d.correctiveActions));

  // 8. Reassessment
  children.push(H1("8. Reassessment Schedule"));
  children.push(P("Regulatory basis: 21 CFR 1.505(c) — at least every 3 years, or promptly upon new information."));
  children.push(...field("Reassessment Schedule", d.reassessmentSchedule));
  children.push(...field("Date of This Assessment", d.lastReassessmentDate || today));

  // 9. Signature block
  children.push(H1("9. Approval"));
  children.push(
    new Paragraph({ text: "Prepared by (Qualified Individual): ______________________________", spacing: { before: 200, after: 200 } }),
    new Paragraph({ text: "Signature: ______________________________     Date: ______________", spacing: { after: 400 } })
  );
  children.push(P("Generated with the FSVP Builder — a companion tool from FTC International (fsvp.ftcinternational.com).", { italics: true, size: 18, color: "5B6B62" }));

  const doc = new Document({
    numbering: {
      config: [{ reference: "bullet-list", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }] }],
    },
    sections: [
      {
        properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
        headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "FSVP Plan — fsvp.ftcinternational.com", size: 16, color: "999999" })] })] }) },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Page ", size: 16, color: "999999" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "999999" }),
                  new TextRun({ text: " of ", size: 16, color: "999999" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "999999" }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = { generateFsvpDocument, SOP_LIBRARY };
