// Helpers

// Toggle password visibility (used across auth pages)
function togglePassword(id) {
  const input = document.getElementById(id);
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
}

// Wire up any eye icons with data-target attributes
document.querySelectorAll(".toggle-eye").forEach((el) => {
  el.addEventListener("click", () => togglePassword(el.dataset.target));
});

// Utility: get token
function getToken() {
  return localStorage.getItem("token");
}

// Utility: authorized fetch
async function apiFetch(url, options = {}) {
  const headers = options.headers || {};
  if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
  return fetch(`http://localhost:4000${url}`, { ...options, headers });
}

// Auth: Login
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const identifier = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Login failed");
        return;
      }

      const { token, user } = data;

      localStorage.setItem("token", token);
      localStorage.setItem("role", user.role);

      if (user.role === "Administrator") {
        window.location.href = "admin_dashboard.html";
      } else if (user.role === "Citizen") {
        window.location.href = "dashboard.html";
      } else {
        alert("Unknown user role");
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred. Please try again.");
    }
  });
}

// Auth: Signup
const signupForm = document.getElementById("signupForm");
if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: document.getElementById("email").value,
        password: document.getElementById("password").value,
        fullName: document.getElementById("fullname").value, // Match HTML id
        phoneNumber: "000-000-0000", // Default value
        address: "Default Address", // Default value
        role: "Citizen", // Hardcoded role
      }),
    });
    const data = await res.json();

    if (res.ok) {
      localStorage.setItem("pendingEmail", data.email);
      window.location.href = "verify-code.html";
    } else {
      alert(data.error || "Signup failed");
    }
  });
}

// Submit Report
document.addEventListener("DOMContentLoaded", () => {
  const requestForm = document.getElementById("requestForm");
  const titleInput = document.getElementById("title");
  const descriptionInput = document.getElementById("description");
  const categorySelect = document.getElementById("category");
  const regionInput = document.getElementById("region");
  const subCityInput = document.getElementById("sub-city");
  const woredaInput = document.getElementById("woreda");
  const attachmentInput = document.getElementById("attachment");

  // Create error elements for inline messages
  const createErrorSpan = (input) => {
    if (!input || !input.parentNode) return null;
    const span = document.createElement("span");
    span.className = "error-message";
    span.style.color = "red";
    span.style.fontSize = "0.9em";
    input.parentNode.appendChild(span);
    return span;
  };

  const titleError = titleInput ? createErrorSpan(titleInput) : null;
  const descError = descriptionInput ? createErrorSpan(descriptionInput) : null;
  const imageError = attachmentInput ? createErrorSpan(attachmentInput) : null;

  if (requestForm) {
    requestForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      // Clear previous errors
      titleError.textContent = "";
      descError.textContent = "";
      imageError.textContent = "";

      const token = localStorage.getItem("token");
      if (!token) {
        alert("You must be logged in first.");
        return;
      }

      const title = titleInput.value.trim();
      const description = descriptionInput.value.trim();
      const category = categorySelect.value;
      const region = regionInput.value.trim();
      const subCity = subCityInput.value.trim();
      const woreda = woredaInput.value.trim();

      // Validation
      let hasError = false;
      if (title.length < 5) {
        titleError.textContent = "Title must be at least 5 characters";
        hasError = true;
      }

      // Image validation
      const fileInput = document.getElementById("attachment");

      if (fileInput.files.length === 0) {
        alert("Please upload an image");
        return;
      }

      const file = fileInput.files[0];
      const allowedTypes = ["image/png", "image/jpeg"];

      if (!allowedTypes.includes(file.type)) {
        alert("Image must be PNG or JPEG");
        return;
      }
      const imagePath = file.name;

      // Combine location
      const location = `${region} / ${subCity} / ${woreda}`;

      const payload = {
        title,
        description,
        category,
        location,
        imagePath,
      };

      try {
        const res = await fetch("/api/requests", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (res.ok) {
          alert("Request submitted successfully!");
          requestForm.reset();
        } else {
          alert(data.error || "Failed to submit request");
        }
      } catch (err) {
        console.error(err);
        alert("Something went wrong");
      }
    });
  }
});

