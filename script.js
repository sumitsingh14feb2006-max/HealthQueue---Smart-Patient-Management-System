"use strict";

/* =====================================
   HEALTHQUEUE - COMPLETE JAVASCRIPT
   Frontend: localhost:8080
   Backend API: /api
===================================== */

const API = "/api";
const $ = id => document.getElementById(id);

let patients = [];
let editId = null;
let currentView = "dashboard";

const DOCTORS = [
    "Dr. Rahul Verma",
    "Dr. Priya Sharma",
    "Dr. Amit Kapoor",
    "Dr. Neha Singh",
    "Dr. Arjun Mehta"
];

const RESERVE = [
    "Dr. Karan Malhotra",
    "Dr. Simran Kaur",
    "Dr. Vivek Sharma",
    "Dr. Anjali Gupta",
    "Dr. Rohan Mehta"
];

const VIEW_MAP = {
    dashboard: "dashboard-section",
    register: "register-section",
    records: "records-section",
    queue: "records-section",
    emergency: "emergency-section",
    reserve: "reserve-section"
};

/* ---------- SAFE HTML ---------- */

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function safeId(value) {
    return encodeURIComponent(String(value ?? ""));
}

/* ---------- NAVIGATION ---------- */

window.showView = function(view) {
    const targetId = VIEW_MAP[view];

    if (!targetId) {
        console.error("Unknown view:", view);
        return;
    }

    currentView = view;

    Object.values(VIEW_MAP).forEach(id => {
        const section = $(id);
        if (section) {
            section.hidden = id !== targetId;
            section.style.display = id === targetId ? "block" : "none";
        }
    });

    document.querySelectorAll("[data-view]").forEach(link => {
        link.classList.toggle("active", link.dataset.view === view);
    });

    if (targetId === "records-section") {
        if ($("table-title")) {
            $("table-title").textContent =
                view === "queue" ? "Patient Queue" : "Patient Records";
        }
        showPatients();
    }

    if (targetId === "emergency-section") showEmergency();

    if (targetId === "reserve-section") renderReserveDoctors();

    if (targetId === "dashboard-section") updateDashboard();
};

document.addEventListener("click", function(event) {
    const link = event.target.closest("[data-view]");
    if (!link) return;

    event.preventDefault();
    window.showView(link.dataset.view);
});

/* ---------- BACKEND REQUEST ---------- */

async function request(path, method = "GET", data = null) {
    const options = { method };

    if (data && method !== "GET") {
        const body = new URLSearchParams();

        Object.entries(data).forEach(([key, value]) => {
            body.append(key, value == null ? "" : String(value));
        });

        options.headers = {
            "Content-Type": "application/x-www-form-urlencoded"
        };

        options.body = body.toString();
    }

    const response = await fetch(API + path, options);

    if (!response.ok) {
        throw new Error("Server error: HTTP " + response.status);
    }

    const result = await response.json();

    if (result && result.success === false) {
        throw new Error(result.message || "Backend request failed");
    }

    return result;
}

/* ---------- NOTIFICATION ---------- */

function showMessage(message, type = "success") {
    let box = $("app-message");

    if (!box) {
        box = document.createElement("div");
        box.id = "app-message";

        box.style.cssText = `
            position:fixed;
            top:20px;
            right:20px;
            z-index:999999;
            max-width:90%;
            padding:14px 20px;
            border-radius:10px;
            color:white;
            font-weight:600;
            box-shadow:0 4px 15px #0002;
        `;

        document.body.appendChild(box);
    }

    box.textContent = message;
    box.style.background = type === "error" ? "#dc2626" : "#15803d";
    box.style.display = "block";

    clearTimeout(window.healthQueueMessageTimer);

    window.healthQueueMessageTimer = setTimeout(() => {
        box.style.display = "none";
    }, 3500);
}

/* ---------- DOCTOR AVAILABILITY ---------- */

function activePatients() {
    return patients.filter(p => p.status !== "Completed");
}

function doctorPatient(doctor, excludeId = null) {
    return activePatients().find(p =>
        p.doctor === doctor &&
        String(p.id) !== String(excludeId)
    );
}

