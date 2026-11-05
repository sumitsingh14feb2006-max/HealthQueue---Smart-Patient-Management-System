#include "httplib.h"
#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <iomanip>
#include <algorithm>
#include <ctime>

using namespace std;
using namespace httplib;

struct Patient {
    string id, appointment, name, phone, problem;
    string priority, status;
    int age;
    long long createdAt;
};

vector<Patient> patients;
int nextId = 101;
int nextAppointment = 1;

const string FILE_NAME = "patients.txt";

// Convert text safely into JSON
string jsonEscape(string s) {
    string out;
    for (char c : s) {
        if (c == '"') out += "\\\"";
        else if (c == '\\') out += "\\\\";
        else if (c == '\n') out += "\\n";
        else out += c;
    }
    return out;
}

// Convert one patient into JSON
string patientJSON(const Patient& p) {
    return "{\"id\":\"" + jsonEscape(p.id) +
        "\",\"appointment\":\"" + jsonEscape(p.appointment) +
        "\",\"name\":\"" + jsonEscape(p.name) +
        "\",\"age\":" + to_string(p.age) +
        ",\"phone\":\"" + jsonEscape(p.phone) +
        "\",\"problem\":\"" + jsonEscape(p.problem) +
        "\",\"priority\":\"" + jsonEscape(p.priority) +
        "\",\"status\":\"" + jsonEscape(p.status) +
        "\",\"createdAt\":" + to_string(p.createdAt) + "}";
}

// ==========================================
// MEMBER 1: PATIENT REGISTRATION & STORAGE
// ==========================================

// Save all patients in a text file
void saveData() {
    ofstream file(FILE_NAME);
    for (const auto& p : patients) {
        file << quoted(p.id) << " "
             << quoted(p.appointment) << " "
             << quoted(p.name) << " "
             << p.age << " "
             << quoted(p.phone) << " "
             << quoted(p.problem) << " "
             << quoted(p.priority) << " "
             << quoted(p.status) << " "
             << p.createdAt << "\n";
    }
}

// Load saved patients when server starts
void loadData() {
    ifstream file(FILE_NAME);
    Patient p;

    while (file >> quoted(p.id)
                >> quoted(p.appointment)
                >> quoted(p.name)
                >> p.age
                >> quoted(p.phone)
                >> quoted(p.problem)
                >> quoted(p.priority)
                >> quoted(p.status)
                >> p.createdAt) {
        patients.push_back(p);

        int idNumber = 0, appointmentNumber = 0;
        try {
            idNumber = stoi(p.id.substr(1));
            appointmentNumber = stoi(p.appointment.substr(2));
        } catch (...) {}

        nextId = max(nextId, idNumber + 1);
        nextAppointment = max(nextAppointment, appointmentNumber + 1);
    }
}

// Register a new patient
void registerPatient(const Request& req, Response& res) {
    if (!req.has_param("name") || !req.has_param("phone") ||
        !req.has_param("problem") || !req.has_param("age") ||
        !req.has_param("priority")) {
        res.status = 400;
        res.set_content("{\"error\":\"Missing patient details\"}", "application/json");
        return;
    }

    Patient p;
    p.id = "P" + to_string(nextId++);
    string appointmentNumber = to_string(nextAppointment++);

p.appointment = "HQ" +
    string(4 - min(4, (int)appointmentNumber.size()), '0')
    + appointmentNumber;
    p.name = req.get_param_value("name");
    p.phone = req.get_param_value("phone");
    p.problem = req.get_param_value("problem");
    p.age = stoi(req.get_param_value("age"));
    p.priority = req.get_param_value("priority");
    p.status = "Waiting";
    p.createdAt = time(nullptr) * 1000LL;

    patients.push_back(p);
    saveData();

    res.set_content(patientJSON(p), "application/json");
}

// ==========================================
// MEMBER 2: PATIENT QUEUE & SEARCH
// ==========================================