// Search filter
const searchInput = document.getElementById("search");
const reportsTableBody = document.querySelector("#reportsTable tbody");
if (searchInput && reportsTableBody) {
  searchInput.addEventListener("input", () => {
    const q = searchInput.value.toLowerCase();
    Array.from(reportsTableBody.rows).forEach((row) => {
      const text = row.innerText.toLowerCase();
      row.style.display = text.includes(q) ? "" : "none";
    });
  });
}

// Profile
async function loadProfile() {
  const res = await apiFetch("/api/user/profile");
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || "Failed to load profile");
    return;
  }

  const user = data.user;

  const nameParts = user.full_name.split(" ");
  document.getElementById("firstName").value = nameParts[0] || "";
  document.getElementById("lastName").value =
    nameParts.slice(1).join(" ") || "";

  document.getElementById("profileName").textContent = user.full_name;
  document.getElementById("profileEmail").textContent = user.email;

  document.getElementById("email").value = user.email;
  document.getElementById("phone").value = user.phone_number || "";
  document.getElementById("address").value = user.address || "";

  document.getElementById("totalReports").textContent =
    user.total_requests_submitted || 0;
}

if (document.getElementById("profileName")) {
  loadProfile();
}

// Edit toggle
const editBtn = document.getElementById("editBtn");
const actionButtons = document.getElementById("actionButtons");
const profileForm = document.getElementById("profileForm");
const inputs = document.querySelectorAll("input");

if (editBtn && profileForm) {
  editBtn.addEventListener("click", () => {
    inputs.forEach((input) => (input.disabled = false));
    editBtn.style.display = "none";
    actionButtons.style.display = "flex";
    inputs[0].focus();
  });

  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fullName =
      document.getElementById("firstName").value +
      " " +
      document.getElementById("lastName").value;
    const phoneNumber = document.getElementById("phone").value;
    const address = document.getElementById("address").value;

    const res = await apiFetch("/api/user/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fullName, phoneNumber, address }),
    });

    const data = await res.json();
    if (res.ok) {
      alert(data.message || "Profile updated successfully!");
      // Reload the profile data and reset form
      loadProfile();
      inputs.forEach((input) => (input.disabled = true));
      editBtn.style.display = "block";
      actionButtons.style.display = "none";
    } else {
      alert(data.error || "Failed to update profile");
    }
  });

  // Cancel button handler
  const cancelBtn = profileForm.querySelector(".cancel");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", (e) => {
      e.preventDefault();
      // Reload profile to discard changes
      loadProfile();
      inputs.forEach((input) => (input.disabled = true));
      editBtn.style.display = "block";
      actionButtons.style.display = "none";
    });
  }
}
// Notifications
async function loadNotifications() {
  const res = await apiFetch("/api/notifications");
  const data = await res.json();
  const list = document.getElementById("notificationsList");
  if (!list) return;
  list.innerHTML = "";
  data.notifications.forEach((n) => {
    const item = `<li>${n.message} - ${n.sent_date}</li>`;
    list.insertAdjacentHTML("beforeend", item);
  });
}
if (document.getElementById("notificationsList")) {
  loadNotifications();
}

// Navbar Active State
(function setActiveNav() {
  const links = document.querySelectorAll(".main-nav a");
  const path = location.pathname.split("/").pop();
  links.forEach((link) => {
    const href = link.getAttribute("href");
    if (!href) return;
    if (href === path) {
      link.classList.add("nav-btn-active");
    } else {
      link.classList.remove("nav-btn-active");
    }
  });
})();

// Auth: Forgot Password
const forgotForm = document.getElementById("forgotForm");
if (forgotForm) {
  forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = forgotForm.querySelector("input[type='email']").value;
    try {
      const res = await fetch(
        "http://localhost:4000/api/auth/forgot-password",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("pendingEmail", email);
        localStorage.setItem("flow", "reset"); // mark reset flow
        alert("Verification code sent to your email!");
        window.location.href = "verify-code.html";
      } else {
        console.error("Server returned an error status:", res.status);
      }
    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    }
  });
}

