(function () {
  "use strict";

  var STEP_NAMES = [
    "Company Information",
    "Suppliers & Products",
    "Standard Operating Procedures",
    "Corrective Actions",
    "Reassessment Schedule",
    "Review & Save"
  ];
  var ENTRIES_STEP = 2;

  var BIO_HAZARDS = ["Salmonella", "Listeria monocytogenes", "E. coli (pathogenic)", "Norovirus/Hepatitis A", "Parasites", "None identified"];
  var CHEM_HAZARDS = ["Undeclared allergens", "Pesticide residues", "Mycotoxins", "Heavy metals", "Unapproved food additives", "None identified"];
  var PHYS_HAZARDS = ["Glass", "Metal fragments", "Plastic", "Stones/foreign matter", "None identified"];

  var form = document.getElementById("fsvpForm");
  var steps = Array.prototype.slice.call(document.querySelectorAll(".wizard-step"));
  var totalSteps = steps.length;
  var currentStep = 1;

  var prevBtn = document.getElementById("prevBtn");
  var nextBtn = document.getElementById("nextBtn");
  var generateBtn = document.getElementById("generateBtn");
  var progressFill = document.getElementById("progressFill");
  var stepLabel = document.getElementById("stepLabel");
  var stepName = document.getElementById("stepName");
  var statusBanner = document.getElementById("statusBanner");
  var summaryContainer = document.getElementById("summaryContainer");
  var entriesContainer = document.getElementById("entriesContainer");
  var entriesEmptyNote = document.getElementById("entriesEmptyNote");
  var addEntryBtn = document.getElementById("addEntryBtn");

  var urlParams = new URLSearchParams(window.location.search);
  var planId = urlParams.get("planId");

  // ---------- entries state (one per foreign supplier / food product) ----------
  var entries = [];

  function createEmptyEntry() {
    return {
      supplierName: "", supplierAddress: "", supplierCountry: "", supplierContact: "", dunsNumber: "",
      productName: "", productDescription: "", intendedUse: "", rawMaterials: "",
      biologicalHazards: [], chemicalHazards: [], physicalHazards: [], hazardNotes: "",
      hazardRequiringControl: "", hazardControlledBy: "",
      approvalBasis: "", verificationActivity: "", verificationFrequency: "", verificationJustification: ""
    };
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function textField(idx, name, labelText, val, required) {
    return '<div class="field"><label for="entry-' + idx + '-' + name + '">' + labelText + "</label>" +
      '<input type="text" id="entry-' + idx + '-' + name + '" data-idx="' + idx + '" data-field="' + name + '"' + (required ? " required" : "") + ' value="' + escapeHtml(val || "") + '">' +
      (required ? '<p class="error-text">This field is required.</p>' : "") +
      "</div>";
  }
  function textareaField(idx, name, labelText, val, required, placeholder) {
    return '<div class="field"><label for="entry-' + idx + '-' + name + '">' + labelText + "</label>" +
      '<textarea id="entry-' + idx + '-' + name + '" data-idx="' + idx + '" data-field="' + name + '"' + (required ? " required" : "") + (placeholder ? ' placeholder="' + escapeHtml(placeholder) + '"' : "") + ">" + escapeHtml(val || "") + "</textarea>" +
      (required ? '<p class="error-text">This field is required.</p>' : "") +
      "</div>";
  }
  function selectField(idx, name, labelText, val, required, options, hint) {
    var opts = options.map(function (o) {
      var sel = o[0] === (val || "") ? " selected" : "";
      return '<option value="' + escapeHtml(o[0]) + '"' + sel + ">" + escapeHtml(o[1]) + "</option>";
    }).join("");
    return '<div class="field"><label for="entry-' + idx + '-' + name + '">' + labelText + "</label>" +
      '<select id="entry-' + idx + '-' + name + '" data-idx="' + idx + '" data-field="' + name + '"' + (required ? " required" : "") + ">" + opts + "</select>" +
      (hint ? '<p class="hint">' + hint + "</p>" : "") +
      (required ? '<p class="error-text">Please make a selection.</p>' : "") +
      "</div>";
  }
  function checkboxGridField(idx, name, labelText, options, selected) {
    var boxes = options.map(function (opt) {
      var checked = selected.indexOf(opt) !== -1 ? " checked" : "";
      return '<label><input type="checkbox" data-idx="' + idx + '" data-field="' + name + '" value="' + escapeHtml(opt) + '"' + checked + "> " + escapeHtml(opt) + "</label>";
    }).join("");
    return '<div class="field"><label>' + labelText + '</label><div class="checkbox-grid">' + boxes + "</div></div>";
  }

  function entryTitle(e) {
    return (e.supplierName || "Untitled supplier") + " — " + (e.productName || "Untitled product");
  }

  function entryCardHtml(entry, idx) {
    return '<div class="entry-card" data-entry-idx="' + idx + '">' +
      '<div class="entry-card-header"><h3>Entry ' + (idx + 1) + ": " +
      '<span class="entry-title" data-idx="' + idx + '">' + escapeHtml(entryTitle(entry)) + "</span></h3>" +
      '<button type="button" class="entry-remove-btn" data-remove-idx="' + idx + '">Remove</button></div>' +

      '<p class="entry-subhead">Foreign Supplier Information</p>' +
      textField(idx, "supplierName", "Foreign supplier name *", entry.supplierName, true) +
      textareaField(idx, "supplierAddress", "Foreign supplier address *", entry.supplierAddress, true) +
      textField(idx, "supplierCountry", "Country of production *", entry.supplierCountry, true) +
      textField(idx, "supplierContact", "Supplier contact (name / email / phone)", entry.supplierContact, false) +
      textField(idx, "dunsNumber", "DUNS number (if known)", entry.dunsNumber, false) +

      '<p class="entry-subhead">Food Product Description</p>' +
      textField(idx, "productName", "Product name *", entry.productName, true) +
      textareaField(idx, "productDescription", "Product description *", entry.productDescription, true, "Ingredients, form (fresh/frozen/processed), packaging, etc.") +
      selectField(idx, "intendedUse", "Intended use *", entry.intendedUse, true, [["", "Select one"], ["Ready-to-eat", "Ready-to-eat"], ["Further processing required", "Further processing required"], ["Ingredient for manufacturing", "Ingredient for manufacturing"], ["Animal food", "Animal food"], ["Other", "Other"]]) +
      textareaField(idx, "rawMaterials", "Raw materials / ingredients of note", entry.rawMaterials, false, "Especially any known allergens or high-risk ingredients") +

      '<p class="entry-subhead">Hazard Analysis <span style="font-weight:400;text-transform:none;color:var(--muted);">(use the decision tree above)</span></p>' +
      checkboxGridField(idx, "biologicalHazards", "Biological hazards", BIO_HAZARDS, entry.biologicalHazards || []) +
      checkboxGridField(idx, "chemicalHazards", "Chemical hazards", CHEM_HAZARDS, entry.chemicalHazards || []) +
      checkboxGridField(idx, "physicalHazards", "Physical hazards", PHYS_HAZARDS, entry.physicalHazards || []) +
      textareaField(idx, "hazardNotes", "Hazard analysis notes", entry.hazardNotes, false, "Basis for hazard identification (illness data, scientific literature, supplier history, etc.)") +
      selectField(idx, "hazardRequiringControl", "Does this food have a hazard requiring control? (Q3) *", entry.hazardRequiringControl, true, [["", "Select one"], ["Yes", "Yes"], ["No", "No"]]) +
      selectField(idx, "hazardControlledBy", "Who controls this hazard? (Q4)", entry.hazardControlledBy, false, [["", "Select one"], ["Foreign supplier or upstream entity", "Foreign supplier, or an entity upstream of the supplier"], ["Customer or downstream entity", "My customer, or a later entity in distribution"], ["Not applicable / no hazard requiring control", "Not applicable"]], "If your customer or someone downstream controls it, the § 1.507 written-assurance pathway applies instead of full verification.") +

      '<p class="entry-subhead">Supplier Approval &amp; Verification</p>' +
      textareaField(idx, "approvalBasis", "Basis for supplier approval *", entry.approvalBasis, true, "E.g., hazard analysis results, supplier's food safety performance history, applicable FDA food safety regulations, certifications") +
      selectField(idx, "verificationActivity", "Primary verification activity *", entry.verificationActivity, true, [["", "Select one"], ["Onsite audit", "Onsite audit"], ["Sampling and testing", "Sampling and testing of the food"], ["Review of supplier's food safety records", "Review of supplier's relevant food safety records"], ["Other appropriate procedure", "Other appropriate supplier verification procedure"]]) +
      selectField(idx, "verificationFrequency", "Verification frequency *", entry.verificationFrequency, true, [["", "Select one"], ["Prior to first shipment", "Prior to first shipment, then annually"], ["Annually", "Annually"], ["Every shipment", "Every shipment"], ["Other", "Other (see notes)"]]) +
      textareaField(idx, "verificationJustification", "Justification for chosen activity & frequency", entry.verificationJustification, false, "Why this activity/frequency is appropriate given the hazard analysis and supplier's performance") +
      "</div>";
  }

  function renderEntries() {
    if (!entries.length) {
      entriesContainer.innerHTML = "";
      entriesEmptyNote.classList.add("show");
    } else {
      entriesEmptyNote.classList.remove("show");
      entriesContainer.innerHTML = entries.map(entryCardHtml).join("");
    }
  }

  function updateEntryTitle(idx) {
    var el = entriesContainer.querySelector('.entry-title[data-idx="' + idx + '"]');
    if (el) el.textContent = entryTitle(entries[idx]);
  }

  entriesContainer.addEventListener("input", function (e) {
    var t = e.target;
    var idx = t.getAttribute("data-idx");
    var f = t.getAttribute("data-field");
    if (idx === null || !f) return;
    idx = parseInt(idx, 10);
    if (t.type === "checkbox") return; // handled on change
    entries[idx][f] = t.value;
    if (f === "supplierName" || f === "productName") updateEntryTitle(idx);
  });

  entriesContainer.addEventListener("change", function (e) {
    var t = e.target;
    var idx = t.getAttribute("data-idx");
    var f = t.getAttribute("data-field");
    if (idx === null || !f) return;
    idx = parseInt(idx, 10);
    if (t.type === "checkbox") {
      var arr = entries[idx][f] || [];
      var pos = arr.indexOf(t.value);
      if (t.checked && pos === -1) arr.push(t.value);
      if (!t.checked && pos !== -1) arr.splice(pos, 1);
      entries[idx][f] = arr;
    } else {
      entries[idx][f] = t.value;
    }
  });

  entriesContainer.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-remove-idx]");
    if (!btn) return;
    var idx = parseInt(btn.getAttribute("data-remove-idx"), 10);
    if (!confirm("Remove this supplier/product entry?")) return;
    entries.splice(idx, 1);
    renderEntries();
  });

  addEntryBtn.addEventListener("click", function () {
    entries.push(createEmptyEntry());
    renderEntries();
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  });

  // ---------- step navigation ----------
  function showStep(n) {
    steps.forEach(function (el) {
      el.classList.toggle("active", parseInt(el.dataset.step, 10) === n);
    });
    prevBtn.style.display = n === 1 ? "none" : "inline-block";
    nextBtn.style.display = n === totalSteps ? "none" : "inline-block";
    generateBtn.style.display = n === totalSteps ? "inline-block" : "none";
    progressFill.style.width = Math.round((n / totalSteps) * 100) + "%";
    stepLabel.textContent = "Step " + n + " of " + totalSteps;
    stepName.textContent = STEP_NAMES[n - 1];
    if (n === totalSteps) renderSummary();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validateStep(n) {
    var stepEl = steps[n - 1];
    var fields = stepEl.querySelectorAll("[required]");
    var valid = true;
    fields.forEach(function (field) {
      var wrapper = field.closest(".field") || field.closest("fieldset");
      var filled;
      if (field.type === "checkbox" || field.type === "radio") {
        filled = true;
      } else {
        filled = field.value.trim() !== "";
      }
      if (!filled) {
        valid = false;
        if (wrapper) wrapper.classList.add("invalid");
      } else if (wrapper) {
        wrapper.classList.remove("invalid");
      }
    });
    return valid;
  }

  nextBtn.addEventListener("click", function () {
    if (currentStep === ENTRIES_STEP && entries.length === 0) {
      entriesEmptyNote.classList.add("show");
      window.scrollTo({ top: entriesEmptyNote.offsetTop - 100, behavior: "smooth" });
      return;
    }
    if (!validateStep(currentStep)) return;
    if (currentStep < totalSteps) {
      currentStep++;
      showStep(currentStep);
    }
  });

  prevBtn.addEventListener("click", function () {
    if (currentStep > 1) {
      currentStep--;
      showStep(currentStep);
    }
  });

  // ---------- data collection (top-level/shared fields only; entries[] is separate state) ----------
  function collectData() {
    var data = {};
    var formData = new FormData(form);
    var checkboxGroups = ["selectedSops"];

    Array.prototype.slice.call(form.elements).forEach(function (el) {
      if (!el.name) return;
      if (el.type === "checkbox") return;
      data[el.name] = el.value;
    });

    checkboxGroups.forEach(function (name) {
      data[name] = formData.getAll(name);
    });

    data.entries = entries.map(function (e) {
      return {
        supplierName: e.supplierName, supplierAddress: e.supplierAddress, supplierCountry: e.supplierCountry,
        supplierContact: e.supplierContact, dunsNumber: e.dunsNumber,
        productName: e.productName, productDescription: e.productDescription, intendedUse: e.intendedUse, rawMaterials: e.rawMaterials,
        biologicalHazards: (e.biologicalHazards || []).slice(), chemicalHazards: (e.chemicalHazards || []).slice(), physicalHazards: (e.physicalHazards || []).slice(),
        hazardNotes: e.hazardNotes, hazardRequiringControl: e.hazardRequiringControl, hazardControlledBy: e.hazardControlledBy,
        approvalBasis: e.approvalBasis, verificationActivity: e.verificationActivity, verificationFrequency: e.verificationFrequency, verificationJustification: e.verificationJustification
      };
    });

    return data;
  }

  function populateForm(data) {
    Object.keys(data || {}).forEach(function (key) {
      var val = data[key];
      if (Array.isArray(val)) {
        form.querySelectorAll('[name="' + key + '"]').forEach(function (el) {
          el.checked = typeof val[0] === "string" && val.indexOf(el.value) !== -1;
        });
      } else {
        var el = form.elements[key];
        if (el && !el.length) el.value = val || "";
      }
    });
  }

  function summaryBlock(title, rows) {
    var body = rows.map(function (r) {
      return "<dt>" + escapeHtml(r[0]) + "</dt><dd>" + escapeHtml(r[1] || "—") + "</dd>";
    }).join("");
    return '<div class="summary-block"><h3>' + escapeHtml(title) + "</h3><dl>" + body + "</dl></div>";
  }

  function entrySummaryBlock(e, idx) {
    var rows = [
      ["Supplier", e.supplierName], ["Supplier address", e.supplierAddress], ["Country", e.supplierCountry],
      ["Supplier contact", e.supplierContact], ["DUNS #", e.dunsNumber],
      ["Product name", e.productName], ["Description", e.productDescription], ["Intended use", e.intendedUse], ["Raw materials", e.rawMaterials],
      ["Biological hazards", (e.biologicalHazards || []).join(", ") || "None selected"],
      ["Chemical hazards", (e.chemicalHazards || []).join(", ") || "None selected"],
      ["Physical hazards", (e.physicalHazards || []).join(", ") || "None selected"],
      ["Hazard requiring control?", e.hazardRequiringControl], ["Controlled by", e.hazardControlledBy],
      ["Approval basis", e.approvalBasis], ["Verification activity", e.verificationActivity],
      ["Frequency", e.verificationFrequency], ["Justification", e.verificationJustification]
    ];
    return summaryBlock("Entry " + (idx + 1) + ": " + entryTitle(e), rows);
  }

  function renderSummary() {
    var d = collectData();
    var html = "";

    html += summaryBlock("Company Information", [
      ["Company", d.companyName], ["Address", d.companyAddress], ["Contact", d.contactName],
      ["Email", d.contactEmail], ["Phone", d.contactPhone], ["FDA Registration #", d.fdaRegistration]
    ]);

    d.entries.forEach(function (e, idx) {
      html += entrySummaryBlock(e, idx);
    });

    html += summaryBlock("Selected SOPs", [
      ["SOPs", (d.selectedSops || []).join(", ") || "None selected"]
    ]);
    html += summaryBlock("Corrective Actions", [["Process", d.correctiveActions]]);
    html += summaryBlock("Reassessment", [["Schedule", d.reassessmentSchedule], ["Assessment date", d.lastReassessmentDate]]);

    summaryContainer.innerHTML = html;
  }

  generateBtn.addEventListener("click", function () {
    var data = collectData();
    var selectedSops = data.selectedSops || [];
    setStatus("Saving your FSVP plan…", null);
    generateBtn.disabled = true;

    var url = planId ? "/api/plans/" + planId : "/api/plans";
    var method = planId ? "PUT" : "POST";

    fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: data, selectedSops: selectedSops }),
    })
      .then(function (res) {
        if (res.status === 401) { window.location.href = "/login.html"; return null; }
        return res.json().then(function (body) { return { ok: res.ok, body: body }; });
      })
      .then(function (result) {
        if (!result) return;
        if (!result.ok) {
          setStatus(result.body.error || "Could not save your plan.", "error");
          generateBtn.disabled = false;
          return;
        }
        setStatus("Saved. Redirecting to your dashboard…", "success");
        window.location.href = "/dashboard.html";
      })
      .catch(function () {
        setStatus("Network error. Please try again.", "error");
        generateBtn.disabled = false;
      });
  });

  function setStatus(message, type) {
    if (!message) { statusBanner.innerHTML = ""; return; }
    var cls = type ? " " + type : "";
    statusBanner.innerHTML = '<div class="status-banner' + cls + '">' + escapeHtml(message) + "</div>";
  }

  function init() {
    if (planId) {
      fetch("/api/plans/" + planId)
        .then(function (res) {
          if (res.status === 401) { window.location.href = "/login.html"; return null; }
          return res.json();
        })
        .then(function (plan) {
          if (plan && plan.data) {
            populateForm(plan.data);
            if (Array.isArray(plan.data.entries) && plan.data.entries.length) {
              entries = plan.data.entries.map(function (e) {
                return Object.assign(createEmptyEntry(), e);
              });
            } else if (plan.data.supplierName || plan.data.productName) {
              // Legacy plan saved before multi-entry support — migrate its
              // single supplier/product into the first entry.
              entries = [Object.assign(createEmptyEntry(), {
                supplierName: plan.data.supplierName, supplierAddress: plan.data.supplierAddress,
                supplierCountry: plan.data.supplierCountry, supplierContact: plan.data.supplierContact, dunsNumber: plan.data.dunsNumber,
                productName: plan.data.productName, productDescription: plan.data.productDescription,
                intendedUse: plan.data.intendedUse, rawMaterials: plan.data.rawMaterials,
                biologicalHazards: plan.data.biologicalHazards, chemicalHazards: plan.data.chemicalHazards, physicalHazards: plan.data.physicalHazards,
                hazardNotes: plan.data.hazardNotes, hazardRequiringControl: plan.data.hazardRequiringControl, hazardControlledBy: plan.data.hazardControlledBy,
                approvalBasis: plan.data.approvalBasis, verificationActivity: plan.data.verificationActivity,
                verificationFrequency: plan.data.verificationFrequency, verificationJustification: plan.data.verificationJustification
              })];
            } else {
              entries = [createEmptyEntry()];
            }
          } else {
            entries = [createEmptyEntry()];
          }
          if (plan && plan.selected_sops) populateForm({ selectedSops: plan.selected_sops });
          renderEntries();
          showStep(currentStep);
        })
        .catch(function () { entries = [createEmptyEntry()]; renderEntries(); showStep(currentStep); });
    } else {
      entries = [createEmptyEntry()];
      renderEntries();
      showStep(currentStep);
    }
  }

  init();
})();