function availableDoctors(excludeId = null) {
    return DOCTORS.filter(d => !doctorPatient(d, excludeId));
}

function availableReserveDoctors(excludeId = null) {
    return RESERVE.filter(d => !doctorPatient(d, excludeId));
}

function allocateRegularDoctor(excludeId = null, oldDoctor = "") {
    if (
        DOCTORS.includes(oldDoctor) &&
        !doctorPatient(oldDoctor, excludeId)
    ) {
        return oldDoctor;
    }

    return availableDoctors(excludeId)[0] || "Pending Assignment";
}

/* ---------- RESERVE DOCTOR POPUP ---------- */

function chooseReserveDoctor(excludeId = null) {
    return new Promise(resolve => {
        $("reserve-doctor-popup")?.remove();

        const popup = document.createElement("div");
        popup.id = "reserve-doctor-popup";

        popup.style.cssText = `
            position:fixed;
            inset:0;
            background:rgba(0,0,0,.65);
            display:flex;
            align-items:center;
            justify-content:center;
            z-index:999999;
            padding:15px;
        `;

        const available = availableReserveDoctors(excludeId);

        popup.innerHTML = `
            <div style="
                width:100%;
                max-width:430px;
                max-height:85vh;
                overflow:auto;
                background:white;
                color:#222;
                border-radius:16px;
                padding:24px;
                font-family:Arial,sans-serif;
            ">
                <h2 style="margin:0 0 8px;color:#172554">
                    Select Reserve Doctor
                </h2>
                <p style="margin-bottom:18px">
                    Choose a doctor for this Critical patient.
                </p>
                <div id="reserve-choice-list"></div>
                <button type="button" id="cancel-reserve-choice"
                    style="
                        width:100%;
                        padding:12px;
                        margin-top:12px;
                        border:0;
                        border-radius:8px;
                        cursor:pointer;
                        background:#eee;
                    ">
                    Cancel
                </button>
            </div>
        `;

        document.body.appendChild(popup);

        const list = popup.querySelector("#reserve-choice-list");

        RESERVE.forEach((doctor, index) => {
            const busy = !available.includes(doctor);
            const button = document.createElement("button");

            button.type = "button";
            button.disabled = busy;

            button.style.cssText = `
                width:100%;
                display:flex;
                justify-content:space-between;
                padding:13px;
                margin:7px 0;
                border:1px solid #ddd;
                border-radius:9px;
                background:${busy ? "#eee" : "#eff6ff"};
                color:${busy ? "#999" : "#173b70"};
                cursor:${busy ? "not-allowed" : "pointer"};
                font-weight:600;
                text-align:left;
            `;

            button.innerHTML = `
                <span>${index + 1}. ${escapeHTML(doctor)}</span>
                <span>${busy ? "Busy" : "Available"}</span>
            `;

            button.addEventListener("click", () => {
                popup.remove();
                resolve(doctor);
            });

            list.appendChild(button);
        });

        if (!available.length) {
            list.innerHTML = `
                <p style="color:#dc2626">
                    All reserve doctors are currently busy.
                    Patient will remain Pending Assignment.
                </p>
                <button type="button" id="continue-pending"
                    style="padding:12px;width:100%;border:0;
                    border-radius:8px;background:#fee2e2">
                    Continue as Pending Assignment
                </button>
            `;

            list.querySelector("#continue-pending")
                .addEventListener("click", () => {
                    popup.remove();
                    resolve("Pending Assignment");
                });
        }

        popup.querySelector("#cancel-reserve-choice")
            .addEventListener("click", () => {
                popup.remove();
                resolve(null);
            });

        popup.addEventListener("click", event => {
            if (event.target === popup) {
                popup.remove();
                resolve(null);
            }
        });
    });
}

/* ---------- LOAD PATIENTS ---------- */

async function loadData() {
    const status = $("connection-status");

    try {
        const result = await request("/patients");

        patients = Array.isArray(result)
            ? result
            : Array.isArray(result.patients)
                ? result.patients
                : [];

        if (status) {
            status.innerHTML =
                '<span class="status-dot"></span> Backend Connected';
            status.style.color = "#16a34a";
        }

        renderAll();

    } catch (error) {
        console.error("Backend connection error:", error);

        if (status) {
            status.innerHTML =
                '<span class="status-dot"></span> Backend Disconnected';
            status.style.color = "#dc2626";
        }

        showMessage(error.message, "error");
    }
}