//otp verification
document.addEventListener("DOMContentLoaded", () => {
  const verifyForm = document.getElementById("verifyForm");
  const inputs = document.querySelectorAll(".otp-inputs input");
  const resendBtn = document.getElementById("resendBtn");
  const countdownEl = document.getElementById("countdown");
  const otpExpiryMinutes = 10; // 10 minutes

  if (!verifyForm || inputs.length === 0 || !resendBtn || !countdownEl) return;

  // Auto-focus to next input
  inputs.forEach((input, i) => {
    input.addEventListener("input", () => {
      if (input.value.length === 1 && i < inputs.length - 1) {
        inputs[i + 1].focus();
      }
    });
  });

  // Countdown timer
  let countdownInterval;
  function startCountdown(minutes) {
    let timeLeft = minutes * 60;
    resendBtn.classList.add("disabled");
    resendBtn.classList.remove("active");

    countdownInterval = setInterval(() => {
      const m = Math.floor(timeLeft / 60);
      const s = timeLeft % 60;
      countdownEl.textContent = `${m.toString().padStart(2, "0")}:${s
        .toString()
        .padStart(2, "0")}`;

      if (timeLeft <= 0) {
        clearInterval(countdownInterval);
        resendBtn.classList.remove("disabled");
        resendBtn.classList.add("active");
        countdownEl.textContent = "";
      }

      timeLeft--;
    }, 1000);
  }

  startCountdown(otpExpiryMinutes);

  // Submit OTP
  verifyForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const otp = Array.from(inputs)
      .map((i) => i.value)
      .join("");
    if (otp.length !== 6) return alert("Enter the 6-digit code");

    const email = localStorage.getItem("pendingEmail");
    const flow = localStorage.getItem("flow"); // "signup" or "reset"
    if (!email) return alert("No email found. Please sign up again.");

    const endpoint =
      flow === "reset" ? "/api/auth/verify-reset" : "/api/auth/verify-email";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });

      const data = await res.json();

      if (res.ok) {
        if (flow === "reset") {
          localStorage.setItem("resetOtp", otp);
          window.location.href = "reset password.html";
        } else {
          localStorage.removeItem("pendingEmail");
          localStorage.setItem("token", data.token);
          window.location.href = "dashboard.html";
        }
      } else {
        alert(data.error || "Verification failed");
      }
    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    }
  });

  // Resend OTP
  resendBtn.addEventListener("click", async () => {
    if (resendBtn.classList.contains("disabled")) return;

    const email = localStorage.getItem("pendingEmail");
    if (!email) return alert("Email not found.");

    try {
      const res = await fetch("http://localhost:4000/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (res.ok) {
        alert(data.message);
        startCountdown(otpExpiryMinutes);
      } else {
        alert(data.error || "Failed to resend OTP");
      }
    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    }
  });
});

