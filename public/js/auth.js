(function () {
  "use strict";

  function setStatus(el, message, type) {
    if (!message) { el.innerHTML = ""; return; }
    el.innerHTML = '<div class="status-banner ' + (type || "error") + '">' + escapeHtml(message) + "</div>";
  }
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  var loginForm = document.getElementById("loginForm");
  var signupForm = document.getElementById("signupForm");

  function handleSubmit(form, endpoint) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var statusEl = document.getElementById("authStatus");
      var submitBtn = document.getElementById("submitBtn");
      submitBtn.disabled = true;
      setStatus(statusEl, "", null);

      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: document.getElementById("email").value,
          password: document.getElementById("password").value,
        }),
      })
        .then(function (res) {
          return res.json().then(function (body) { return { ok: res.ok, status: res.status, body: body }; });
        })
        .then(function (result) {
          if (!result.ok) {
            setStatus(statusEl, result.body.error || "Something went wrong.", "error");
            submitBtn.disabled = false;
            return;
          }
          window.location.href = "/dashboard.html";
        })
        .catch(function () {
          setStatus(statusEl, "Network error. Please try again.", "error");
          submitBtn.disabled = false;
        });
    });
  }

  if (loginForm) handleSubmit(loginForm, "/api/auth/login");
  if (signupForm) handleSubmit(signupForm, "/api/auth/signup");
})();