/* ---------- RENDER ALL ---------- */

function renderAll() {
    showPatients();
    showEmergency();
    updateDashboard();
    renderDashboardDoctors();
    renderReserveDoctors();
    drawPatientChart();
}

/* ---------- DASHBOARD ---------- */

function updateDashboard() {
    const total = patients.length;
    const waiting = patients.filter(p => p.status === "Waiting").length;

    const emergency = patients.filter(p =>
        p.priority === "Emergency" || p.priority === "Critical"
    ).filter(p => p.status !== "Completed").length;

    const available = availableDoctors().length;

    const values = {
        "total-patients": total,
        "waiting-patients": waiting,
        "emergency-patients": emergency,
        "available-doctors": available,
        "record-count": total,
        "total-reserve": RESERVE.length,
        "available-reserve": availableReserveDoctors().length,
        "assigned-reserve": RESERVE.length - availableReserveDoctors().length
    };

    Object.entries(values).forEach(([id, value]) => {
        if ($(id)) $(id).textContent = value;
    });
}

/* ---------- REGULAR DOCTOR DIRECTORY ---------- */

function renderDashboardDoctors() {
    const container = $("dashboard-doctor-list");
    if (!container) return;

    container.innerHTML = DOCTORS.map(doctor => {
        const busy = doctorPatient(doctor);

        return `
            <div class="doctor-item"
                style="display:flex;justify-content:space-between;padding:9px 0">
                <span>${escapeHTML(doctor)}</span>
                <strong style="color:${busy ? "#dc2626" : "#16a34a"}">
                    ${busy ? "Busy" : "Available"}
                </strong>
            </div>
        `;
    }).join("");
}

/* ---------- RESERVE DOCTOR DIRECTORY ---------- */

function renderReserveDoctors() {
    const container = $("reserve-doctor-list");

    if (container) {
        container.innerHTML = RESERVE.map((doctor, index) => {
            const busy = doctorPatient(doctor);

            return `
                <div style="
                    display:flex;
                    justify-content:space-between;
                    padding:12px;
                    margin:6px 0;
                    border:1px solid #e5e7eb;
                    border-radius:8px">
                    <span>${index + 1}. ${escapeHTML(doctor)}</span>
                    <strong style="color:${busy ? "#dc2626" : "#16a34a"}">
                        ${busy ? "Busy" : "Available"}
                    </strong>
                </div>
            `;
        }).join("");
    }

    const pending = $("pending-reserve-list");
    if (!pending) return;

    const list = patients.filter(p =>
        p.priority === "Critical" &&
        (!p.doctor ||
         p.doctor === "Pending Assignment" ||
         p.doctor === "Not Assigned") &&
        p.status !== "Completed"
    );

    pending.innerHTML = list.length
        ? list.map(p => `
            <div style="padding:12px;border-bottom:1px solid #eee">
                <strong>${escapeHTML(p.name)}</strong>
                <span> (${escapeHTML(p.id)})</span>
                <button type="button" data-action="assign"
                    data-id="${escapeHTML(p.id)}">
                    Assign Doctor
                </button>
            </div>
        `).join("")
        : "<p>No pending assignments.</p>";
}

/* ---------- PATIENT RECORDS ---------- */