// Reset Password
const resetForm = document.getElementById("resetForm");
if (resetForm) {
  resetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = localStorage.getItem("pendingEmail");
    const otp = localStorage.getItem("resetOtp");
    const newPassword = document.getElementById("new-password").value;
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.removeItem("pendingEmail");
        localStorage.removeItem("resetOtp");
        localStorage.removeItem("flow");
        window.location.href = "passwordsuccess.html";
      } else {
        alert(data.error || "Failed to reset password");
      }
    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    }
  });
}
// Utility for authorized requests
async function loadDashboard() {
  if (!document.getElementById("total-count")) return;

  const token = localStorage.getItem("token");

  try {
    // 1. Fetch Stats
    const statsRes = await fetch("http://localhost:4000/api/requests/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const stats = await statsRes.json();

    // Update UI
    document.getElementById("total-count").textContent = stats.total || 0;
    document.getElementById("pending-count").textContent = stats.pending || 0;
    document.getElementById("resolved-count").textContent = stats.resolved || 0;
    document.getElementById("rejected-count").textContent = stats.rejected || 0;

    // 2. Fetch Recent Requests
    const reqsRes = await fetch("http://localhost:4000/api/requests/my", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await reqsRes.json();
    const container = document.getElementById("requestsContainer");

    const requests = data.requests || [];

    if (requests.length === 0) {
      container.innerHTML = `<p class="empty-state">No recent requests found.</p>`;
      return;
    }

    // Map the status to the CSS classes you have in your <style>
    container.innerHTML = requests
      .slice(0, 5)
      .map((req) => {
        const statusClass = req.status.toLowerCase().replace(/\s+/g, "-");
        return `
        <div class="request-item">
          <div class="request-info">
            <div class="request-title">${req.title}</div>
            <div class="request-meta">
              <span>${req.category}</span>
              <span>${new Date(req.submission_date).toLocaleDateString()}</span>
            </div>
          </div>
          <span class="status-badge status-${statusClass}">
            ${req.status}
          </span>
        </div>
      `;
      })
      .join("");
  } catch (err) {
    console.error("Dashboard load failed", err);
    document.getElementById("requestsContainer").innerHTML =
      "<p>Error loading data.</p>";
  }
}

document.addEventListener("DOMContentLoaded", loadDashboard);

async function loadReports() {
  const tbody = document.getElementById("reportsTableBody");
  const token = localStorage.getItem("token"); // or wherever you store JWT after login
  if (!token) {
    window.location.href = "login.html";
    return;
  }
  const res = await fetch("/api/reports", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
  });

  if (!res.ok) {
    alert("Failed to load reports" + res.status);
    return;
  }

  const { reports } = await res.json();

  document.getElementById("totalReports").textContent = reports.length;

  const active = reports.filter(
    (r) => r.status === "Pending" || r.status === "In Progress"
  ).length;

  const resolved = reports.filter((r) => r.status === "Resolved").length;

  document.getElementById("activeReports").textContent = active;
  document.getElementById("resolvedReports").textContent = resolved;

  tbody.innerHTML = "";

  reports.forEach((r) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td class="id-cell">${r.request_id}</td>
      <td>${r.category}</td>
      <td>
        <strong>${r.title}</strong><br />
        ${r.description}
      </td>
      <td>
        <span class="badge status-${r.status.toLowerCase().replace(" ", "-")}">
          ${r.status}
        </span>
      </td>
      <td>
        <span class="prio-${r.priority.toLowerCase()}">
          ${r.priority}
        </span>
      </td>
      <td>${new Date(r.submission_date).toDateString()}</td>
      
    `;

    tbody.appendChild(tr);
  });
}

document.addEventListener("DOMContentLoaded", loadReports);

const API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:4000"
    : "https://your-deployed-backend-url.com";
const TOKEN = localStorage.getItem("token"); // set after login

if (!TOKEN) {
  console.warn(
    "No JWT token found in localStorage. Redirect to login or set token."
  );
}

const headers = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${TOKEN}`,
});

// Fetch requests with optional filters
async function fetchRequests({
  status,
  category,
  priority,
  fromDate,
  toDate,
  location,
}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (category) params.set("category", category);
  if (priority) params.set("priority", priority);
  // Sorting defaults to submission_date desc; you can expose UI for sort/order if needed
  params.set("sort", "submission_date");
  params.set("order", "desc");

  const url = `${API_BASE}/api/requests?${params.toString()}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch requests");
  const data = await res.json();

  // Client-side filter for date range and location (if backend doesn’t support yet)
  let rows = data.requests || [];
  if (fromDate)
    rows = rows.filter(
      (r) => r.submission_date && r.submission_date.slice(0, 10) >= fromDate
    );
  if (toDate)
    rows = rows.filter(
      (r) => r.submission_date && r.submission_date.slice(0, 10) <= toDate
    );
  if (location) {
    const q = location.toLowerCase();
    rows = rows.filter((r) => (r.location || "").toLowerCase().includes(q));
  }
  return rows;
}

// Update status via PATCH /api/requests/:requestId/status
async function updateStatus(requestId, newStatus, note = "") {
  const res = await fetch(`${API_BASE}/api/requests/${requestId}/status`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ status: newStatus, note }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update status");
  }
  return res.json();
}

// Close request via POST /api/requests/:requestId/close
async function closeRequest(requestId) {
  const res = await fetch(`${API_BASE}/api/requests/${requestId}/close`, {
    method: "POST",
    headers: headers(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to close request");
  }
  return res.json();
}

// Render summary stats
function renderSummary(rows) {
  const total = rows.length;
  const pending = rows.filter((r) => r.status === "Pending").length;
  const inProgress = rows.filter((r) => r.status === "In Progress").length;

  // Resolved today: resolution_date or submission_date if your schema differs
  const today = new Date().toISOString().slice(0, 10);
  const resolvedToday = rows.filter((r) => {
    if (r.status !== "Resolved") return false;
    const d = (r.resolution_date || r.submission_date || "").slice(0, 10);
    return d === today;
  }).length;

  document.getElementById("sum-total").textContent = total;
  document.getElementById("sum-pending").textContent = pending;
  document.getElementById("sum-inprogress").textContent = inProgress;
  document.getElementById("sum-resolved-today").textContent = resolvedToday;
}

// Render table
// Render table
function renderTable(rows) {
  const tbody = document.getElementById("report-table-body");
  tbody.innerHTML = "";

  rows.forEach((r) => {
    const tr = document.createElement("tr");

    // Classes for badges
    const statusClass = `status-badge ${r.status.replace(" ", "\\ ")}`;
    const priorityClass = `priority-${r.priority}`;

    // Display citizen name or fallback
    const submittedBy = r.citizen_name || "Unknown";
    const date = (r.submission_date || "").slice(0, 10);

    // Use request_id as identifier
    const requestId = r.request_id;

    tr.innerHTML = `
      <td>${r.title || "Untitled"}</td>
      <td><span class="${statusClass}">${r.status}</span></td>
      <td><span class="${priorityClass}">${r.priority}</span></td>
      <td>${submittedBy}</td>
      <td>${date}</td>
      <td class="actions">
        <select class="status-select">
          <option value="">Update status...</option>
          <option value="Pending">Pending</option>
          <option value="In Progress">In Progress</option>
          <option value="Resolved">Resolved</option>
          <option value="Closed">Closed</option>
        </select>
        <button class="btn btn-update">Apply</button>
        <button class="btn btn-close">Close</button>
      </td>
    `;

    // Event listeners for status update
    const select = tr.querySelector(".status-select");
    const btnUpdate = tr.querySelector(".btn-update");
    const btnClose = tr.querySelector(".btn-close");

    btnUpdate.addEventListener("click", async () => {
      const newStatus = select.value;
      if (!newStatus) return alert("Select a status to apply.");
      try {
        await updateStatus(requestId, newStatus, "Updated via dashboard");
        await refresh();
      } catch (e) {
        alert(e.message);
      }
    });

    btnClose.addEventListener("click", async () => {
      if (!confirm("Close this request?")) return;
      try {
        await closeRequest(requestId);
        await refresh();
      } catch (e) {
        alert(e.message);
      }
    });

    tbody.appendChild(tr);
  });
}

// Apply filters and refresh data
async function refresh() {
  const status = document.getElementById("status-filter").value || "";
  const priority = document.getElementById("priority-filter").value || "";
  const category = document.getElementById("category-filter").value || "";
  const fromDate = document.getElementById("from-date").value || "";
  const toDate = document.getElementById("to-date").value || "";
  const location = document.getElementById("location-search").value || "";

  try {
    const rows = await fetchRequests({
      status,
      category,
      priority,
      fromDate,
      toDate,
      location,
    });
    renderSummary(rows);
    renderTable(rows);
  } catch (e) {
    console.error(e);
    alert("Failed to load data. Check your token and API.");
  }
}

// Filter listeners
const clearBtn = document.getElementById("btn-clear-filters");

if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    [
      "status-filter",
      "priority-filter",
      "category-filter",
      "from-date",
      "to-date",
      "location-search",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    refresh();
  });
}

document.querySelectorAll(".filters input, .filters select").forEach((el) => {
  el.addEventListener("input", refresh);
  el.addEventListener("change", refresh);
});

// Quick actions (example behaviors)

const totalReportsEl = document.getElementById("totalReports");
if (totalReportsEl) {
  totalReportsEl.textContent = reports.length;
}
const urgentBtn = document.getElementById("btn-urgent");
if (urgentBtn) {
  urgentBtn.addEventListener("click", () => {
    document.getElementById("priority-filter").value = "Critical";
    refresh();
  });
}

document.getElementById("btn-assign").addEventListener("click", () => {
  alert(
    "Assignment UI not implemented—hook into your staff assignment endpoint."
  );
});
document.getElementById("btn-send-updates").addEventListener("click", () => {
  alert(
    "Bulk updates not implemented—use status update per row or add a batch endpoint."
  );
});
document.getElementById("btn-generate-report").addEventListener("click", () => {
  alert("Generate report—hook into your reporting endpoint to export CSV/PDF.");
});

// Initial load
refresh();