// Show all patients, emergency first
void getPatients(const Request& req, Response& res) {
    string result = "[";
    vector<Patient> list = patients;

    stable_sort(list.begin(), list.end(),
        [](const Patient& a, const Patient& b) {
            return a.priority == "Emergency" &&
                   b.priority != "Emergency";
        });

    for (int i = 0; i < (int)list.size(); i++) {
        if (i) result += ",";
        result += patientJSON(list[i]);
    }

    result += "]";
    res.set_content(result, "application/json");
}

// Search patients by name, ID or problem
void searchPatients(const Request& req, Response& res) {
    string q = req.get_param_value("q");
    string result = "[";
    bool first = true;

    for (const auto& p : patients) {
        if (p.name.find(q) != string::npos ||
            p.id.find(q) != string::npos ||
            p.problem.find(q) != string::npos) {
            if (!first) result += ",";
            result += patientJSON(p);
            first = false;
        }
    }

    result += "]";
    res.set_content(result, "application/json");
}

// ==========================================
// MEMBER 3: UPDATE & DELETE PATIENT
// ==========================================

// Update patient information
void updatePatient(const Request& req, Response& res) {
    string id = req.matches[1];

    for (auto& p : patients) {
        if (p.id == id) {
            if (req.has_param("name")) p.name = req.get_param_value("name");
            if (req.has_param("age")) p.age = stoi(req.get_param_value("age"));
            if (req.has_param("phone")) p.phone = req.get_param_value("phone");
            if (req.has_param("problem")) p.problem = req.get_param_value("problem");
            if (req.has_param("priority")) p.priority = req.get_param_value("priority");
            if (req.has_param("status")) p.status = req.get_param_value("status");

            saveData();
            res.set_content(patientJSON(p), "application/json");
            return;
        }
    }

    res.status = 404;
    res.set_content("{\"error\":\"Patient not found\"}", "application/json");
}

// Delete patient record
void deletePatient(const Request& req, Response& res) {
    string id = req.matches[1];

    auto oldSize = patients.size();

    patients.erase(
        remove_if(patients.begin(), patients.end(),
            [&](const Patient& p) { return p.id == id; }),
        patients.end()
    );

    if (patients.size() == oldSize) {
        res.status = 404;
        res.set_content("{\"error\":\"Patient not found\"}", "application/json");
        return;
    }

    saveData();
    res.set_content("{\"message\":\"Patient deleted\"}", "application/json");
}

// ==========================================
// MEMBER 4: EMERGENCY & STATISTICS
// ==========================================

// Show emergency patients
void emergencyPatients(const Request& req, Response& res) {
    string result = "[";
    bool first = true;

    for (const auto& p : patients) {
        if (p.priority == "Emergency") {
            if (!first) result += ",";
            result += patientJSON(p);
            first = false;
        }
    }

    result += "]";
    res.set_content(result, "application/json");
}

// Dashboard statistics
void statistics(const Request& req, Response& res) {
    int waiting = 0, emergency = 0;

    for (const auto& p : patients) {
        if (p.status == "Waiting") waiting++;
        if (p.priority == "Emergency") emergency++;
    }

    string result =
        "{\"total\":" + to_string(patients.size()) +
        ",\"waiting\":" + to_string(waiting) +
        ",\"emergency\":" + to_string(emergency) + "}";

    res.set_content(result, "application/json");
}

// ==========================================
// MAIN: START C++ BACKEND SERVER
// ==========================================

int main() {
    loadData();

    Server server;

    server.Get("/api/patients", getPatients);
    server.Get("/api/search", searchPatients);
    server.Post("/api/patients", registerPatient);

    server.Put(R"(/api/patients/(.*))", updatePatient);
    server.Delete(R"(/api/patients/(.*))", deletePatient);

    server.Get("/api/emergency", emergencyPatients);
    server.Get("/api/stats", statistics);

    // Serve dashboard files from this folder
    server.set_mount_point("/", ".");

    cout << "=================================\n";
    cout << "  HEALTHQUEUE BACKEND SERVER\n";
    cout << "=================================\n";
    cout << "Server running: http://localhost:8080\n";
    cout << "Keep this terminal open.\n";

    server.listen("localhost", 8080);

    return 0;
}