function showPatients() {
    const body = $("patient-table-body");
    if (!body) return;

    const search = ($("search-patient")?.value || "").toLowerCase().trim();
    const priority = $("priority-filter")?.value || "All";
    const status = $("status-filter")?.value || "All";

    let filtered = patients.filter(p => {
        const searchable = [
            p.id, p.name, p.phone, p.problem, p.doctor
        ].join(" ").toLowerCase();

        return searchable.includes(search) &&
            (priority === "All" || p.priority === priority) &&
            (status === "All" || p.status === status);
    });

    if (currentView === "queue") {
        filtered = filtered.filter(p => p.status !== "Completed");
    }

    body.innerHTML = filtered.map((p, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${escapeHTML(p.id)}</td>
            <td>${escapeHTML(p.name)}</td>
            <td>${escapeHTML(p.age)}</td>
            <td>${escapeHTML(p.problem)}</td>
            <td>${escapeHTML(p.priority)}</td>
            <td>${escapeHTML(p.status || "Waiting")}</td>
            <td>${escapeHTML(p.appointment || "—")}</td>
            <td>${escapeHTML(p.doctor || "Pending Assignment")}</td>
            <td>
                <button type="button" data-action="edit"
                    data-id="${escapeHTML(p.id)}">Edit</button>

                ${p.status !== "Completed" ? `
                    <button type="button" data-action="complete"
                        data-id="${escapeHTML(p.id)}">Complete</button>
                ` : ""}

                <button type="button" data-action="delete"
                    data-id="${escapeHTML(p.id)}">Delete</button>

                <button type="button" data-action="whatsapp"
                    data-id="${escapeHTML(p.id)}"
                    style="background:#25D366;color:white">
                    WhatsApp
                </button>
            </td>
        </tr>
    `).join("");

    if (!filtered.length) {
        body.innerHTML =
            '<tr><td colspan="10">No patients found.</td></tr>';
    }

    if ($("record-count")) {
        $("record-count").textContent =
            `${filtered.length} Patient(s)`;
    }
}

/* ---------- EMERGENCY TABLE ---------- */

function showEmergency() {
    const body = $("emergency-table-body");
    if (!body) return;

    const list = patients.filter(p =>
        (p.priority === "Emergency" || p.priority === "Critical") &&
        p.status !== "Completed"
    );

    body.innerHTML = list.map(p => `
        <tr>
            <td>${escapeHTML(p.name)} (${escapeHTML(p.id)})</td>
            <td>${escapeHTML(p.phone || "—")}</td>
            <td>${escapeHTML(p.problem)}</td>
            <td>${escapeHTML(p.priority)}</td>
            <td>
                ${escapeHTML(p.doctor || "Pending Assignment")}
                ${p.priority === "Critical" &&
                  (!p.doctor || p.doctor === "Pending Assignment") ? `
                    <button type="button" data-action="assign"
                        data-id="${escapeHTML(p.id)}">
                        Assign
                    </button>
                ` : ""}
            </td>
        </tr>
    `).join("");

    if (!list.length) {
        body.innerHTML =
            '<tr><td colspan="5">No emergency patients.</td></tr>';
    }

    const cards = $("emergency-list");

    if (cards) {
        cards.innerHTML = list.length
            ? list.map(p => `
                <div class="emergency-item" style="padding:10px;border-bottom:1px solid #eee">
                    <strong>${escapeHTML(p.name)}</strong>
                    <p>${escapeHTML(p.priority)} | ${escapeHTML(p.problem)}</p>
                    <p>Doctor: ${escapeHTML(p.doctor || "Pending Assignment")}</p>
                </div>
            `).join("")
            : '<p class="empty-message">No emergency patients.</p>';
    }
}

/* ---------- PATIENT FORM ---------- */

function setupPatientForm() {
    const form = $("patient-form");
    if (!form || form.dataset.initialized === "true") return;

    form.dataset.initialized = "true";

    form.addEventListener("submit", async function(event) {
        event.preventDefault();

        const data = {
            name: $("patient-name")?.value.trim() || "",
            age: $("patient-age")?.value || "",
            phone: $("patient-phone")?.value.trim() || "",
            problem: $("patient-problem")?.value.trim() || "",
            priority: $("patient-priority")?.value || "Normal"
        };

        if (!data.name || !data.age || !data.phone || !data.problem) {
            showMessage("Please fill all patient details.", "error");
            return;
        }

        if (!/^\d{10}$/.test(data.phone)) {
            showMessage("Enter a valid 10-digit mobile number.", "error");
            return;
        }

        const oldPatient = patients.find(p =>
            String(p.id) === String(editId)
        );

        const saveButton = $("save-button");
        if (saveButton) {
            saveButton.disabled = true;
            saveButton.textContent = "Saving...";
        }

        try {
            if (data.priority === "Critical") {
                const selected = await chooseReserveDoctor(editId);

                if (selected === null) return;

                data.doctor = selected;
            } else {
                data.doctor = allocateRegularDoctor(
                    editId,
                    oldPatient?.doctor || ""
                );
            }

            if (editId !== null) {
                await request(
                    "/patients/" + safeId(editId),
                    "PUT",
                    data
                );

                showMessage("Patient updated successfully!");
            } else {
                await request("/patients", "POST", data);
                showMessage("Patient registered successfully!");
            }

            editId = null;
            form.reset();

            if ($("doctor-info")) $("doctor-info").hidden = true;

            if ($("form-title")) {
                $("form-title").textContent = "Register New Patient";
            }

            if (saveButton) {
                saveButton.textContent = "Register Patient";
            }

            await loadData();
            window.showView("records");

        } catch (error) {
            console.error("Patient save error:", error);
            showMessage(error.message || "Unable to save patient.", "error");

        } finally {
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.textContent =
                    editId !== null ? "Update Patient" : "Register Patient";
            }
        }
    });

    $("patient-priority")?.addEventListener("change", function() {
        const info = $("doctor-info");
        const name = $("allotted-doctor-name");

        if (!info || !name) return;

        if (this.value === "Critical") {
            info.hidden = false;
            name.textContent = "Select a reserve doctor after submitting.";
        } else {
            info.hidden = false;
            name.textContent = "Regular doctor will be assigned on submission.";
        }
    });
}

/* ---------- EDIT PATIENT ---------- */

window.editPatient = function(id) {
    const p = patients.find(item =>
        String(item.id) === String(id)
    );

    if (!p) {
        showMessage("Patient not found.", "error");
        return;
    }

    editId = p.id;

    $("patient-name").value = p.name || "";
    $("patient-age").value = p.age || "";
    $("patient-phone").value = p.phone || "";
    $("patient-problem").value = p.problem || "";
    $("patient-priority").value = p.priority || "Normal";

    if ($("form-title")) {
        $("form-title").textContent = "Update Patient Details";
    }

    if ($("save-button")) {
        $("save-button").textContent = "Update Patient";
    }

    if ($("doctor-info")) {
        $("doctor-info").hidden = false;
    }

    if ($("allotted-doctor-name")) {
        $("allotted-doctor-name").textContent =
            p.doctor || "Doctor will be assigned";
    }

    window.showView("register");
};

/* ---------- ASSIGN RESERVE DOCTOR ---------- */

window.assignReserveDoctor = async function(id) {
    const patient = patients.find(p =>
        String(p.id) === String(id)
    );

    if (!patient || patient.priority !== "Critical") {
        showMessage("Only Critical patients can use reserve doctors.", "error");
        return;
    }

    const doctor = await chooseReserveDoctor(id);
    if (doctor === null) return;

    try {
        await request(
            "/patients/" + safeId(id),
            "PUT",
            { doctor: doctor }
        );

        showMessage(
            doctor === "Pending Assignment"
                ? "Patient remains Pending Assignment."
                : doctor + " assigned successfully!"
        );

        await loadData();

    } catch (error) {
        console.error(error);
        showMessage(error.message, "error");
    }
};

/* ---------- COMPLETE PATIENT ---------- */

window.completePatient = async function(id) {
    if (!confirm("Mark this patient as completed?")) return;

    try {
        await request(
            "/patients/" + safeId(id),
            "PUT",
            {
                status: "Completed",
                doctor: "Not Assigned"
            }
        );

        showMessage("Patient completed. Doctor released.");
        await loadData();

    } catch (error) {
        console.error(error);
        showMessage(error.message, "error");
    }
};

/* ---------- DELETE PATIENT ---------- */

window.deletePatient = async function(id) {
    if (!confirm("Are you sure you want to delete this patient?")) return;

    try {
        await request(
            "/patients/" + safeId(id),
            "DELETE"
        );

        showMessage("Patient deleted successfully.");
        await loadData();

    } catch (error) {
        console.error(error);
        showMessage(error.message, "error");
    }
};

/* ---------- WHATSAPP ---------- */

window.sendWhatsApp = function(id) {
    const p = patients.find(item =>
        String(item.id) === String(id)
    );

    if (!p) return;

    const phone = String(p.phone || "").replace(/\D/g, "");

    if (phone.length !== 10) {
        showMessage("Patient phone number is invalid.", "error");
        return;
    }

    const message =
        `Hello ${p.name},\n\n` +
        `Your appointment details:\n` +
        `Patient ID: ${p.id}\n` +
        `Problem: ${p.problem}\n` +
        `Priority: ${p.priority}\n` +
        `Appointment: ${p.appointment || "As scheduled"}\n` +
        `Doctor Allotted: ${p.doctor || "Pending Assignment"}\n\n` +
        `Your Smile, Our Happiness. ❤️`;

    const url =
        "https://wa.me/91" + phone +
        "?text=" + encodeURIComponent(message);

    window.open(url, "_blank", "noopener");
};

/* ---------- TABLE ACTION HANDLER ---------- */

document.addEventListener("click", function(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.action;

    if (!id) return;

    if (action === "edit") window.editPatient(id);
    if (action === "complete") window.completePatient(id);
    if (action === "delete") window.deletePatient(id);
    if (action === "whatsapp") window.sendWhatsApp(id);
    if (action === "assign") window.assignReserveDoctor(id);
});

/* ---------- FILTERS ---------- */

function setupFilters() {
    $("search-patient")?.addEventListener("input", showPatients);
    $("priority-filter")?.addEventListener("change", showPatients);
    $("status-filter")?.addEventListener("change", showPatients);

    $("apply-filter")?.addEventListener("click", showPatients);

    $("clear-filter")?.addEventListener("click", function() {
        if ($("search-patient")) $("search-patient").value = "";
        if ($("priority-filter")) $("priority-filter").value = "All";
        if ($("status-filter")) $("status-filter").value = "All";

        showPatients();
    });
}

/* ---------- CANCEL FORM ---------- */

function setupCancel() {
    const button = $("cancel-registration");
    if (!button || button.dataset.initialized === "true") return;

    button.dataset.initialized = "true";

    button.addEventListener("click", function() {
        $("patient-form")?.reset();
        editId = null;

        if ($("form-title")) {
            $("form-title").textContent = "Register New Patient";
        }

        if ($("save-button")) {
            $("save-button").textContent = "Register Patient";
        }

        if ($("doctor-info")) {
            $("doctor-info").hidden = true;
        }

        window.showView("dashboard");
    });
}

/* ---------- PATIENT ANALYTICS ---------- */

function drawPatientChart() {
    const canvas = $("patient-chart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.clientWidth || 500;
    const height = 240;
    const ratio = window.devicePixelRatio || 1;

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.height = height + "px";

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const counts = [
        patients.filter(p => p.priority === "Normal").length,
        patients.filter(p => p.priority === "Emergency").length,
        patients.filter(p => p.priority === "Critical").length
    ];

    const labels = ["Normal", "Emergency", "Critical"];
    const colors = ["#2563eb", "#f59e0b", "#dc2626"];

    const max = Math.max(...counts, 1);
    const barWidth = Math.min(65, width / 6);
    const positions = [
        width * 0.22,
        width * 0.50,
        width * 0.78
    ];

    ctx.font = "13px Arial";
    ctx.textAlign = "center";

    counts.forEach((count, i) => {
        const barHeight = (count / max) * 145;
        const x = positions[i] - barWidth / 2;
        const y = 185 - barHeight;

        ctx.fillStyle = colors[i];
        ctx.fillRect(x, y, barWidth, barHeight);

        ctx.fillStyle = "#222";
        ctx.fillText(String(count), positions[i], y - 9);
        ctx.fillText(labels[i], positions[i], 210);
    });
}

/* ---------- DATE ---------- */

function updateDate() {
    const element = $("current-date");
    if (!element) return;

    element.textContent = new Date().toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

/* ---------- INITIALIZATION ---------- */

function initializeHealthQueue() {
    console.log("HealthQueue JavaScript loaded.");

    updateDate();
    setupPatientForm();
    setupCancel();
    setupFilters();

    window.showView("dashboard");

    loadData();
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeHealthQueue,
        { once: true }
    );
} else {
    initializeHealthQueue();
}

window.addEventListener("resize", drawPatientChart);n