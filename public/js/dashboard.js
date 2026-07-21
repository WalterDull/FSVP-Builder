(function () {
  "use strict";

  var listEl = document.getElementById("plansList");
  var statusEl = document.getElementById("statusBanner");

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function setStatus(message, type) {
    if (!message) { statusEl.innerHTML = ""; return; }
    statusEl.innerHTML = '<div class="status-banner ' + (type || "error") + '">' + escapeHtml(message) + "</div>";
  }

  function loadPlans() {
    fetch("/api/plans")
      .then(function (res) {
        if (res.status === 401) { window.location.href = "/login.html"; return null; }
        return res.json();
      })
      .then(function (plans) {
        if (!plans) return;
        if (!plans.length) {
          listEl.innerHTML = '<p class="empty-state">No plans yet. <a href="/wizard.html">Start your first FSVP plan</a>.</p>';
          return;
        }
        listEl.innerHTML = plans.map(renderPlanCard).join("");
        wireButtons();
      })
      .catch(function () {
        listEl.innerHTML = "<p>Could not load your plans. Please refresh.</p>";
      });
  }

  function renderPlanCard(p) {
    var updated = new Date(p.updatedAt).toLocaleDateString();
    var entryCount = p.entryCount || 0;
    var supplierSummary;
    if (!entryCount) {
      supplierSummary = "No suppliers/products added yet";
    } else {
      var names = (p.supplierNames || []).filter(Boolean);
      var shown = names.slice(0, 3).join(", ");
      var extra = names.length > 3 ? " +" + (names.length - 3) + " more" : "";
      supplierSummary = entryCount + (entryCount === 1 ? " supplier/product" : " suppliers/products") + (shown ? ": " + shown + extra : "");
    }
    return (
      '<div class="plan-card" data-id="' + p.id + '">' +
      "<h3>" + escapeHtml(p.companyName || "Untitled plan") + "</h3>" +
      "<p class=\"muted\">" + escapeHtml(supplierSummary) + " &middot; Updated " + updated + "</p>" +
      '<div class="plan-actions">' +
      (p.unlocked
        ? '<a class="btn btn-primary" href="/api/plans/' + p.id + '/download">Download .docx</a>'
        : '<button class="btn btn-primary unlock-btn" data-id="' + p.id + '">Unlock This Plan</button>') +
      '<a class="btn btn-secondary" href="/wizard.html?planId=' + p.id + '">Edit</a>' +
      "</div></div>"
    );
  }

  function wireButtons() {
    document.querySelectorAll(".unlock-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var planId = btn.getAttribute("data-id");
        btn.disabled = true;
        fetch("/api/billing/checkout/" + planId, { method: "POST" })
          .then(function (res) { return res.json(); })
          .then(function (body) {
            if (body.url) {
              window.location.href = body.url;
              return;
            }
            // No Stripe configured — try the dev-unlock fallback (only works
            // while ALLOW_FREE_UNLOCK=true and Stripe isn't configured).
            return fetch("/api/billing/dev-unlock/" + planId, { method: "POST" })
              .then(function (res) { return res.json().then((b) => ({ ok: res.ok, body: b })); })
              .then(function (r) {
                if (r.ok) { setStatus("Plan unlocked (dev mode).", "success"); loadPlans(); }
                else { setStatus(r.body.error || "Could not unlock this plan.", "error"); btn.disabled = false; }
              });
          })
          .catch(function () {
            setStatus("Could not start checkout. Please try again.", "error");
            btn.disabled = false;
          });
      });
    });
  }

  document.getElementById("logoutLink").addEventListener("click", function (e) {
    e.preventDefault();
    fetch("/api/auth/logout", { method: "POST" }).then(function () {
      window.location.href = "/";
    });
  });

  loadPlans();
})();
