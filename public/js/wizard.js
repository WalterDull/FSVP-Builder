(function () {
  "use strict";

  var STEP_NAMES = [
    "Company Information",
    "Foreign Supplier Information",
    "Food Product Description",
    "Hazard Analysis",
    "Supplier Approval & Verification",
    "Standard Operating Procedures",
    "Corrective Actions",
    "Reassessment Schedule",
    "Review & Save"
  ];

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

  var urlParams = new URLSearchParams(window.location.search);
  var planId = urlParams.get("planId");

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

  function collectData() {
    var data = {};
    var formData = new FormData(form);
    var checkboxGroups = ["biologicalHazards", "chemicalHazards", "physicalHazards", "selectedSops"];

    Array.prototype.slice.call(form.elements).forEach(function (el) {
      if (!el.name) return;
      if (el.type === "checkbox") return;
      data[el.name] = el.value;
    });

    checkboxGroups.forEach(function (name) {
      data[name] = formData.getAll(name);
    });

    return data;
  }

  function populateForm(data) {
    Object.keys(data || {}).forEach(function (key) {
      var val = data[key];
      if (Array.isArray(val)) {
        form.querySelectorAll('[name="' + key + '"]').forEach(function (el) {
          el.checked = val.indexOf(el.value) !== -1;
        });
      } else {
        var el = form.elements[key];
        if (el && !el.length) el.value = val || "";
      }
    });
  }

  function renderSummary() {
    var d = collectData();
    var html = "";

    html += summaryBlock("Company Information", [
      ["Company", d.companyName], ["Address", d.companyAddress], ["Contact", d.contactName],
      ["Email", d.contactEmail], ["Phone", d.contactPhone], ["FDA Registration #", d.fdaRegistration]
    ]);
    html += summaryBlock("Foreign Supplier", [
      ["Supplier", d.supplierName], ["Address", d.supplierAddress], ["Country", d.supplierCountry],
      ["Contact", d.supplierContact], ["DUNS #", d.dunsNumber]
    ]);
    html += summaryBlock("Product", [
      ["Product name", d.productName], ["Description", d.productDescription],
      ["Intended use", d.intendedUse], ["Raw materials", d.rawMaterials]
    ]);
    html += summaryBlock("Hazard Analysis", [
      ["Biological hazards", (d.biologicalHazards || []).join(", ") || "None selected"],
      ["Chemical hazards", (d.chemicalHazards || []).join(", ") || "None selected"],
      ["Physical hazards", (d.physicalHazards || []).join(", ") || "None selected"],
      ["Hazard requiring control?", d.hazardRequiringControl],
      ["Controlled by", d.hazardControlledBy]
    ]);
    html += summaryBlock("Supplier Approval & Verification", [
      ["Approval basis", d.approvalBasis], ["Verification activity", d.verificationActivity],
      ["Frequency", d.verificationFrequency], ["Justification", d.verificationJustification]
    ]);
    html += summaryBlock("Selected SOPs", [
      ["SOPs", (d.selectedSops || []).join(", ") || "None selected"]
    ]);
    html += summaryBlock("Corrective Actions", [["Process", d.correctiveActions]]);
    html += summaryBlock("Reassessment", [["Schedule", d.reassessmentSchedule], ["Assessment date", d.lastReassessmentDate]]);

    summaryContainer.innerHTML = html;
  }

  function summaryBlock(title, rows) {
    var body = rows.map(function (r) {
      return "<dt>" + escapeHtml(r[0]) + "</dt><dd>" + escapeHtml(r[1] || "—") + "</dd>";
    }).join("");
    return '<div class="summary-block"><h3>' + escapeHtml(title) + "</h3><dl>" + body + "</dl></div>";
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
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
          if (plan && plan.data) populateForm(plan.data);
          if (plan && plan.selected_sops) populateForm({ selectedSops: plan.selected_sops });
          showStep(currentStep);
        })
        .catch(function () { showStep(currentStep); });
    } else {
      showStep(currentStep);
    }
  }

  init();
})();
