/* ==========================================================================
   ICU Smart Alarm Reduction Dashboard Logic
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // --- System State ---
    let smartEngineEnabled = true;
    let audioMuted = false;
    let rawAlarmCount = 0;
    let suppressedAlarmCount = 0;
    let timeSavedSeconds = 0;

    // System Patient State & Custom Safety Boundary Limits
    const patientState = {
        hr: 72,
        spo2: 98,
        sysBP: 120,
        diaBP: 80,
        rr: 16,
        sqi: 96,
        bpSysMax: 140,
        bpDiaMax: 90,
        hrMax: 120,
        hrMin: 50,
        spo2Min: 90,
        rrMax: 24,
        docName: 'Dr. Sarah Jenkins, MD',
        docPhone: '+1-555-0192',
        nurseName: 'Nurse Emily Watson, RN',
        nursePhone: '+1-555-0144',
        phoneRole: 'nurse',
        activeScenario: 'normal',
        scenarioTimer: null,
        delayInterval: null
    };

    // --- AMMA ICU SENTINEL Authentication Directory & Persistence ---
    let USER_ACCOUNTS = {
        doctor: { pass: 'amma123', name: 'Dr. Sarah Jenkins, MD', role: 'doctor', phone: '+1-555-0192', icon: 'fa-user-doctor' },
        dr_sharma: { pass: 'amma123', name: 'Dr. Sharma, MD', role: 'doctor', phone: '+1-555-0198', icon: 'fa-user-doctor' },
        nurse: { pass: 'amma123', name: 'Nurse Emily Watson, RN', role: 'nurse', phone: '+1-555-0144', icon: 'fa-user-nurse' },
        admin: { pass: 'amma123', name: 'Admin - AMMA ICU SENTINEL', role: 'admin', phone: '+1-555-0100', icon: 'fa-user-shield' }
    };

    function loadStaffAccounts() {
        try {
            const saved = localStorage.getItem('amma_staff_accounts');
            if (saved) {
                const parsed = JSON.parse(saved);
                USER_ACCOUNTS = { ...USER_ACCOUNTS, ...parsed };
            }
        } catch (e) {
            console.error('Failed to load staff accounts:', e);
        }
    }
    loadStaffAccounts();

    function saveStaffAccounts() {
        try {
            localStorage.setItem('amma_staff_accounts', JSON.stringify(USER_ACCOUNTS));
        } catch (e) {
            console.error('Failed to save staff accounts:', e);
        }
    }

    function applyRolePermissions(currentUserKey) {
        const tabAdminBtn = document.getElementById('tabAdminBtn');
        const btnExportCSVNav = document.getElementById('btnExportCSVNav');
        const currentUser = sessionStorage.getItem('amma_user') || currentUserKey;
        const user = USER_ACCOUNTS[currentUser];

        if (user && user.role === 'admin') {
            if (tabAdminBtn) tabAdminBtn.classList.remove('hidden');
            if (btnExportCSVNav) btnExportCSVNav.classList.remove('hidden');
            renderStaffDirectoryTable();
        } else {
            if (tabAdminBtn) tabAdminBtn.classList.add('hidden');
            if (btnExportCSVNav) btnExportCSVNav.classList.add('hidden');
        }
    }

    function loadActiveDutyStaff() {
        try {
            const saved = localStorage.getItem('amma_active_duty');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.docName) patientState.docName = parsed.docName;
                if (parsed.docPhone) patientState.docPhone = parsed.docPhone;
                if (parsed.nurseName) patientState.nurseName = parsed.nurseName;
                if (parsed.nursePhone) patientState.nursePhone = parsed.nursePhone;
            }
        } catch (e) {
            console.error('Failed to load active duty staff:', e);
        }
    }
    loadActiveDutyStaff();

    function saveActiveDutyStaff() {
        try {
            localStorage.setItem('amma_active_duty', JSON.stringify({
                docName: patientState.docName,
                docPhone: patientState.docPhone,
                nurseName: patientState.nurseName,
                nursePhone: patientState.nursePhone
            }));
        } catch (e) {
            console.error('Failed to save active duty staff:', e);
        }
    }

    function updateAdminOnDutyRosterUI() {
        loadActiveDutyStaff();

        const adminDutyDocName = document.getElementById('adminDutyDocName');
        const adminDutyDocPhone = document.getElementById('adminDutyDocPhone');
        const adminDutyNurseName = document.getElementById('adminDutyNurseName');
        const adminDutyNursePhone = document.getElementById('adminDutyNursePhone');

        if (adminDutyDocName) adminDutyDocName.textContent = patientState.docName || 'Dr. Sarah Jenkins, MD';
        if (adminDutyDocPhone) adminDutyDocPhone.textContent = patientState.docPhone || '+1-555-0192';
        if (adminDutyNurseName) adminDutyNurseName.textContent = patientState.nurseName || 'Nurse Emily Watson, RN';
        if (adminDutyNursePhone) adminDutyNursePhone.textContent = patientState.nursePhone || '+1-555-0144';
    }

    function syncLoggedInUserToDashboard(userKey) {
        const user = USER_ACCOUNTS[userKey] || USER_ACCOUNTS['doctor'];
        
        // Update patientState care team details based on logged-in role
        if (user.role === 'doctor') {
            patientState.docName = user.name;
            patientState.docPhone = user.phone || '+1-555-0192';
            patientState.phoneRole = 'doctor';
        } else if (user.role === 'nurse') {
            patientState.nurseName = user.name;
            patientState.nursePhone = user.phone || '+1-555-0144';
            patientState.phoneRole = 'nurse';
        }

        // Synchronize attending bed doctor across all ICU beds to match current doctor
        if (typeof ICU_BEDS_DATA !== 'undefined') {
            Object.keys(ICU_BEDS_DATA).forEach(bedKey => {
                ICU_BEDS_DATA[bedKey].attendingDoctor = patientState.docName;
            });
        }

        // Synchronize assigned doctor & nurse across all 3-tiered alert inbox cards
        if (typeof ALERT_MESSAGE_INBOX !== 'undefined') {
            ALERT_MESSAGE_INBOX.forEach(item => {
                if (user.role === 'doctor') {
                    item.assignedDoctor = patientState.docName;
                }
                if (user.role === 'nurse') {
                    item.assignedNurse = patientState.nurseName;
                }
            });
        }

        saveActiveDutyStaff();

        // Update Top Navigation Header Profile Badge
        const profileBadge = document.getElementById('userProfileBadge');
        if (profileBadge) {
            profileBadge.innerHTML = `<i class="fa-solid ${user.icon || 'fa-user-doctor'} text-cyan"></i> <span>${user.name}</span>`;
        }

        // Update Duty Care Team Sidebar Card
        const dispDocName = document.getElementById('dispDocName');
        const dispDocPhone = document.getElementById('dispDocPhone');
        const dispNurseName = document.getElementById('dispNurseName');
        const dispNursePhone = document.getElementById('dispNursePhone');

        if (dispDocName) dispDocName.textContent = patientState.docName;
        if (dispDocPhone) dispDocPhone.textContent = `Direct Phone: ${patientState.docPhone}`;
        if (dispNurseName) dispNurseName.textContent = patientState.nurseName;
        if (dispNursePhone) dispNursePhone.textContent = `Pager: ${patientState.nursePhone}`;

        // Update Admin Console On-Duty Clinicians Roster & Care History Cards
        updateAdminOnDutyRosterUI();
        renderClinicianCareHistoryTable();

        // Update Tab 4 Customizer Settings Inputs
        const cfgDocName = document.getElementById('cfgDocName');
        const cfgDocPhone = document.getElementById('cfgDocPhone');
        const cfgNurseName = document.getElementById('cfgNurseName');
        const cfgNursePhone = document.getElementById('cfgNursePhone');

        if (cfgDocName) cfgDocName.value = patientState.docName;
        if (cfgDocPhone) cfgDocPhone.value = patientState.docPhone;
        if (cfgNurseName) cfgNurseName.value = patientState.nurseName;
        if (cfgNursePhone) cfgNursePhone.value = patientState.nursePhone;

        // Update Phone Simulator Active Role Tag
        if (typeof window.switchPhoneRole === 'function') {
            window.switchPhoneRole(user.role === 'doctor' ? 'doctor' : 'nurse');
        }

        // Sync 3-Tier Central Alert Inbox Role View Routing to Logged-in Doctor / Nurse
        const selectRole = document.getElementById('selectAlertRoleView');
        if (selectRole) {
            if (user.role === 'doctor') {
                activeAlertRoleView = 'doctor';
                selectRole.value = 'doctor';
            } else if (user.role === 'nurse') {
                activeAlertRoleView = 'nurse';
                selectRole.value = 'nurse';
            }
        }
        if (typeof renderICUBedsGrid === 'function') renderICUBedsGrid();
        if (typeof renderCentralAlertInbox === 'function') renderCentralAlertInbox();
    }

    function checkAuthSession() {
        const savedUser = sessionStorage.getItem('amma_user');
        const loginOverlay = document.getElementById('loginOverlay');
        const adminOverlay = document.getElementById('adminConsoleOverlay');
        const appContainer = document.querySelector('.app-container');

        if (savedUser && USER_ACCOUNTS[savedUser]) {
            const user = USER_ACCOUNTS[savedUser];
            if (loginOverlay) loginOverlay.classList.add('hidden');

            if (user.role === 'admin') {
                // Admin mode: Show Admin Portal Console, hide ICU patient dashboard
                if (adminOverlay) adminOverlay.classList.remove('hidden');
                if (appContainer) appContainer.classList.add('hidden');
                updateAdminOnDutyRosterUI();
                renderStaffDirectoryTable();
                renderLoginAuditLogTable();
                renderClinicianCareHistoryTable();
            } else {
                // Clinical Doctor / Nurse mode: Show ICU patient dashboard, hide Admin Portal Console
                if (adminOverlay) adminOverlay.classList.add('hidden');
                if (appContainer) appContainer.classList.remove('hidden');

                // Automatically sync logged-in doctor/nurse details everywhere across the dashboard!
                syncLoggedInUserToDashboard(savedUser);
            }
        } else {
            // Not authenticated: Show Login overlay, hide both portals
            if (loginOverlay) loginOverlay.classList.remove('hidden');
            if (adminOverlay) adminOverlay.classList.add('hidden');
            if (appContainer) appContainer.classList.add('hidden');
        }
    }

    window.toggleAdminICUView = function() {
        const adminOverlay = document.getElementById('adminConsoleOverlay');
        const appContainer = document.querySelector('.app-container');
        if (adminOverlay && appContainer) {
            if (appContainer.classList.contains('hidden')) {
                adminOverlay.classList.add('hidden');
                appContainer.classList.remove('hidden');
                syncLoggedInUserToDashboard('admin');
            } else {
                adminOverlay.classList.remove('hidden');
                appContainer.classList.add('hidden');
                renderClinicianCareHistoryTable();
            }
        }
    };

    window.selectLoginRole = function(roleKey) {
        const uInput = document.getElementById('loginUsername');
        const pInput = document.getElementById('loginPassword');
        const btnAdmin = document.getElementById('optAdmin');
        const btnDoc = document.getElementById('optDoctor');
        const btnNurse = document.getElementById('optNurse');

        if (btnAdmin) btnAdmin.className = roleKey === 'admin' ? 'role-opt-btn active' : 'role-opt-btn';
        if (btnDoc) btnDoc.className = roleKey === 'doctor' ? 'role-opt-btn active' : 'role-opt-btn';
        if (btnNurse) btnNurse.className = roleKey === 'nurse' ? 'role-opt-btn active' : 'role-opt-btn';

        if (USER_ACCOUNTS[roleKey]) {
            if (uInput) uInput.value = roleKey;
            if (pInput) pInput.value = USER_ACCOUNTS[roleKey].pass;
        }
    };

    let AUDIT_LOG_EVENTS = [];

    function loadAuditLogs() {
        try {
            const saved = localStorage.getItem('amma_session_logs');
            if (saved) {
                AUDIT_LOG_EVENTS = JSON.parse(saved);
            }
        } catch (e) {
            console.error('Failed to load audit logs:', e);
        }
    }
    loadAuditLogs();

    // =============================================================================
    // GOOGLE SHEETS REAL-TIME AUTO-STORAGE INTEGRATION (2 SEPARATE SHEETS)
    // Sheet 1: Clinician_Staff_Log (Doctor/Nurse Login ID, Time, Name, Role, Status)
    // Sheet 2: Patient_Telemetry_Data (Bed ID, Patient Name, HR, SpO2, BP, RR, SQI, Alarms)
    // =============================================================================

    let GOOGLE_SHEET_WEBHOOK_URL = localStorage.getItem('amma_gsheet_webhook') || '';

    function getGoogleSheetWebhookURL() {
        const input = document.getElementById('cfgGoogleSheetWebhook');
        if (input && input.value.trim()) {
            GOOGLE_SHEET_WEBHOOK_URL = input.value.trim();
            localStorage.setItem('amma_gsheet_webhook', GOOGLE_SHEET_WEBHOOK_URL);
        }
        return GOOGLE_SHEET_WEBHOOK_URL;
    }

    // 1. Sheet 1: Auto-Store Clinician Logins, Logouts, and Staff Account Data
    window.sendToGoogleSheetsClinicianData = function(eventType, usernameKey, extraDetails = '') {
        const url = getGoogleSheetWebhookURL();
        const user = USER_ACCOUNTS[usernameKey] || { name: usernameKey, role: 'staff', phone: '+1-555-0100' };
        const now = new Date().toLocaleString();

        const payload = {
            sheet_type: 'CLINICIAN_STAFF_LOG',
            timestamp: now,
            username_id: usernameKey,
            staff_name: user.name,
            staff_role: (user.role || 'staff').toUpperCase(),
            event_type: eventType,
            emergency_phone: user.phone || 'N/A',
            details: extraDetails || `Session event: ${eventType} recorded for ${user.name}`
        };

        if (url && url.startsWith('http')) {
            const encoded = encodeURIComponent(JSON.stringify(payload));
            // 1. Image Beacon (Bypasses all CORS blocks 100%)
            const img = new Image();
            img.src = `${url}?payload=${encoded}&t=${Date.now()}`;

            // 2. Fetch POST backup
            try {
                fetch(url, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify(payload)
                }).catch(e => {});
            } catch (e) {}
        }
    };

    // 2. Sheet 2: Auto-Store Patient Vitals, Telemetry, and Emergency Alarms Data
    window.sendToGoogleSheetsPatientData = function(bedId, patientName, hr, spo2, sysBP, diaBP, rr, sqi, alarmTrigger, actionDesc) {
        const url = getGoogleSheetWebhookURL();
        const now = new Date().toLocaleString();

        const payload = {
            sheet_type: 'PATIENT_TELEMETRY_DATA',
            timestamp: now,
            bed_id: bedId || (typeof activeBedNumber !== 'undefined' ? activeBedNumber : 101),
            patient_name: patientName || (ICU_BEDS_DATA && ICU_BEDS_DATA[activeBedNumber] ? ICU_BEDS_DATA[activeBedNumber].name : 'Patient'),
            hr: hr,
            spo2: spo2,
            sys_bp: sysBP,
            dia_bp: diaBP,
            rr: rr,
            sqi: sqi,
            alarm_trigger: alarmTrigger || 'NORMAL_VITAL_SYNC',
            action_description: actionDesc || 'Real-time telemetry sample'
        };

        if (url && url.startsWith('http')) {
            const encoded = encodeURIComponent(JSON.stringify(payload));
            // 1. Image Beacon (Bypasses all CORS blocks 100%)
            const img = new Image();
            img.src = `${url}?payload=${encoded}&t=${Date.now()}`;

            // 2. Fetch POST backup
            try {
                fetch(url, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify(payload)
                }).catch(e => {});
            } catch (e) {}
        }
    };

    window.testGoogleSheetsSync = function() {
        const url = getGoogleSheetWebhookURL();
        if (!url || !url.startsWith('http')) {
            alert('Please paste your Google Apps Script Webhook URL into the input box first!');
            return;
        }

        // Send Test Clinician Record
        sendToGoogleSheetsClinicianData('LOG IN', 'doctor', 'Manual Google Sheets Sync Verification Test');

        // Send Test Patient Record
        sendToGoogleSheetsPatientData(101, 'John Doe (Test)', 78, 98, 125, 82, 16, 96, 'MANUAL_TEST_SYNC', 'Verification record sent from ICU Portal');

        alert('✅ Test data sent! Please check your Google Sheet tabs (Clinician_Staff_Log & Patient_Telemetry_Data) now!');
    };

    let LOCAL_CSV_RECORDS = [];

    function loadLocalCSVRecords() {
        try {
            const saved = localStorage.getItem('amma_csv_records');
            if (saved) LOCAL_CSV_RECORDS = JSON.parse(saved);
        } catch (e) {
            LOCAL_CSV_RECORDS = [];
        }
    }
    loadLocalCSVRecords();

    window.saveRecordToLocalCSV = function(recordType, dataDict) {
        const now = new Date().toLocaleString();
        const row = {
            timestamp: now,
            record_type: recordType,
            bed_id: dataDict.bed_id || 'N/A',
            patient_name: dataDict.patient_name || 'N/A',
            hr: dataDict.hr || 'N/A',
            spo2: dataDict.spo2 || 'N/A',
            sys_bp: dataDict.sys_bp || 'N/A',
            dia_bp: dataDict.dia_bp || 'N/A',
            rr: dataDict.rr || 'N/A',
            sqi: dataDict.sqi || 'N/A',
            staff_username: dataDict.staff_username || 'N/A',
            staff_name: dataDict.staff_name || 'N/A',
            staff_role: dataDict.staff_role || 'N/A',
            event_description: dataDict.event_description || 'N/A'
        };

        LOCAL_CSV_RECORDS.push(row);
        try {
            localStorage.setItem('amma_csv_records', JSON.stringify(LOCAL_CSV_RECORDS));
        } catch (e) {}

        // Send to Flask Backend if active
        try {
            fetch('http://127.0.0.1:5000/api/records', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataDict)
            }).catch(e => {});
        } catch (e) {}
    };

    window.exportHospitalRecordsCSV = function() {
        const currentUser = sessionStorage.getItem('amma_user') || '';
        if (currentUser !== 'admin') {
            alert('Access Denied: Only Admin accounts (admin) can export CSV hospital data logs!');
            return;
        }

        if (LOCAL_CSV_RECORDS.length === 0) {
            alert('No CSV records logged in browser memory yet. Trigger any alarm or log in to generate records!');
            return;
        }

        const headers = ['timestamp', 'record_type', 'bed_id', 'patient_name', 'hr', 'spo2', 'sys_bp', 'dia_bp', 'rr', 'sqi', 'staff_username', 'staff_name', 'staff_role', 'event_description'];
        let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n";

        LOCAL_CSV_RECORDS.forEach(r => {
            const rowValues = headers.map(h => `"${(r[h] || '').toString().replace(/"/g, '""')}"`);
            csvContent += rowValues.join(",") + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "hospital_records.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // =============================================================================
    // CLINICAL PATIENT SUMMARY REPORT GENERATOR
    // =============================================================================
    let lastGeneratedReportData = null;

    window.openClinicalPatientReport = function(bedKey) {
        const key = bedKey || activeBedNumber;
        const b = (ICU_BEDS_DATA && ICU_BEDS_DATA[key]) ? ICU_BEDS_DATA[key] : { number: `BED ${key}`, name: 'Patient John Doe', hr: patientState.hr, spo2: patientState.spo2, sysBP: patientState.sysBP, diaBP: patientState.diaBP, rr: patientState.rr, sqi: patientState.sqi };

        const modal = document.getElementById('clinicalReportModal');
        const nowStr = new Date().toLocaleString();

        const pName = document.getElementById('repPatientName');
        const bedId = document.getElementById('repBedId');
        const aDoc = document.getElementById('repAttendingDoc');
        const sDoc = document.getElementById('sigDocName');

        if (pName) pName.textContent = b.name;
        if (bedId) bedId.textContent = b.number;
        if (aDoc) aDoc.textContent = patientState.docName;
        if (sDoc) sDoc.textContent = patientState.docName;

        const hrVal = b.hr || patientState.hr;
        const spo2Val = b.spo2 || patientState.spo2;
        const sysVal = b.sysBP || patientState.sysBP;
        const diaVal = b.diaBP || patientState.diaBP;
        const rrVal = b.rr || patientState.rr;
        const sqiVal = b.sqi || patientState.sqi;

        const tHR = document.getElementById('tableHR');
        const tSys = document.getElementById('tableSysBP');
        const tDia = document.getElementById('tableDiaBP');
        const tSpO2 = document.getElementById('tableSpO2');
        const tRR = document.getElementById('tableRR');
        const tSQI = document.getElementById('tableSQI');

        if (tHR) tHR.textContent = `${hrVal}.0`;
        if (tSys) tSys.textContent = `${sysVal}.0`;
        if (tDia) tDia.textContent = `${diaVal}.0`;
        if (tSpO2) tSpO2.textContent = `${spo2Val}.0`;
        if (tRR) tRR.textContent = `${rrVal}.0`;
        if (tSQI) tSQI.textContent = `${sqiVal}.0`;

        const raw = Math.max(1, rawAlarmCount);
        const supp = Math.max(0, suppressedAlarmCount);
        const rate = raw > 0 ? ((supp / raw) * 100).toFixed(1) : '75.0';

        const tRaw = document.getElementById('tableRaw');
        const tRate = document.getElementById('tableRedRate');

        if (tRaw) tRaw.textContent = raw;
        if (tRate) tRate.textContent = `${rate}`;

        // Diagnostic Impression Text generator based on physiological vitals
        let impression = `Patient telemetry indicates stable baseline cardiac rhythms with active Smart CDS noise suppression running. Signal Quality Index is ${sqiVal}%.`;
        if (sysVal > 130) {
            impression = `HYPERTENSIVE VITAL BREACH DETECTED: Systolic BP spiked to ${sysVal}/${diaVal} mmHg. Antihypertensive protocol evaluation requested. Direct alert dispatched to ${patientState.docName}.`;
        } else if (spo2Val < 90) {
            impression = `HYPOXIC SPO2 DESATURATION: Oxygen saturation dipped to ${spo2Val}%. Continuous pulse oximetry monitoring & supplemental oxygen review initiated.`;
        } else if (hrVal === 0) {
            impression = `CRITICAL CARDIAC ASYSTOLE CODE: Zero ECG & Pulse confirmed. Emergency Code Blue resuscitation protocol activated.`;
        }

        const elImp = document.getElementById('repImpressionText');
        if (elImp) elImp.textContent = impression;

        lastGeneratedReportData = {
            bedNumber: b.number,
            patientName: b.name,
            timestamp: nowStr,
            hr: hrVal,
            spo2: spo2Val,
            bp: `${sysVal}/${diaVal}`,
            sqi: sqiVal,
            rawCount: raw,
            suppCount: supp,
            reductionRate: rate,
            impression: impression,
            attendingDoc: patientState.docName,
            assignedNurse: patientState.nurseName,
            nursePhone: patientState.nursePhone
        };

        if (modal) modal.classList.remove('hidden');
    };

    window.closeClinicalReportModal = function() {
        const modal = document.getElementById('clinicalReportModal');
        if (modal) modal.classList.add('hidden');
    };

    window.printClinicalReport = function() {
        window.print();
    };

    window.exportClinicalReportTXT = function() {
        if (!lastGeneratedReportData) return;
        const d = lastGeneratedReportData;
        const reportTxt = `
================================================================================
          AMMA ICU SENTINEL - CLINICAL PATIENT SUMMARY REPORT
================================================================================
Generated: ${d.timestamp}
Patient: ${d.bedNumber} • ${d.patientName}
Attending Physician: ${d.attendingDoc}
Assigned Nurse: ${d.assignedNurse} (${d.nursePhone})
--------------------------------------------------------------------------------
PHYSIOLOGICAL TELEMETRY BASELINE:
  - Heart Rate (HR): ${d.hr} BPM
  - Oxygen Saturation (SpO2): ${d.spo2}%
  - Blood Pressure (BP): ${d.bp} mmHg
  - PPG Signal Quality Index (SQI): ${d.sqi}%

SMART CDS ALARM FATIGUE METRICS:
  - Total Raw Monitor Triggers: ${d.rawCount}
  - Noise / Dips Suppressed: ${d.suppCount}
  - Alarm Reduction Efficiency Rate: ${d.reductionRate}%

CLINICAL IMPRESSION & RECOMMENDATIONS:
${d.impression}
================================================================================
Report Generated by AMMA ICU SENTINEL ICU Smart Alarm & Clinical CDS Portal
`;

        const blob = new Blob([reportTxt], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Clinical_Report_${d.bedNumber.replace(/\s+/g, '_')}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- Admin-Exclusive Clinician Care & Alarm History Registry ---
    let CLINICIAN_CARE_HISTORY = [];

    function loadCareHistory() {
        try {
            const saved = localStorage.getItem('amma_care_history');
            if (saved) CLINICIAN_CARE_HISTORY = JSON.parse(saved);
        } catch (e) {
            CLINICIAN_CARE_HISTORY = [];
        }

        if (!CLINICIAN_CARE_HISTORY || CLINICIAN_CARE_HISTORY.length === 0) {
            const nowStr = new Date().toLocaleString();
            CLINICIAN_CARE_HISTORY = [
                {
                    id: 101,
                    timestamp: nowStr,
                    clinicianName: "Dr. Sarah Jenkins, MD",
                    clinicianRole: "DOCTOR",
                    clinicianUser: "doctor",
                    bedInfo: "BED 101 • John Doe",
                    eventTitle: "BLOOD PRESSURE SURGE BREACH",
                    eventDescription: "BP spiked to 175/105 mmHg exceeding upper safety limit (130/80 mmHg)",
                    dispatchTarget: "Dr. Sarah Jenkins (+1-555-0192) & Nurse Emily Watson (+1-555-0144)",
                    status: "DISPATCHED"
                },
                {
                    id: 102,
                    timestamp: nowStr,
                    clinicianName: "Nurse Emily Watson, RN",
                    clinicianRole: "NURSE",
                    clinicianUser: "nurse",
                    bedInfo: "BED 102 • Sarah C.",
                    eventTitle: "HYPERTENSIVE CRISIS SURGE",
                    eventDescription: "Emergency BP surge to 195/115 mmHg. Antihypertensive protocol initiated.",
                    dispatchTarget: "Nurse Emily Watson (+1-555-0144)",
                    status: "ACKNOWLEDGED"
                },
                {
                    id: 103,
                    timestamp: nowStr,
                    clinicianName: "Dr. Sarah Jenkins, MD",
                    clinicianRole: "DOCTOR",
                    clinicianUser: "doctor",
                    bedInfo: "BED 103 • Robert M.",
                    eventTitle: "TRANSIENT SpO2 DIP SUPPRESSED",
                    eventDescription: "Self-correcting SpO2 dip (85%) suppressed via 10s dynamic hold window.",
                    dispatchTarget: "Tier 3 Silent Technical Log",
                    status: "SUPPRESSED"
                }
            ];
            saveCareHistory();
        }
    }

    function saveCareHistory() {
        try {
            localStorage.setItem('amma_care_history', JSON.stringify(CLINICIAN_CARE_HISTORY));
        } catch (e) {}
    }

    loadCareHistory();

    function recordClinicianCareEvent(title, description, bedNum, dispatchTarget, status = 'DISPATCHED') {
        const currentUser = sessionStorage.getItem('amma_user') || 'doctor';
        const u = USER_ACCOUNTS[currentUser] || { name: 'Dr. Sarah Jenkins, MD', role: 'doctor' };
        const bedInfo = (ICU_BEDS_DATA && ICU_BEDS_DATA[bedNum]) ? `${ICU_BEDS_DATA[bedNum].number} • ${(ICU_BEDS_DATA[bedNum].name || '').split('•')[0].trim()}` : `BED ${bedNum}`;
        const now = new Date().toLocaleString();

        const record = {
            id: Date.now(),
            timestamp: now,
            clinicianName: u.name,
            clinicianRole: (u.role || 'DOCTOR').toUpperCase(),
            clinicianUser: currentUser,
            bedInfo: bedInfo,
            eventTitle: title,
            eventDescription: description,
            dispatchTarget: dispatchTarget || `${u.name} (${u.phone || '+1-555-0192'})`,
            status: status
        };

        CLINICIAN_CARE_HISTORY.unshift(record);
        saveCareHistory();
        renderClinicianCareHistoryTable();

        saveRecordToLocalCSV('CARE_HISTORY', {
            bed_id: bedNum,
            patient_name: bedInfo,
            hr: patientState ? patientState.hr : 75,
            spo2: patientState ? patientState.spo2 : 98,
            sys_bp: patientState ? patientState.sysBP : 120,
            dia_bp: patientState ? patientState.diaBP : 80,
            rr: patientState ? patientState.rr : 16,
            sqi: patientState ? patientState.sqi : 95,
            staff_username: currentUser,
            staff_name: u.name,
            staff_role: u.role,
            event_description: `${title}: ${description}`
        });
    }

    function renderClinicianCareHistoryTable() {
        const tbody = document.getElementById('careHistoryBody');
        const adminCard = document.getElementById('adminCareHistoryCard');
        const currentUser = sessionStorage.getItem('amma_user') || '';

        if (currentUser !== 'admin') {
            if (adminCard) adminCard.style.display = 'none';
            return;
        } else {
            if (adminCard) adminCard.style.display = 'block';
        }

        if (!tbody) return;
        tbody.innerHTML = '';

        if (CLINICIAN_CARE_HISTORY.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); font-size:12px; padding:12px;">No clinician care or alarm history logged yet.</td></tr>`;
            return;
        }

        CLINICIAN_CARE_HISTORY.forEach(r => {
            const tr = document.createElement('tr');
            let statusBadge = '<span class="d-status status-sent">DISPATCHED</span>';
            if (r.status === 'ACKNOWLEDGED') statusBadge = '<span class="d-status status-delivered" style="background:rgba(16,185,129,0.2); color:#10b981;">ACKNOWLEDGED</span>';
            else if (r.status === 'SUPPRESSED') statusBadge = '<span class="d-status" style="background:rgba(0,243,255,0.15); color:#00f3ff;">SUPPRESSED</span>';

            tr.innerHTML = `
                <td style="font-family:var(--font-mono); font-size:11px;">${r.timestamp}</td>
                <td><strong>${r.clinicianName}</strong> <span class="d-role">(${r.clinicianRole})</span></td>
                <td><strong style="color:var(--ecg-color);">${r.bedInfo}</strong></td>
                <td><strong style="color:#ff2a5f;">${r.eventTitle}</strong><br><span style="font-size:10.5px; color:var(--text-muted);">${r.eventDescription}</span></td>
                <td style="font-size:11px;">${r.dispatchTarget}</td>
                <td>${statusBadge}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    window.filterCareHistoryTable = function() {
        const query = (document.getElementById('careHistoryFilter').value || '').toLowerCase();
        const rows = document.querySelectorAll('#careHistoryBody tr');
        rows.forEach(r => {
            const text = r.textContent.toLowerCase();
            r.style.display = text.includes(query) ? '' : 'none';
        });
    };

    window.clearCareHistory = function() {
        if (confirm('Admin Action: Are you sure you want to clear all Clinician Care & Alarm History logs?')) {
            CLINICIAN_CARE_HISTORY = [];
            saveCareHistory();
            renderClinicianCareHistoryTable();
        }
    };

    function recordAccessAuditLog(username, eventType) {
        const user = USER_ACCOUNTS[username] || { name: username, role: 'staff' };
        const now = new Date();
        const timeFormatted = now.toLocaleTimeString() + ' (' + now.toLocaleDateString() + ')';

        if (eventType === 'LOG IN') {
            user.lastLogin = timeFormatted;
            user.isOnline = true;
        } else if (eventType === 'LOG OUT') {
            user.lastLogout = timeFormatted;
            user.isOnline = false;
        }

        saveStaffAccounts();

        AUDIT_LOG_EVENTS.unshift({
            timestamp: timeFormatted,
            name: user.name,
            role: user.role,
            username: username,
            event: eventType,
            status: eventType === 'LOG IN' ? 'Active Session' : 'Logged Out'
        });

        if (AUDIT_LOG_EVENTS.length > 50) AUDIT_LOG_EVENTS = AUDIT_LOG_EVENTS.slice(0, 50);

        try {
            localStorage.setItem('amma_session_logs', JSON.stringify(AUDIT_LOG_EVENTS));
        } catch (e) {}

        // Auto-Sync to Sheet 1 (Clinician_Staff_Log) & Local CSV
        sendToGoogleSheetsClinicianData(eventType, username);
        saveRecordToLocalCSV(eventType === 'LOG IN' ? 'STAFF_LOGIN' : 'STAFF_LOGOUT', {
            staff_username: username,
            staff_name: user.name,
            staff_role: user.role,
            event_description: `Clinician ${user.name} (${user.role}) performed ${eventType}`
        });

        renderLoginAuditLogTable();
    }

    function renderLoginAuditLogTable() {
        const tbody = document.getElementById('loginAuditBody');
        if (!tbody) return;

        tbody.innerHTML = '';
        if (AUDIT_LOG_EVENTS.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); font-style:italic; padding:12px;">No clinician login/logout events recorded yet</td></tr>';
            return;
        }

        AUDIT_LOG_EVENTS.forEach(log => {
            const tr = document.createElement('tr');
            const eventBadge = log.event === 'LOG IN'
                ? '<span class="badge badge-emerald"><i class="fa-solid fa-right-to-bracket"></i> LOG IN</span>'
                : '<span class="badge badge-crimson"><i class="fa-solid fa-right-from-bracket"></i> LOG OUT</span>';

            const roleBadgeClass = log.role === 'admin' ? 'role-badge-admin' : (log.role === 'doctor' ? 'role-badge-doc' : 'role-badge-nurse');

            tr.innerHTML = `
                <td style="font-family:var(--font-mono); font-size:11px;">${log.timestamp}</td>
                <td><strong>${log.name}</strong></td>
                <td><code style="background:rgba(0,0,0,0.4); padding:2px 6px; border-radius:4px; color:var(--ecg-color);">${log.username}</code></td>
                <td>${eventBadge}</td>
                <td><span class="${roleBadgeClass}">${(log.role || 'staff').toUpperCase()}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }

    window.clearLoginAuditLog = function() {
        if (confirm('Admin Action: Are you sure you want to clear all Clinician Login & Logout Access Audit Logs?')) {
            AUDIT_LOG_EVENTS = [];
            try {
                localStorage.removeItem('amma_session_logs');
            } catch (e) {}
            renderLoginAuditLogTable();
        }
    };

    window.loginUser = function() {
        const usernameInput = document.getElementById('loginUsername');
        const passwordInput = document.getElementById('loginPassword');
        const errorEl = document.getElementById('loginError');

        const u = usernameInput ? usernameInput.value.trim().toLowerCase() : '';
        const p = passwordInput ? passwordInput.value.trim() : '';

        if (USER_ACCOUNTS[u] && USER_ACCOUNTS[u].pass === p) {
            sessionStorage.setItem('amma_user', u);
            if (errorEl) errorEl.classList.add('hidden');
            recordAccessAuditLog(u, 'LOG IN');
            checkAuthSession();
        } else {
            if (errorEl) errorEl.classList.remove('hidden');
        }
    };

    window.quickLogin = function(username, password) {
        const uInput = document.getElementById('loginUsername');
        const pInput = document.getElementById('loginPassword');
        if (uInput) uInput.value = username;
        if (pInput) pInput.value = password;
        window.loginUser();
    };

    window.togglePasswordVisibility = function() {
        const passwordInput = document.getElementById('loginPassword');
        const toggleIcon = document.getElementById('togglePasswordIcon');
        if (!passwordInput || !toggleIcon) return;

        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            toggleIcon.className = 'fa-solid fa-eye-slash text-cyan';
        } else {
            passwordInput.type = 'password';
            toggleIcon.className = 'fa-solid fa-eye';
        }
    };

    window.logoutUser = function() {
        const currentUser = sessionStorage.getItem('amma_user');
        if (currentUser && USER_ACCOUNTS[currentUser]) {
            recordAccessAuditLog(currentUser, 'LOG OUT');
        }
        sessionStorage.removeItem('amma_user');
        checkAuthSession();
    };

    // --- Admin Function: Create New Staff ID ---
    window.createNewStaffID = function() {
        const nameInput = document.getElementById('newStaffName');
        const roleSelect = document.getElementById('newStaffRole');
        const userInput = document.getElementById('newStaffUser');
        const passInput = document.getElementById('newStaffPass');
        const phoneInput = document.getElementById('newStaffPhone');
        const toast = document.getElementById('adminToast');
        const toastText = document.getElementById('adminToastText');

        const name = nameInput ? nameInput.value.trim() : '';
        const role = roleSelect ? roleSelect.value : 'doctor';
        const userKey = userInput ? userInput.value.trim().toLowerCase() : '';
        const pass = passInput ? passInput.value.trim() : '';
        const phone = phoneInput ? phoneInput.value.trim() : '+1-555-0199';

        if (!name || !userKey || !pass) {
            alert('Please fill out Staff Name, Username ID, and Password!');
            return;
        }

        const icon = role === 'doctor' ? 'fa-user-doctor' : 'fa-user-nurse';

        USER_ACCOUNTS[userKey] = {
            pass: pass,
            name: name,
            role: role,
            phone: phone,
            icon: icon
        };

        saveStaffAccounts();
        renderStaffDirectoryTable();

        // If newly created user is a doctor or nurse, update active patientState care contacts
        if (role === 'doctor') {
            patientState.docName = name;
            patientState.docPhone = phone;
        } else if (role === 'nurse') {
            patientState.nurseName = name;
            patientState.nursePhone = phone;
        }
        if (typeof updateThresholdBadges === 'function') updateThresholdBadges();

        // Update and reveal Doctor Credentials Handover Card
        const handoverCard = document.getElementById('credentialsHandoverCard');
        const hName = document.getElementById('hDocName');
        const hUser = document.getElementById('hDocUser');
        const hPass = document.getElementById('hDocPass');
        const hBadge = document.getElementById('hRoleBadge');

        if (hName) hName.textContent = name;
        if (hUser) hUser.textContent = userKey;
        if (hPass) hPass.textContent = pass;
        if (hBadge) {
            hBadge.textContent = role.toUpperCase();
            hBadge.className = role === 'doctor' ? 'role-badge-doc' : 'role-badge-nurse';
        }
        if (handoverCard) handoverCard.classList.remove('hidden');

        if (toast && toastText) {
            toastText.textContent = `[SUCCESS] Staff ID '${userKey}' created for ${name}! Password assigned: '${pass}'. Give credentials to the doctor to log in!`;
            toast.classList.remove('hidden');
            setTimeout(() => toast.classList.add('hidden'), 6000);
        }

        // Reset form inputs
        if (nameInput) nameInput.value = '';
        if (userInput) userInput.value = '';
    };

    window.deleteStaffID = function(username) {
        if (username === 'admin') {
            alert('The primary System Administrator account cannot be deleted!');
            return;
        }
        if (!USER_ACCOUNTS[username]) return;

        const staffName = USER_ACCOUNTS[username].name;
        if (confirm(`Are you sure you want to delete staff member "${staffName}" (Username ID: ${username}) from AMMA ICU SENTINEL?`)) {
            delete USER_ACCOUNTS[username];
            saveStaffAccounts();
            renderStaffDirectoryTable();

            const toast = document.getElementById('adminToast');
            const toastText = document.getElementById('adminToastText');
            if (toast && toastText) {
                toastText.textContent = `[DELETED] Staff ID '${username}' (${staffName}) removed from hospital system!`;
                toast.classList.remove('hidden');
                setTimeout(() => toast.classList.add('hidden'), 5000);
            }
        }
    };

    function renderStaffDirectoryTable() {
        const tbody = document.getElementById('staffDirectoryBody');
        if (!tbody) return;

        tbody.innerHTML = '';
        Object.keys(USER_ACCOUNTS).forEach(username => {
            const acc = USER_ACCOUNTS[username];
            const badgeClass = acc.role === 'admin' ? 'role-badge-admin' : (acc.role === 'doctor' ? 'role-badge-doc' : 'role-badge-nurse');
            const tr = document.createElement('tr');

            const statusTag = acc.isOnline
                ? '<span class="text-emerald"><i class="fa-solid fa-circle-check"></i> ONLINE</span>'
                : '<span class="text-secondary"><i class="fa-solid fa-circle"></i> OFFLINE</span>';

            const lastIn = acc.lastLogin || '<span class="text-muted">Never</span>';
            const lastOut = acc.isOnline ? '<span class="text-emerald">Active Session</span>' : (acc.lastLogout || '<span class="text-muted">N/A</span>');

            const deleteAction = username === 'admin'
                ? '<span style="color:var(--text-muted); font-size:10px;"><i class="fa-solid fa-lock"></i> Protected</span>'
                : `<button class="btn btn-danger btn-sm" onclick="deleteStaffID('${username}')" style="padding:3px 8px; font-size:10.5px;" title="Delete ${username}"><i class="fa-solid fa-trash"></i> Delete</button>`;

            tr.innerHTML = `
                <td><strong style="font-family:var(--font-mono); color:var(--ecg-color);">${username}</strong></td>
                <td>${acc.name}</td>
                <td><span class="${badgeClass}">${acc.role.toUpperCase()}</span></td>
                <td style="font-family:var(--font-mono);">${acc.phone || '+1-555-0100'}</td>
                <td><code style="background:rgba(0,0,0,0.5); padding:2px 6px; border-radius:4px;">${acc.pass}</code></td>
                <td style="font-family:var(--font-mono); font-size:11px;">${lastIn}</td>
                <td style="font-family:var(--font-mono); font-size:11px;">${lastOut}</td>
                <td>${statusTag}</td>
                <td>${deleteAction}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // --- Doctor Profile Details Modal Controls ---
    window.openDoctorProfileModal = function() {
        const modal = document.getElementById('doctorProfileModal');
        const nameEl = document.getElementById('dpDocName');
        const specialtyEl = document.getElementById('dpSpecialty');
        const badgeEl = document.getElementById('dpRoleBadge');
        const userEl = document.getElementById('dpUserKey');
        const phoneEl = document.getElementById('dpPhone');
        const avatarEl = document.getElementById('dpAvatarIcon');

        const savedUser = sessionStorage.getItem('amma_user') || 'doctor';
        
        // Ensure dashboard and profile are synced to logged in user
        syncLoggedInUserToDashboard(savedUser);

        const user = USER_ACCOUNTS[savedUser] || { name: 'Clinician Profile', role: 'doctor', phone: '+1-555-0192' };

        if (nameEl) nameEl.textContent = user.name;
        if (userEl) userEl.textContent = savedUser;
        if (phoneEl) phoneEl.textContent = user.phone || '+1 (555) 019-2834';
        
        if (specialtyEl) {
            specialtyEl.textContent = user.role === 'doctor' 
                ? 'Attending Physician • ICU Telemetry' 
                : (user.role === 'admin' ? 'System Administrator • Security' : 'Staff Nurse • ICU Unit');
        }

        if (badgeEl) {
            badgeEl.textContent = `${user.role.toUpperCase()} (LEVEL 3 AUTHORIZED)`;
            badgeEl.className = user.role === 'doctor' ? 'role-badge-doc' : (user.role === 'admin' ? 'role-badge-admin' : 'role-badge-nurse');
        }

        if (avatarEl) {
            avatarEl.className = `fa-solid ${user.icon || 'fa-user-doctor'} text-cyan`;
        }

        if (modal) {
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';

            // Dismiss modal when clicking backdrop area outside the card
            modal.onclick = function(e) {
                if (e.target === modal) window.closeDoctorProfileModal();
            };
        }
    };

    window.closeDoctorProfileModal = function() {
        const modal = document.getElementById('doctorProfileModal');
        if (modal) modal.classList.add('hidden');
        document.body.style.overflow = '';
    };

    // Initialize session check
    checkAuthSession();

    // --- ICU Beds Patient Telemetry Registry ---
    let ICU_BEDS_DATA = {
        101: { number: 'BED 101', name: 'John Doe (64M) • Cardiac Post-Op', patientId: 'ICU-101', patientName: 'John Doe (64M)', hr: 72, spo2: 98, sysBP: 120, diaBP: 80, rr: 16, sqi: 96 },
        102: { number: 'BED 102', name: 'Sarah C. (52F) • COPD Severe Baseline', patientId: 'ICU-102', patientName: 'Sarah C. (52F)', hr: 84, spo2: 93, sysBP: 118, diaBP: 76, rr: 18, sqi: 94 },
        103: { number: 'BED 103', name: 'Robert M. (71M) • Sepsis Telemetry', patientId: 'ICU-103', patientName: 'Robert M. (71M)', hr: 142, spo2: 95, sysBP: 105, diaBP: 65, rr: 22, sqi: 91 },
        104: { number: 'BED 104', name: 'Elena R. (45F) • Acute Trauma ICU', patientId: 'ICU-104', patientName: 'Elena R. (45F)', hr: 68, spo2: 99, sysBP: 124, diaBP: 82, rr: 14, sqi: 98 }
    };

    let activeBedNumber = 101;

    function renderICUBedsGrid() {
        const container = document.querySelector('.beds-grid-4');
        const tabTitle = document.getElementById('tabTelemetryTitle');
        const bedKeys = Object.keys(ICU_BEDS_DATA);
        const bedCount = bedKeys.length;
        
        if (tabTitle) {
            tabTitle.textContent = `Live ICU Telemetry (${bedCount} Beds)`;
        }

        if (!container) return;
        container.innerHTML = '';

        bedKeys.forEach(bedKey => {
            const b = ICU_BEDS_DATA[bedKey];
            const isSelected = parseInt(bedKey) === activeBedNumber ? 'active-selected' : '';
            const docName = b.attendingDoctor || patientState.docName || 'Dr. Sarah Jenkins, MD';
            
            const bedCard = document.createElement('div');
            bedCard.className = `bed-card compact-bed ${isSelected}`;
            bedCard.id = `bed-${bedKey}`;
            bedCard.onclick = () => window.selectActiveBed(bedKey);
            bedCard.title = `Click to view & run live telemetry for ${b.number}`;

            bedCard.innerHTML = `
                <div class="bed-header">
                    <span class="bed-number">${b.number}</span>
                    <span class="patient-info">${b.name}</span>
                    <div class="sqi-badge ${b.sqi > 90 ? 'sqi-good' : 'sqi-poor'}" id="sqi-${bedKey}">${b.sqi}%</div>
                </div>
                <div style="font-size:10px; color:var(--text-muted); padding:3px 8px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.06); background:rgba(0,0,0,0.15);">
                    <span><i class="fa-solid fa-user-doctor text-amber"></i> Doctor: <strong style="color:var(--text-main);">${docName}</strong></span>
                    <span><i class="fa-solid fa-user-nurse text-cyan"></i> Nurse: <strong style="color:var(--text-main);">${patientState.nurseName}</strong></span>
                </div>
                <div class="compact-vitals">
                    <div class="c-vital"><span class="c-lbl"><i class="fa-solid fa-heart text-ecg"></i> HR</span><span class="c-val text-ecg" id="c-hr-${bedKey}">${b.hr}</span></div>
                    <div class="c-vital"><span class="c-lbl"><i class="fa-solid fa-wave-square text-spo2"></i> SpO₂</span><span class="c-val text-spo2" id="c-spo2-${bedKey}">${b.spo2}</span></div>
                    <div class="c-vital"><span class="c-lbl"><i class="fa-solid fa-gauge text-bp"></i> BP</span><span class="c-val text-bp" id="c-bp-${bedKey}">${b.sysBP}/${b.diaBP}</span></div>
                    <div class="c-vital"><span class="c-lbl"><i class="fa-solid fa-lungs text-resp"></i> RESP</span><span class="c-val text-resp" id="c-rr-${bedKey}">${b.rr}</span></div>
                </div>
                <div class="click-run-tag"><i class="fa-solid fa-play text-cyan"></i> Click to run live waveforms</div>
                <button class="btn btn-secondary btn-xs mt-6" onclick="event.stopPropagation(); window.openClinicalPatientReport('${bedKey}');" style="width:100%; font-size:10px; margin-top:6px; padding:3px 6px;">
                    <i class="fa-solid fa-file-medical text-emerald"></i> Clinical Summary Report
                </button>
            `;
            container.appendChild(bedCard);
        });
    }

    async function fetchBackendBeds() {
        try {
            const res = await fetch('http://127.0.0.1:5000/api/beds');
            if (res.ok) {
                const data = await res.json();
                if (data.beds) {
                    ICU_BEDS_DATA = data.beds;
                    const firstBed = Object.keys(ICU_BEDS_DATA)[0];
                    if (firstBed) activeBedNumber = parseInt(firstBed);
                    renderICUBedsGrid();
                }
            }
        } catch (e) {
            renderICUBedsGrid();
        }
    }
    fetchBackendBeds();

    window.selectActiveBed = function(bedNum) {
        if (!ICU_BEDS_DATA[bedNum]) return;
        activeBedNumber = parseInt(bedNum);
        const b = ICU_BEDS_DATA[bedNum];

        // Reset active scenario to normal baseline for selected bed
        patientState.activeScenario = 'normal';

        // Update active patientState with selected bed vitals
        patientState.hr = b.hr;
        patientState.spo2 = b.spo2;
        patientState.sysBP = b.sysBP;
        patientState.diaBP = b.diaBP;
        patientState.rr = b.rr;
        patientState.sqi = b.sqi;

        // Update active bed badge & title in focus view
        const badgeNum = document.getElementById('activeBedBadgeNum');
        const patientTitle = document.getElementById('activeBedPatientTitle');
        const sqiBadge = document.getElementById('activeBedSQIBadge');
        if (badgeNum) badgeNum.textContent = b.number;
        if (patientTitle) patientTitle.textContent = b.name;
        if (sqiBadge) {
            sqiBadge.className = b.sqi > 90 ? 'sqi-badge sqi-good' : 'sqi-badge sqi-poor';
            sqiBadge.textContent = `${b.sqi}% GOOD`;
        }

        renderICUBedsGrid();

        // Reset focus canvas sweep positions so live waveforms re-render immediately
        ecgX = 0;
        spo2X = 0;

        // Trigger immediate UI vitals update & decision engine check
        updateVitalsUI();
        if (typeof evaluateEngineLogic === 'function') evaluateEngineLogic();
    };

    // --- Tab Switcher Logic ---
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanels.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetTab = btn.getAttribute('data-tab');
            const panel = document.getElementById(targetTab);
            if (panel) panel.classList.add('active');

            if (targetTab === 'tab-analytics') {
                setTimeout(() => {
                    renderAnalyticsCharts();
                    if (chartHourlyInstance) chartHourlyInstance.resize();
                    if (chartCausesInstance) chartCausesInstance.resize();
                    if (chartBedInstance) chartBedInstance.resize();
                }, 50);
            }
        });
    });

    // --- Dark / Light Mode Theme Engine ---
    function initThemeMode() {
        const savedTheme = localStorage.getItem('amma_theme') || 'dark';
        applyThemeMode(savedTheme);
    }

    window.toggleThemeMode = function() {
        const isLight = document.body.classList.contains('light-mode');
        const newTheme = isLight ? 'dark' : 'light';
        applyThemeMode(newTheme);
        localStorage.setItem('amma_theme', newTheme);
    };

    function applyThemeMode(theme) {
        const themeIcon = document.getElementById('themeIcon');
        const adminThemeIcon = document.getElementById('adminThemeIcon');
        
        if (theme === 'light') {
            document.body.classList.add('light-mode');
            if (themeIcon) themeIcon.className = 'fa-solid fa-sun text-amber';
            if (adminThemeIcon) adminThemeIcon.className = 'fa-solid fa-sun text-amber';
        } else {
            document.body.classList.remove('light-mode');
            if (themeIcon) themeIcon.className = 'fa-solid fa-moon text-cyan';
            if (adminThemeIcon) adminThemeIcon.className = 'fa-solid fa-moon text-cyan';
        }

        if (typeof updateAnalyticsCharts === 'function') {
            try {
                updateAnalyticsCharts();
            } catch (e) {
                console.warn('Analytics charts update deferred:', e);
            }
        }
    }
    initThemeMode();

    // --- Dynamic Background Style Selector ---
    window.changeBackgroundStyle = function(styleName) {
        const validStyles = ['icu_room', 'animated_ecg', 'tech_medical', 'minimal_waves'];
        const selected = validStyles.includes(styleName) ? styleName : 'icu_room';

        validStyles.forEach(s => document.body.classList.remove(`bg-style-${s}`));
        document.body.classList.add(`bg-style-${selected}`);

        localStorage.setItem('amma_bg_style', selected);

        const selectEl = document.getElementById('bgStyleSelect');
        if (selectEl) selectEl.value = selected;
    };

    function initBackgroundStyle() {
        const savedStyle = localStorage.getItem('amma_bg_style') || 'icu_room';
        window.changeBackgroundStyle(savedStyle);
    }
    initBackgroundStyle();

    // --- Audio Mute Toggle ---
    const btnMute = document.getElementById('btnMuteAudio');
    const audioIcon = document.getElementById('audioIcon');
    if (btnMute) {
        btnMute.addEventListener('click', () => {
            audioMuted = !audioMuted;
            if (audioIcon) {
                audioIcon.className = audioMuted ? 'fa-solid fa-volume-xmark text-crimson' : 'fa-solid fa-volume-high';
            }
        });
    }

    // Audio Synthesizer Beep for Tier 1 Crisis
    function playAlarmBeep() {
        if (audioMuted) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note siren
            osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);

            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start();
            osc.stop(ctx.currentTime + 0.4);
        } catch (e) {
            // Audio context fallback
        }
    }

    // --- Clock Updater ---
    function updateClock() {
        const now = new Date();
        const clockEl = document.getElementById('liveClock');
        const phoneClockEl = document.getElementById('phoneClock');
        const timeStr = now.toTimeString().split(' ')[0];
        
        if (clockEl) clockEl.textContent = timeStr;
        if (phoneClockEl) phoneClockEl.textContent = timeStr.substring(0, 5);
    }
    setInterval(updateClock, 1000);
    updateClock();

    // --- Toggle Smart Engine ---
    const toggleInput = document.getElementById('smartEngineToggle');
    const badgeEl = document.getElementById('engineStatusBadge');
    
    if (toggleInput) {
        toggleInput.addEventListener('change', (e) => {
            smartEngineEnabled = e.target.checked;
            if (badgeEl) {
                badgeEl.textContent = smartEngineEnabled ? 'ACTIVE' : 'BYPASSED (RAW)';
                badgeEl.className = smartEngineEnabled ? 'status-badge active' : 'status-badge';
            }
            evaluateEngineLogic();
        });
    }

    // --- Reset Counter Button ---
    const btnReset = document.getElementById('btnResetSim');
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            rawAlarmCount = 0;
            suppressedAlarmCount = 0;
            timeSavedSeconds = 0;
            updateKPIs();
            document.getElementById('feedTier1').innerHTML = '<div class="empty-feed">No active Tier 1 red emergencies</div>';
            document.getElementById('feedTier2').innerHTML = '<div class="empty-feed">No active Tier 2 yellow warnings</div>';
            document.getElementById('feedTier3').innerHTML = '<div class="empty-feed">Log empty</div>';
            document.getElementById('countTier1').textContent = '0';
            document.getElementById('countTier2').textContent = '0';
            document.getElementById('countTier3').textContent = '0';
        });
    }

    // --- Waveform Rendering Engine ---
    let ecgCanvas = document.getElementById('canvas-ecg-101');
    let ecgCtx = ecgCanvas ? ecgCanvas.getContext('2d') : null;
    let spo2Canvas = document.getElementById('canvas-spo2-101');
    let spo2Ctx = spo2Canvas ? spo2Canvas.getContext('2d') : null;

    let ecgX = 0;
    let spo2X = 0;
    let waveformZoomScale = 1.0;

    window.setWaveformZoom = function(scale) {
        waveformZoomScale = 1.0;
    };

    function drawECGFrame() {
        if (!ecgCtx) {
            ecgCanvas = document.getElementById('canvas-ecg-101');
            if (ecgCanvas) ecgCtx = ecgCanvas.getContext('2d');
        }
        if (!ecgCtx) {
            requestAnimationFrame(drawECGFrame);
            return;
        }
        const width = ecgCanvas.width;
        const height = ecgCanvas.height;
        const midY = height / 2;

        // Erase leading sweep band cleanly
        ecgCtx.fillStyle = '#020a14';
        ecgCtx.fillRect(ecgX, 0, 18, height);

        ecgCtx.save();
        ecgCtx.strokeStyle = '#00ff66';
        ecgCtx.shadowColor = '#00ff66';
        ecgCtx.shadowBlur = 4;
        ecgCtx.lineWidth = 2.2 * waveformZoomScale;
        ecgCtx.beginPath();
        ecgCtx.moveTo(ecgX, midY);

        let deltaY = 0;

        // Expanded Clinical ECG Beat Period
        const currentHR = Math.max(30, patientState.hr || 72);
        const ecgBeatPeriod = Math.max(80, Math.round(14000 / currentHR));
        const cycle = ecgX % ecgBeatPeriod;

        if (patientState.activeScenario === 'lead_off' || patientState.hr === 0) {
            deltaY = (Math.random() - 0.5) * (patientState.hr === 0 ? 0.8 : 8);
        } else if (patientState.activeScenario === 'asystole_code') {
            deltaY = 0;
        } else {
            const pStart = Math.round(ecgBeatPeriod * 0.18);
            const pEnd = Math.round(ecgBeatPeriod * 0.32);
            const qPos = Math.round(ecgBeatPeriod * 0.39);
            const rPos = Math.round(ecgBeatPeriod * 0.43);
            const sPos = Math.round(ecgBeatPeriod * 0.47);
            const tStart = Math.round(ecgBeatPeriod * 0.56);
            const tEnd = Math.round(ecgBeatPeriod * 0.78);

            if (cycle >= pStart && cycle <= pEnd) {
                // P-wave (smooth 14px hump)
                deltaY = -Math.sin(((cycle - pStart) / (pEnd - pStart)) * Math.PI) * 14;
            } else if (cycle > pEnd && cycle < qPos) {
                deltaY = 0;
            } else if (cycle >= qPos && cycle < rPos) {
                // Q-wave (small 10px dip)
                deltaY = 10;
            } else if (cycle >= rPos && cycle <= rPos + 2) {
                // R-wave sharp peak (-52px upward)
                deltaY = -52;
            } else if (cycle > rPos + 2 && cycle <= sPos) {
                // S-wave sharp dip (+18px downward)
                deltaY = 18;
            } else if (cycle >= tStart && cycle <= tEnd) {
                // T-wave (smooth 18px hump)
                deltaY = -Math.sin(((cycle - tStart) / (tEnd - tStart)) * Math.PI) * 18;
            } else {
                // Baseline noise
                deltaY = (Math.random() - 0.5) * 1.5;
            }
        }

        let y = midY + (deltaY * waveformZoomScale);

        ecgX = (ecgX + 2) % width;
        ecgCtx.lineTo(ecgX, y);
        ecgCtx.stroke();
        ecgCtx.restore();

        requestAnimationFrame(drawECGFrame);
    }

    function drawPPGFrame() {
        if (!spo2Ctx) {
            spo2Canvas = document.getElementById('canvas-spo2-101');
            if (spo2Canvas) spo2Ctx = spo2Canvas.getContext('2d');
        }
        if (!spo2Ctx) {
            requestAnimationFrame(drawPPGFrame);
            return;
        }
        const width = spo2Canvas.width;
        const height = spo2Canvas.height;
        const midY = height / 2;

        // Erase leading sweep band cleanly
        spo2Ctx.fillStyle = '#020a14';
        spo2Ctx.fillRect(spo2X, 0, 18, height);

        spo2Ctx.save();
        spo2Ctx.strokeStyle = '#00a2ff';
        spo2Ctx.shadowColor = '#00a2ff';
        spo2Ctx.shadowBlur = 4;
        spo2Ctx.lineWidth = 2.4 * waveformZoomScale;
        spo2Ctx.beginPath();
        spo2Ctx.moveTo(spo2X, midY);

        let deltaY = 0;

        // Expanded Clinical SpO2 Plethysmogram Period
        const currentHR = Math.max(30, patientState.hr || 72);
        const spo2BeatPeriod = Math.max(75, Math.round(12000 / currentHR));
        const spo2AmpFactor = Math.max(0.2, (patientState.spo2 || 98) / 98);
        const cycle = spo2X % spo2BeatPeriod;

        if (patientState.activeScenario === 'motion_artifact') {
            deltaY = (Math.random() - 0.5) * 45;
        } else if (patientState.activeScenario === 'asystole_code' || patientState.spo2 === 0) {
            deltaY = 0;
        } else {
            const riseSpan = Math.round(spo2BeatPeriod * 0.28);
            const notchSpan = Math.round(spo2BeatPeriod * 0.22);

            if (cycle < riseSpan) {
                // Systolic rise to peak (-44px upward)
                deltaY = (-Math.sin((cycle / riseSpan) * Math.PI) * 44) * spo2AmpFactor;
            } else if (cycle >= riseSpan && cycle <= (riseSpan + notchSpan)) {
                // Dicrotic notch reflection dip & second hump
                const sub = cycle - riseSpan;
                deltaY = (-Math.sin((sub / notchSpan) * Math.PI) * 14 + 8) * spo2AmpFactor;
            } else {
                // Diastolic slope decay back to baseline
                const sub = cycle - (riseSpan + notchSpan);
                const rem = Math.max(1, spo2BeatPeriod - (riseSpan + notchSpan));
                deltaY = (-Math.sin((sub / rem) * Math.PI) * 8) * spo2AmpFactor;
            }
        }

        let y = midY + (deltaY * waveformZoomScale);

        spo2X = (spo2X + 2) % width;
        spo2Ctx.lineTo(spo2X, y);
        spo2Ctx.stroke();
        spo2Ctx.restore();

        requestAnimationFrame(drawPPGFrame);
    }

    // Start live animation loops for main ECG and PPG SpO2 canvases
    requestAnimationFrame(drawECGFrame);
    requestAnimationFrame(drawPPGFrame);

    // --- Multi-Bed Mini ECG Waveform Animation Engine ---
    const miniECGState = {};
    [101, 102, 103, 104, 105, 106].forEach(bedNum => {
        miniECGState[bedNum] = { x: 0 };
    });

    function drawMiniECGFrames() {
        [101, 102, 103, 104, 105, 106].forEach(bedNum => {
            const canvas = document.getElementById(`canvas-ecg-${bedNum}`);
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const width = canvas.width;
            const height = canvas.height;
            const midY = height / 2;
            let st = miniECGState[bedNum];

            ctx.fillStyle = 'rgba(3, 18, 6, 0.25)';
            ctx.fillRect(st.x, 0, 8, height);

            ctx.save();
            ctx.strokeStyle = '#00ff66';
            ctx.shadowColor = '#00ff66';
            ctx.shadowBlur = 6;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(st.x, midY);

            let y = midY;
            const cycle = st.x % 35;

            if (cycle === 16) y = midY - 14;
            else if (cycle === 17) y = midY + 6;
            else if (cycle > 22 && cycle < 26) y = midY - 3;
            else y = midY + (Math.random() - 0.5) * 1.2;

            st.x = (st.x + 2) % width;
            ctx.lineTo(st.x, y);
            ctx.stroke();
            ctx.restore();

            // Mini leading sweep dot
            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#00ff66';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(st.x, y, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        requestAnimationFrame(drawMiniECGFrames);
    }
    requestAnimationFrame(drawMiniECGFrames);

    // --- Update Threshold Badges & Contacts ---
    function updateThresholdBadges() {
        const lblBP = document.getElementById('lblMaxBP');
        const lblHR = document.getElementById('lblRangeHR');
        const lblSpO2 = document.getElementById('lblMinSpO2');
        const lblRR = document.getElementById('lblMaxRR');
        if (lblBP) lblBP.textContent = `${patientState.bpSysMax}/${patientState.bpDiaMax}`;
        if (lblHR) lblHR.textContent = `${patientState.hrMin}-${patientState.hrMax}`;
        if (lblSpO2) lblSpO2.textContent = `${patientState.spo2Min}%`;
        if (lblRR) lblRR.textContent = `${patientState.rrMax}`;

        const dName = document.getElementById('dispDocName');
        const dPhone = document.getElementById('dispDocPhone');
        const nName = document.getElementById('dispNurseName');
        const nPhone = document.getElementById('dispNursePhone');
        if (dName) dName.textContent = patientState.docName;
        if (dPhone) dPhone.textContent = `On-Call (${patientState.docPhone})`;
        if (nName) nName.textContent = patientState.nurseName;
        if (nPhone) nPhone.textContent = `Pager: ${patientState.nursePhone}`;
    }
    updateThresholdBadges();

    // --- Phone View Role Selector ---
    window.switchPhoneRole = function(role) {
        patientState.phoneRole = role;
        const btnNurse = document.getElementById('btnRoleNurse');
        const btnDoctor = document.getElementById('btnRoleDoctor');
        const tag = document.getElementById('mobileNotifRoleTag');

        if (role === 'nurse') {
            if (btnNurse) btnNurse.className = 'role-btn active';
            if (btnDoctor) btnDoctor.className = 'role-btn';
            if (tag) tag.textContent = `Nurse Alert • ${patientState.nurseName} (${patientState.nursePhone})`;
        } else {
            if (btnNurse) btnNurse.className = 'role-btn';
            if (btnDoctor) btnDoctor.className = 'role-btn active';
            if (tag) tag.textContent = `Doctor Alert • ${patientState.docName} (${patientState.docPhone})`;
        }
    };

    // --- Save Custom Threshold Settings ---
    const btnSaveSettings = document.getElementById('btnSaveThresholdSettings');
    if (btnSaveSettings) {
        btnSaveSettings.addEventListener('click', () => {
            patientState.bpSysMax = parseInt(document.getElementById('cfgBPSysMax').value) || 140;
            patientState.bpDiaMax = parseInt(document.getElementById('cfgBPDiaMax').value) || 90;
            patientState.hrMax = parseInt(document.getElementById('cfgHRMax').value) || 120;
            patientState.hrMin = parseInt(document.getElementById('cfgHRMin').value) || 50;
            patientState.spo2Min = parseInt(document.getElementById('cfgSpO2Min').value) || 90;
            patientState.rrMax = parseInt(document.getElementById('cfgRRMax').value) || 24;

            patientState.docName = document.getElementById('cfgDocName').value || 'Dr. Sarah Jenkins, MD';
            patientState.docPhone = document.getElementById('cfgDocPhone').value || '+1 (555) 019-2834';
            patientState.nurseName = document.getElementById('cfgNurseName').value || 'Nurse Emily Watson, RN';
            patientState.nursePhone = document.getElementById('cfgNursePhone').value || '+1 (555) 014-9921';

            const webhookInput = document.getElementById('cfgGoogleSheetWebhook');
            if (webhookInput && webhookInput.value.trim()) {
                GOOGLE_SHEET_WEBHOOK_URL = webhookInput.value.trim();
                localStorage.setItem('amma_gsheet_webhook', GOOGLE_SHEET_WEBHOOK_URL);
            }

            updateThresholdBadges();
            switchPhoneRole(patientState.phoneRole);
            alert('Custom vital threshold limits, Care Team contacts & Google Sheets Webhook URL saved and deployed across ICU monitors!');
            evaluateEngineLogic();
        });
    }

    window.saveAdminGoogleSheetsSettings = function() {
        const adminInput = document.getElementById('cfgGoogleSheetWebhookAdmin');
        if (adminInput && adminInput.value.trim()) {
            GOOGLE_SHEET_WEBHOOK_URL = adminInput.value.trim();
            localStorage.setItem('amma_gsheet_webhook', GOOGLE_SHEET_WEBHOOK_URL);
            alert('Admin Action: Google Sheets Webhook URL saved & deployed across ICU System!');
        } else {
            alert('Please paste a valid Google Apps Script Webhook URL!');
        }
    };

    function loadGoogleSheetWebhookUI() {
        const saved = localStorage.getItem('amma_gsheet_webhook');
        const adminInput = document.getElementById('cfgGoogleSheetWebhookAdmin');
        if (saved) {
            GOOGLE_SHEET_WEBHOOK_URL = saved;
            if (adminInput) adminInput.value = saved;
        }
        if (adminInput) {
            adminInput.addEventListener('input', (e) => {
                const val = e.target.value.trim();
                GOOGLE_SHEET_WEBHOOK_URL = val;
                localStorage.setItem('amma_gsheet_webhook', val);
            });
        }
    }
    loadGoogleSheetWebhookUI();

    // --- Scenario Trigger Controller ---
    window.triggerScenario = function(scenarioKey) {
        patientState.activeScenario = scenarioKey;
        if (patientState.delayInterval) clearInterval(patientState.delayInterval);

        const sqiBadge = document.getElementById('sqi-101');
        const delayChip = document.getElementById('delayChip-101');

        if (scenarioKey === 'bp_surge') {
            patientState.sysBP = 175;
            patientState.diaBP = 105;
            patientState.hr = 108;
            patientState.spo2 = 96;
            patientState.sqi = 96;
            if (sqiBadge) { sqiBadge.className = 'sqi-badge sqi-good'; sqiBadge.textContent = '96% GOOD'; }

        } else if (scenarioKey === 'hypertensive_crisis') {
            patientState.sysBP = 195;
            patientState.diaBP = 115;
            patientState.hr = 124;
            patientState.spo2 = 94;
            patientState.sqi = 96;
            if (sqiBadge) { sqiBadge.className = 'sqi-badge sqi-good'; sqiBadge.textContent = '96% HIGH SQI'; }

        } else if (scenarioKey === 'hr_spike') {
            patientState.sysBP = 132;
            patientState.diaBP = 86;
            patientState.hr = 145;
            patientState.spo2 = 95;
            patientState.sqi = 95;
            if (sqiBadge) { sqiBadge.className = 'sqi-badge sqi-good'; sqiBadge.textContent = '95% GOOD'; }

        } else if (scenarioKey === 'spo2_drop') {
            patientState.sysBP = 118;
            patientState.diaBP = 78;
            patientState.hr = 112;
            patientState.spo2 = 84;
            patientState.sqi = 92;
            if (sqiBadge) { sqiBadge.className = 'sqi-badge sqi-good'; sqiBadge.textContent = '92% GOOD'; }

        } else if (scenarioKey === 'coughing_dip') {
            patientState.sysBP = 122;
            patientState.diaBP = 80;
            patientState.spo2 = 85;
            patientState.hr = 74;
            patientState.sqi = 90;
            if (sqiBadge) { sqiBadge.className = 'sqi-badge sqi-good'; sqiBadge.textContent = '90% GOOD'; }

            patientState.scenarioTimer = setTimeout(() => {
                triggerScenario('normalize');
            }, 6000);

        } else if (scenarioKey === 'motion_artifact') {
            patientState.sysBP = 120;
            patientState.diaBP = 80;
            patientState.spo2 = 82;
            patientState.hr = 72;
            patientState.sqi = 34;
            if (sqiBadge) { sqiBadge.className = 'sqi-badge sqi-poor'; sqiBadge.textContent = '34% MOTION'; }

        } else if (scenarioKey === 'lead_off') {
            patientState.sysBP = 120;
            patientState.diaBP = 80;
            patientState.hr = 0;
            patientState.spo2 = 98;
            patientState.sqi = 15;
            if (sqiBadge) { sqiBadge.className = 'sqi-badge sqi-poor'; sqiBadge.textContent = '15% SHIFT'; }

        } else if (scenarioKey === 'asystole_code') {
            patientState.sysBP = 0;
            patientState.diaBP = 0;
            patientState.spo2 = 0;
            patientState.hr = 0;
            patientState.sqi = 98;
            if (sqiBadge) { sqiBadge.className = 'sqi-badge sqi-good'; sqiBadge.textContent = '98% VALID'; }

        } else if (scenarioKey === 'normalize') {
            patientState.sysBP = 120;
            patientState.diaBP = 80;
            patientState.spo2 = 98;
            patientState.hr = 72;
            patientState.sqi = 96;
            if (sqiBadge) { sqiBadge.className = 'sqi-badge sqi-good'; sqiBadge.textContent = '96% GOOD'; }
            if (delayChip) delayChip.classList.add('hidden');
            window.closeDispatchModal();
        }

        updateVitalsUI();
        evaluateEngineLogic();
    };

    // --- Manual Live Vitals Adjuster ---
    window.applyManualVitals = function() {
        const sys = parseInt(document.getElementById('sliderSysBP').value) || 120;
        const dia = parseInt(document.getElementById('sliderDiaBP').value) || 80;
        const hr = parseInt(document.getElementById('sliderHR').value) || 72;
        const spo2 = parseInt(document.getElementById('sliderSpO2').value) || 98;

        patientState.sysBP = sys;
        patientState.diaBP = dia;
        patientState.hr = hr;
        patientState.spo2 = spo2;
        patientState.activeScenario = 'manual_custom';

        updateVitalsUI();
        evaluateEngineLogic();
    };

    function updateVitalsUI() {
        document.getElementById('num-hr-101').textContent = patientState.hr;
        document.getElementById('num-spo2-101').textContent = patientState.spo2;
        document.getElementById('num-bp-101').textContent = `${patientState.sysBP}/${patientState.diaBP}`;
        document.getElementById('val-hr-101').textContent = patientState.hr;
        document.getElementById('val-spo2-101').textContent = patientState.spo2;

        // Update range slider values to match current state
        document.getElementById('sliderSysBP').value = patientState.sysBP;
        document.getElementById('lblSliderSysBP').textContent = patientState.sysBP;
        document.getElementById('sliderDiaBP').value = patientState.diaBP;
        document.getElementById('lblSliderDiaBP').textContent = patientState.diaBP;
        document.getElementById('sliderHR').value = patientState.hr;
        document.getElementById('lblSliderHR').textContent = patientState.hr;
        document.getElementById('sliderSpO2').value = patientState.spo2;
        document.getElementById('lblSliderSpO2').textContent = patientState.spo2;
    }

    // --- Direct Doctor & Nurse Emergency Dispatch Helper ---
    function dispatchDoctorNurseAlert(title, breachText, docMsgText, nurseMsgText) {
        playAlarmBeep();

        const timeStr = new Date().toTimeString().split(' ')[0];
        const mTime = document.getElementById('modalTimestamp');
        const mTitle = document.getElementById('modalBreachTitle');
        const mText = document.getElementById('modalBreachText');
        const mDocName = document.getElementById('modalDocName');
        const mDocMsg = document.getElementById('modalDocMessage');
        const mNurseName = document.getElementById('modalNurseName');
        const mNurseMsg = document.getElementById('modalNurseMessage') || document.getElementById('modalNurseMsg');
        const mPatientBanner = document.getElementById('modalPatientBannerTitle');

        if (mPatientBanner && ICU_BEDS_DATA[activeBedNumber]) {
            mPatientBanner.textContent = `${ICU_BEDS_DATA[activeBedNumber].number} • ${ICU_BEDS_DATA[activeBedNumber].name}`;
        }

        if (mTime) mTime.textContent = timeStr;
        if (mTitle) mTitle.textContent = title;
        if (mText) mText.innerHTML = breachText;

        if (mDocName) mDocName.textContent = `${patientState.docName} (${patientState.docPhone})`;
        if (mDocMsg) mDocMsg.textContent = docMsgText;

        if (mNurseName) mNurseName.textContent = `${patientState.nurseName} (${patientState.nursePhone})`;
        if (mNurseMsg) mNurseMsg.textContent = nurseMsgText;

        const modal = document.getElementById('dispatchModal');
        if (modal) {
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            modal.onclick = function(e) {
                if (e.target === modal) window.closeDispatchModal();
            };
        }

        // Update smartphone notification preview according to active role
        const roleMsg = patientState.phoneRole === 'doctor' ? docMsgText : nurseMsgText;
        updateMobileNotification(`URGENT: ${title}`, roleMsg, 'crimson');

        // Push item into Tier 1 Crisis Feed
        const cleanBreach = breachText.replace(/<[^>]*>?/gm, '');
        addFeedItem('feedTier1', 'countTier1', `DIRECT DISPATCH: ${title}`, `BED ${activeBedNumber}: ${cleanBreach} SMS/Push Alert sent to ${patientState.docName} & ${patientState.nurseName}.`, 'crimson');

        // Record in Admin-Exclusive Clinician Care & Alarm History Registry
        recordClinicianCareEvent(title, cleanBreach, activeBedNumber, `${patientState.docName} (${patientState.docPhone}) & ${patientState.nurseName}`, 'DISPATCHED');

        // Auto-Sync to Sheet 2 (Patient_Telemetry_Data)
        const pName = ICU_BEDS_DATA[activeBedNumber] ? ICU_BEDS_DATA[activeBedNumber].name : 'Patient';
        sendToGoogleSheetsPatientData(activeBedNumber, pName, patientState.hr, patientState.spo2, patientState.sysBP, patientState.diaBP, patientState.rr, patientState.sqi, title, cleanBreach);

        // Auto-Push into Single Centralized Alert-Message Inbox
        if (typeof ALERT_MESSAGE_INBOX !== 'undefined') {
            const newAlertId = `ALT-${105 + ALERT_MESSAGE_INBOX.length}`;
            let sev = 'CRITICAL';
            if (title.includes('WARNING') || title.includes('SPIKE')) sev = 'URGENT';
            else if (title.includes('ADVISORY') || title.includes('CUSTOM')) sev = 'WARNING';

            ALERT_MESSAGE_INBOX.unshift({
                id: newAlertId,
                severity: sev,
                bedId: `Bed ${activeBedNumber}`,
                patientId: `ICU-${activeBedNumber}`,
                patientName: pName,
                parameter: title,
                value: cleanBreach,
                startTime: new Date().toTimeString().split(' ')[0].substring(0, 5),
                timeActiveSeconds: 0,
                assignedNurse: patientState.nurseName || 'Nurse Emily Watson, RN',
                assignedDoctor: patientState.docName || 'Dr. Sarah Jenkins, MD',
                status: 'New',
                actionRequired: docMsgText || nurseMsgText,
                history: [
                    { time: "00:00", event: `New alert generated: ${title}` },
                    { time: "00:01", event: `Sent to assigned nurse: ${patientState.nurseName}` }
                ]
            });
            if (typeof renderCentralAlertInbox === 'function') renderCentralAlertInbox();
        }
    }

    window.closeDispatchModal = function() {
        const modal = document.getElementById('dispatchModal');
        if (modal) modal.classList.add('hidden');
        document.body.style.overflow = '';
        recordClinicianCareEvent('EMERGENCY DISPATCH ACKNOWLEDGED', 'Clinician reviewed and acknowledged emergency alarm dispatch window', activeBedNumber, `${patientState.docName}`, 'ACKNOWLEDGED');
    };

    window.callDoctorAlert = function() {
        alert(`Initiating emergency call to on-call physician: ${patientState.docName} (${patientState.docPhone})...`);
    };

    // --- Trigger Custom BP Surge (e.g. 131/80 mmHg vs set max 130/80) ---
    window.triggerCustomBPSurge = function(sys, dia) {
        patientState.sysBP = sys || 131;
        patientState.diaBP = dia || 80;
        
        // Ensure max threshold is set to 130 for this test
        if (patientState.bpSysMax >= patientState.sysBP) {
            patientState.bpSysMax = 130;
        }

        patientState.activeScenario = 'bp_surge_custom';
        updateThresholdBadges();
        updateVitalsUI();
        evaluateEngineLogic();
    };

    function recordRawAlarmTrigger() {
        rawAlarmCount++;
        const kpiRaw = document.getElementById('kpiRawAlarms');
        if (kpiRaw) kpiRaw.textContent = rawAlarmCount;
    }

    function recordSuppressedAlarmTrigger(timeSaved = 45) {
        suppressedAlarmCount++;
        timeSavedSeconds += timeSaved;
        const kpiSuppressed = document.getElementById('kpiSuppressedAlarms');
        const kpiSaved = document.getElementById('kpiTimeSaved');
        if (kpiSuppressed) kpiSuppressed.textContent = suppressedAlarmCount;
        if (kpiSaved) kpiSaved.textContent = `${timeSavedSeconds}s`;
    }

    // --- Decision Engine Logic ---
    function evaluateEngineLogic() {
        const reasoningText = document.getElementById('reasoningText-101');
        const delayChip = document.getElementById('delayChip-101');
        const sc = patientState.activeScenario;

        if (sc === 'normalize' || sc === 'normal') {
            reasoningText.innerHTML = '<i class="fa-solid fa-shield-halved text-emerald"></i> Normal Baseline. Patient vitals within set safety thresholds. Signal Quality stable.';
            if (delayChip) delayChip.classList.add('hidden');
            return;
        }

        const activeBedTag = ICU_BEDS_DATA[activeBedNumber] ? ICU_BEDS_DATA[activeBedNumber].number : `BED ${activeBedNumber}`;

        // Universal Check: If Systolic BP exceeds max limit (e.g. 131/80 vs max limit 130/80)
        if (patientState.sysBP > patientState.bpSysMax || sc === 'bp_surge_custom') {
            recordRawAlarmTrigger();
            const diffSys = patientState.sysBP - patientState.bpSysMax;
            const breachHTML = `Blood Pressure spiked to <strong>${patientState.sysBP}/${patientState.diaBP} mmHg</strong>, exceeding set upper safety limit (<strong>${patientState.bpSysMax}/${patientState.bpDiaMax} mmHg</strong>) by +${diffSys > 0 ? diffSys : 1} mmHg.`;
            const docMsg = `CRITICAL BP SURGE: ${activeBedTag} BP spiked to ${patientState.sysBP}/${patientState.diaBP} mmHg exceeding set max ${patientState.bpSysMax}/${patientState.bpDiaMax}. Urgent physician review requested by ${patientState.docName}.`;
            const nurseMsg = `URGENT ALERT: ${activeBedTag} BP ${patientState.sysBP}/${patientState.diaBP} mmHg (Exceeds limit). Please check patient immediately.`;

            if (reasoningText) reasoningText.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-crimson"></i> <strong>BP THRESHOLD BREACH:</strong> ${patientState.sysBP}/${patientState.diaBP} mmHg exceeds max limit (${patientState.bpSysMax}/${patientState.bpDiaMax} mmHg). Direct Doctor & Nurse Alert Dispatched!`;
            if (delayChip) delayChip.classList.add('hidden');

            dispatchDoctorNurseAlert(`BLOOD PRESSURE SURGE BREACH (${patientState.sysBP}/${patientState.diaBP})`, breachHTML, docMsg, nurseMsg);
            return;
        }

        // 1. Blood Pressure Surge Scenario
        if (sc === 'bp_surge') {
            recordRawAlarmTrigger();
            const diffSys = patientState.sysBP - patientState.bpSysMax;
            const breachHTML = `Blood Pressure spiked to <strong>${patientState.sysBP}/${patientState.diaBP} mmHg</strong>, exceeding set upper safety limit (<strong>${patientState.bpSysMax}/${patientState.bpDiaMax} mmHg</strong>) by +${diffSys} mmHg.`;
            const docMsg = `CRITICAL BP SURGE: ${activeBedTag} BP spiked to ${patientState.sysBP}/${patientState.diaBP} mmHg exceeding set max ${patientState.bpSysMax}/${patientState.bpDiaMax}. Urgent physician review requested by ${patientState.docName}.`;
            const nurseMsg = `URGENT ALERT: ${activeBedTag} BP ${patientState.sysBP}/${patientState.diaBP} mmHg (Exceeds limit). Please check patient immediately.`;

            reasoningText.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-crimson"></i> <strong>BP THRESHOLD BREACH:</strong> ${patientState.sysBP}/${patientState.diaBP} mmHg exceeds max limit (${patientState.bpSysMax}/${patientState.bpDiaMax} mmHg). Direct Doctor & Nurse Alert Dispatched!`;
            if (delayChip) delayChip.classList.add('hidden');

            dispatchDoctorNurseAlert('BLOOD PRESSURE SURGE SPIKE', breachHTML, docMsg, nurseMsg);
        }

        // 2. Hypertensive Crisis Scenario
        else if (sc === 'hypertensive_crisis') {
            recordRawAlarmTrigger();
            const diffSys = patientState.sysBP - patientState.bpSysMax;
            const breachHTML = `<strong>HYPERTENSIVE CRISIS:</strong> Blood Pressure surged to <strong>${patientState.sysBP}/${patientState.diaBP} mmHg</strong> (Limit: <strong>${patientState.bpSysMax}/${patientState.bpDiaMax} mmHg</strong>). High risk of end-organ damage!`;
            const docMsg = `EMERGENCY HYPERTENSIVE CRISIS: ${activeBedTag} BP ${patientState.sysBP}/${patientState.diaBP} mmHg. Immediate physician intervention requested by ${patientState.docName}!`;
            const nurseMsg = `CODE ALERT: ${activeBedTag} Hypertensive Crisis (${patientState.sysBP}/${patientState.diaBP} mmHg). Prepare antihypertensive protocol.`;

            reasoningText.innerHTML = `<i class="fa-solid fa-bolt text-crimson"></i> <strong>HYPERTENSIVE CRISIS DETECTED:</strong> ${patientState.sysBP}/${patientState.diaBP} mmHg! Urgent sirens and dual Doctor/Nurse SMS dispatched.`;
            if (delayChip) delayChip.classList.add('hidden');

            dispatchDoctorNurseAlert('HYPERTENSIVE CRISIS SURGE', breachHTML, docMsg, nurseMsg);
        }

        // 3. Heart Rate Spike Scenario
        else if (sc === 'hr_spike') {
            recordRawAlarmTrigger();
            const diffHR = patientState.hr - patientState.hrMax;
            const breachHTML = `Heart Rate surged to <strong>${patientState.hr} BPM</strong>, exceeding high safety boundary (<strong>${patientState.hrMax} BPM</strong>) by +${diffHR} BPM.`;
            const docMsg = `HR THRESHOLD SPIKE: ${activeBedTag} HR rose to ${patientState.hr} BPM exceeding max limit ${patientState.hrMax} BPM. On-call physician review requested by ${patientState.docName}.`;
            const nurseMsg = `ADVISORY ALERT: ${activeBedTag} Heart Rate Surge ${patientState.hr} BPM. Evaluate rhythm & patient status.`;

            reasoningText.innerHTML = `<i class="fa-solid fa-heart-circle-bolt text-amber"></i> <strong>HR RANGE EXCEEDED:</strong> ${patientState.hr} BPM exceeds high threshold (${patientState.hrMax} BPM). Care team alerted.`;
            if (delayChip) delayChip.classList.add('hidden');

            dispatchDoctorNurseAlert('HEART RATE SURGE SPIKE', breachHTML, docMsg, nurseMsg);
        }

        // 4. SpO2 Desaturation Drop Scenario
        else if (sc === 'spo2_drop') {
            recordRawAlarmTrigger();
            const breachHTML = `Oxygen Saturation (SpO₂) dropped to <strong>${patientState.spo2}%</strong>, breaching set minimum safety limit (<strong>${patientState.spo2Min}%</strong>).`;
            const docMsg = `DESATURATION ALERT: ${activeBedTag} SpO₂ dropped to ${patientState.spo2}% (Min limit: ${patientState.spo2Min}%). Physician review requested by ${patientState.docName}.`;
            const nurseMsg = `CRITICAL SP0₂ DROP: ${activeBedTag} SpO₂ is ${patientState.spo2}%. Verify airway & O₂ delivery immediately.`;

            reasoningText.innerHTML = `<i class="fa-solid fa-lungs text-crimson"></i> <strong>SpO₂ RANGE BREACH:</strong> ${patientState.spo2}% is below minimum safety threshold (${patientState.spo2Min}%). Direct alerts dispatched!`;
            if (delayChip) delayChip.classList.add('hidden');

            dispatchDoctorNurseAlert('CRITICAL SpO₂ DESATURATION', breachHTML, docMsg, nurseMsg);
        }

        // 5. Asystole Code Blue Cardiac Arrest Scenario
        else if (sc === 'asystole_code') {
            recordRawAlarmTrigger();
            const breachHTML = `<strong>CODE BLUE ASYSTOLE:</strong> Heart Rate & BP dropped to 0! Cardiac Arrest detected!`;
            const docMsg = `CODE BLUE ASYSTOLE: ${activeBedTag} Cardiac Arrest! HR 0 BPM. Immediate CPR & physician intervention requested by ${patientState.docName}!`;
            const nurseMsg = `CODE BLUE URGENT: ${activeBedTag} Asystole / Cardiac Arrest. Crash cart requested immediately!`;

            reasoningText.innerHTML = `<i class="fa-solid fa-skull-crossbones text-crimson"></i> <strong>ASYSTOLE CARDIAC ARREST:</strong> Emergency Sirens & Dual Doctor/Nurse Dispatch Sent!`;
            if (delayChip) delayChip.classList.add('hidden');

            dispatchDoctorNurseAlert('CRITICAL CODE BLUE ASYSTOLE', breachHTML, docMsg, nurseMsg);
        }

        // 5. Manual Custom Slider Evaluation
        else if (sc === 'manual_custom') {
            let breaches = [];
            if (patientState.sysBP > patientState.bpSysMax || patientState.diaBP > patientState.diaBPMax) {
                breaches.push(`BP ${patientState.sysBP}/${patientState.diaBP} mmHg (Max ${patientState.bpSysMax}/${patientState.bpDiaMax})`);
            }
            if (patientState.hr > patientState.hrMax) {
                breaches.push(`HR ${patientState.hr} BPM (Max ${patientState.hrMax})`);
            } else if (patientState.hr < patientState.hrMin) {
                breaches.push(`HR ${patientState.hr} BPM (Min ${patientState.hrMin})`);
            }
            if (patientState.spo2 < patientState.spo2Min) {
                breaches.push(`SpO₂ ${patientState.spo2}% (Min ${patientState.spo2Min}%)`);
            }

            if (breaches.length > 0) {
                recordRawAlarmTrigger();
                const breachHTML = `Manual vital adjustment triggered threshold breach: <strong>${breaches.join(', ')}</strong>.`;
                const docMsg = `VITAL THRESHOLD BREACH: ${activeBedTag} (${breaches.join(', ')}). Immediate physician notification for ${patientState.docName}.`;
                const nurseMsg = `URGENT ALERT: ${activeBedTag} Threshold Violation (${breaches.join(', ')}). Check patient immediately.`;

                reasoningText.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-crimson"></i> <strong>CUSTOM THRESHOLD BREACH:</strong> ${breaches.join('; ')}. Direct Doctor & Nurse Alert Dispatched!`;
                dispatchDoctorNurseAlert('CUSTOM VITAL THRESHOLD VIOLATION', breachHTML, docMsg, nurseMsg);
            } else {
                reasoningText.innerHTML = `<i class="fa-solid fa-shield-halved text-emerald"></i> <strong>VITALS WITHIN LIMITS:</strong> Current vitals (BP ${patientState.sysBP}/${patientState.diaBP}, HR ${patientState.hr}, SpO₂ ${patientState.spo2}%) are within safe configured boundaries.`;
                if (delayChip) delayChip.classList.add('hidden');
            }
        }

        // 6. Artifact & Code Scenarios
        else if (sc === 'coughing_dip') {
            recordRawAlarmTrigger();
            if (smartEngineEnabled) {
                reasoningText.innerHTML = '<i class="fa-solid fa-hourglass-half text-amber"></i> <strong>Tier 2 Transient SpO₂ Dip:</strong> Dynamic hold window active (10s countdown). Verifying self-recovery...';
                if (delayChip) delayChip.classList.remove('hidden');

                // Post event directly to TIER 2: YELLOW ADVISORY QUEUE
                addFeedItem('feedTier2', 'countTier2', 'Tier 2 Smart Hold Window', `BED ${activeBedNumber}: SpO₂ 85% transient dip. Active 10s dynamic hold running...`, 'amber');

                let seconds = 10;
                const countdown = document.getElementById('delayCountdown-101');
                if (countdown) countdown.textContent = `Dynamic Delay: ${seconds}s remaining`;

                if (patientState.delayInterval) clearInterval(patientState.delayInterval);

                patientState.delayInterval = setInterval(() => {
                    seconds--;
                    if (seconds > 0) {
                        if (countdown) countdown.textContent = `Dynamic Delay: ${seconds}s remaining`;
                    } else {
                        clearInterval(patientState.delayInterval);
                        recordSuppressedAlarmTrigger(45);
                        if (delayChip) delayChip.classList.add('hidden');
                        reasoningText.innerHTML = '<i class="fa-solid fa-circle-check text-emerald"></i> <strong>Tier 2 Dip Suppressed:</strong> Vitals self-corrected within 10s window. Suppressed without clinician disruption.';
                        addFeedItem('feedTier3', 'countTier3', 'Tier 3 Suppressed Dip Log', `BED ${activeBedNumber}: SpO₂ self-corrected cleanly. Suppressed false alarm audit entry created.`, 'emerald');
                    }
                }, 1000);
            } else {
                addFeedItem('feedTier1', 'countTier1', 'RAW UNFILTERED ALARM', `BED ${activeBedNumber}: SpO₂ 85% BELOW THRESHOLD (<90%)`, 'crimson');
            }
        }

        else if (sc === 'motion_artifact') {
            recordRawAlarmTrigger();
            if (smartEngineEnabled) {
                recordSuppressedAlarmTrigger(60);
                reasoningText.innerHTML = '<i class="fa-solid fa-hand-shake text-cyan"></i> <strong>Low SQI (34%):</strong> Motion artifact detected on PPG. ECG Heart Rate (72 bpm) normal. Alarm Suppressed.';
                if (delayChip) delayChip.classList.add('hidden');
                addFeedItem('feedTier3', 'countTier3', 'Tier 3 Silent Audit', `BED ${activeBedNumber}: Suppressed motion artifact false SpO₂ alarm (SQI 34%).`, 'cyan');
            } else {
                addFeedItem('feedTier1', 'countTier1', 'RAW UNFILTERED ALARM', `BED ${activeBedNumber}: SpO₂ 82% LOW ALARM (False Positive)`, 'crimson');
            }
        }

        else if (sc === 'lead_off') {
            recordRawAlarmTrigger();
            if (smartEngineEnabled) {
                recordSuppressedAlarmTrigger(90);
                reasoningText.innerHTML = '<i class="fa-solid fa-plug-circle-xmark text-cyan"></i> <strong>Technical Lead Shift:</strong> ECG flatline contradicted by PPG pulse wave. Re-routed to Silent Technical Log.';
                if (delayChip) delayChip.classList.add('hidden');
                addFeedItem('feedTier3', 'countTier3', 'Tier 3 Technical Log', `BED ${activeBedNumber}: Re-routed false cardiac arrest to silent lead-off technical log.`, 'cyan');
            } else {
                addFeedItem('feedTier1', 'countTier1', 'RAW UNFILTERED ALARM', `BED ${activeBedNumber}: ECG ASYSTOLE ALARM! (False Code)`, 'crimson');
            }
        }

        else if (sc === 'asystole_code') {
            playAlarmBeep();
            reasoningText.innerHTML = '<i class="fa-solid fa-heart-crack text-crimson"></i> <strong>CRITICAL ASYSTOLE CODE:</strong> Zero ECG HR & Zero Pulse confirmed. Triggering immediate Tier 1 Code Red Siren!';
            if (delayChip) delayChip.classList.add('hidden');
            addFeedItem('feedTier1', 'countTier1', 'Tier 1 Code Red', `BED ${activeBedNumber}: CARDIAC ASYSTOLE DETECTED. Immediate Code Response!`, 'crimson');
            updateMobileNotification('CODE RED ASYSTOLE', `BED ${activeBedNumber}: Zero Vitals. Resuscitation team dispatched.`, 'crimson');
        }

        updateKPIs();
    }

    function addFeedItem(feedId, countId, title, desc, colorClass) {
        const feed = document.getElementById(feedId);
        const countEl = document.getElementById(countId);
        if (!feed) return;

        const emptyMsg = feed.querySelector('.empty-feed');
        if (emptyMsg) emptyMsg.remove();

        const timeStr = new Date().toTimeString().split(' ')[0];
        const bedTag = `BED ${activeBedNumber}`;
        const item = document.createElement('div');
        item.className = 'feed-item';

        let textColor = '#00f3ff';
        if (colorClass === 'crimson') textColor = '#ff2a5f';
        else if (colorClass === 'amber') textColor = '#ffb700';
        else if (colorClass === 'gray' || colorClass === 'cyan') textColor = '#00f3ff';
        else if (colorClass === 'emerald') textColor = '#10b981';

        item.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="color:${textColor};"><span style="background:rgba(0,243,255,0.15); color:var(--ecg-color); padding:1px 5px; border-radius:3px; font-size:9.5px; margin-right:4px;">${bedTag}</span> ${title}</strong>
                <span style="font-family:var(--font-mono); font-size:10px; color:var(--text-muted);">${timeStr}</span>
            </div>
            <span style="color:#e2e8f0;">${desc}</span>
        `;

        feed.insertBefore(item, feed.firstChild);
        if (countEl) {
            countEl.textContent = parseInt(countEl.textContent || '0') + 1;
        }
    }

    function updateMobileNotification(headerText, bodyText, colorClass) {
        const notifBody = document.getElementById('mobileNotifBody');
        if (notifBody) {
            notifBody.innerHTML = `
                <strong class="text-${colorClass}"><i class="fa-solid fa-triangle-exclamation"></i> ${headerText}</strong>
                <p>${bodyText}</p>
            `;
        }
    }

    function updateKPIs() {
        const rawEl = document.getElementById('kpiRawAlarms');
        const suppEl = document.getElementById('kpiSuppressedAlarms');
        const redEl = document.getElementById('kpiReductionRate');
        const fatigueScoreEl = document.getElementById('kpiFatigueScore');
        const fatigueBar = document.getElementById('fatigueBar');
        const timeSavedEl = document.getElementById('kpiTimeSaved');

        if (rawEl) rawEl.textContent = rawAlarmCount;
        if (suppEl) suppEl.textContent = suppressedAlarmCount;

        let rate = 0;
        if (rawAlarmCount > 0) {
            rate = ((suppressedAlarmCount / rawAlarmCount) * 100).toFixed(1);
        }
        if (redEl) redEl.textContent = `${rate}%`;

        if (timeSavedEl) {
            const mins = Math.floor(timeSavedSeconds / 60);
            timeSavedEl.textContent = `${mins} min`;
        }

        if (fatigueScoreEl && fatigueBar) {
            if (rate > 50) {
                fatigueScoreEl.textContent = 'Low (Safe)';
                fatigueScoreEl.className = 'kpi-value text-emerald';
                fatigueBar.style.width = '20%';
                fatigueBar.style.background = '#10b981';
            } else if (rate > 20) {
                fatigueScoreEl.textContent = 'Moderate';
                fatigueScoreEl.className = 'kpi-value text-amber';
                fatigueBar.style.width = '55%';
                fatigueBar.style.background = '#ff9f00';
            } else {
                fatigueScoreEl.textContent = 'High (Fatigue)';
                fatigueScoreEl.className = 'kpi-value text-crimson';
                fatigueBar.style.width = '90%';
                fatigueBar.style.background = '#ff2a5f';
            }
        }

        updateAnalyticsCharts();
    }

    // --- Render Chart.js Analytics (4 Specific ML & Clinical Decision Graphs) ---
    let chartStackedInstance = null;
    let chartMetricsInstance = null;
    let chartReductionInstance = null;
    let chartShapInstance = null;

    function renderAnalyticsCharts() {
        updateAnalyticsCharts();
    }

    function updateAnalyticsCharts() {
        if (typeof Chart === 'undefined') return;

        const isLight = document.body.classList.contains('light-mode');
        const textColor = isLight ? '#0f172a' : '#f0f4f8';
        const mutedColor = isLight ? '#334155' : '#94a3b8';
        const gridColor = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.05)';

        const canvasStacked = document.getElementById('chartAlarmDecisionStacked');
        const canvasMetrics = document.getElementById('chartPrecisionRecallF1');
        const canvasReduction = document.getElementById('chartAlarmReductionThreshold');
        const canvasShap = document.getElementById('chartShapImportance');

        // 1. Alarm Type × Decision — Stacked Bar
        if (canvasStacked) {
            const suppDip = Math.max(8, suppressedAlarmCount + 14);
            const suppBP = Math.max(4, suppressedAlarmCount + 6);
            const suppArtifact = Math.max(12, suppressedAlarmCount + 22);
            const suppLead = Math.max(6, suppressedAlarmCount + 10);

            const escDip = 1;
            const escBP = Math.max(3, rawAlarmCount + 4);
            const escArtifact = 0;
            const escLead = 0;
            const escCrisis = Math.max(2, rawAlarmCount + 2);

            if (!chartStackedInstance) {
                chartStackedInstance = new Chart(canvasStacked.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: ['SpO2 Transient Dip', 'BP Surge / Spike', 'PPG Motion Artifact', 'ECG Lead Shift', 'True Cardiac Crisis'],
                        datasets: [
                            {
                                label: 'Suppressed (False Positive Noise)',
                                data: [suppDip, suppBP, suppArtifact, suppLead, 0],
                                backgroundColor: 'rgba(16, 185, 129, 0.85)',
                                borderColor: '#10b981',
                                borderWidth: 1
                            },
                            {
                                label: 'Escalated (Actionable Mobile Alert)',
                                data: [escDip, escBP, escArtifact, escLead, escCrisis],
                                backgroundColor: 'rgba(255, 42, 95, 0.85)',
                                borderColor: '#ff2a5f',
                                borderWidth: 1
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: { stacked: true, ticks: { color: mutedColor, font: { size: 9.5 } }, grid: { color: gridColor } },
                            y: { stacked: true, ticks: { color: mutedColor, font: { size: 10 } }, grid: { color: gridColor } }
                        },
                        plugins: {
                            legend: { position: 'top', labels: { color: textColor, font: { size: 10, weight: 'bold' } } }
                        }
                    }
                });
            } else {
                if (chartStackedInstance.options.scales.x) {
                    chartStackedInstance.options.scales.x.ticks.color = mutedColor;
                    chartStackedInstance.options.scales.x.grid.color = gridColor;
                }
                if (chartStackedInstance.options.scales.y) {
                    chartStackedInstance.options.scales.y.ticks.color = mutedColor;
                    chartStackedInstance.options.scales.y.grid.color = gridColor;
                }
                if (chartStackedInstance.options.plugins.legend) {
                    chartStackedInstance.options.plugins.legend.labels.color = textColor;
                }
                chartStackedInstance.data.datasets[0].data = [suppDip, suppBP, suppArtifact, suppLead, 0];
                chartStackedInstance.data.datasets[1].data = [escDip, escBP, escArtifact, escLead, escCrisis];
                chartStackedInstance.update();
            }
        }

        // 2. Threshold vs Precision / Recall / F1 — Line Chart
        if (canvasMetrics) {
            if (!chartMetricsInstance) {
                chartMetricsInstance = new Chart(canvasMetrics.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: ['0.1', '0.2', '0.3', '0.4', '0.5 (Optimal)', '0.6', '0.7', '0.8', '0.9'],
                        datasets: [
                            {
                                label: 'Precision (Alert Relevance)',
                                data: [0.42, 0.51, 0.63, 0.76, 0.89, 0.93, 0.96, 0.98, 0.99],
                                borderColor: '#00f3ff',
                                backgroundColor: 'rgba(0, 243, 255, 0.1)',
                                borderWidth: 2,
                                tension: 0.3,
                                pointRadius: 3
                            },
                            {
                                label: 'Recall (Safety Sensitivity)',
                                data: [0.99, 0.98, 0.97, 0.96, 0.94, 0.88, 0.79, 0.65, 0.48],
                                borderColor: '#ffb700',
                                backgroundColor: 'rgba(255, 183, 0, 0.1)',
                                borderWidth: 2,
                                tension: 0.3,
                                pointRadius: 3
                            },
                            {
                                label: 'F1 Score (Balanced Metric)',
                                data: [0.59, 0.67, 0.76, 0.85, 0.91, 0.90, 0.87, 0.78, 0.65],
                                borderColor: '#10b981',
                                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                borderWidth: 2.5,
                                tension: 0.3,
                                pointRadius: 4,
                                pointBackgroundColor: '#10b981'
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: { ticks: { color: mutedColor, font: { size: 10 } }, grid: { color: gridColor } },
                            y: { min: 0.3, max: 1.0, ticks: { color: mutedColor, font: { size: 10 } }, grid: { color: gridColor } }
                        },
                        plugins: {
                            legend: { position: 'top', labels: { color: textColor, font: { size: 10, weight: 'bold' } } }
                        }
                    }
                });
            } else {
                if (chartMetricsInstance.options.scales.x) {
                    chartMetricsInstance.options.scales.x.ticks.color = mutedColor;
                    chartMetricsInstance.options.scales.x.grid.color = gridColor;
                }
                if (chartMetricsInstance.options.scales.y) {
                    chartMetricsInstance.options.scales.y.ticks.color = mutedColor;
                    chartMetricsInstance.options.scales.y.grid.color = gridColor;
                }
                if (chartMetricsInstance.options.plugins.legend) {
                    chartMetricsInstance.options.plugins.legend.labels.color = textColor;
                }
                chartMetricsInstance.update();
            }
        }

        // 3. Potential Alarm Reduction vs Threshold — Line Chart (Dual Axes)
        if (canvasReduction) {
            if (!chartReductionInstance) {
                chartReductionInstance = new Chart(canvasReduction.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: ['0.1', '0.2', '0.3', '0.4', '0.5 (Optimal)', '0.6', '0.7', '0.8', '0.9'],
                        datasets: [
                            {
                                label: '% Alarm Fatigue Reduction',
                                data: [15, 28, 42, 58, 73.5, 81, 87, 92, 96],
                                borderColor: '#10b981',
                                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                                fill: true,
                                borderWidth: 2.5,
                                tension: 0.3,
                                yAxisID: 'y'
                            },
                            {
                                label: 'Clinician Time Saved (Hours / Shift)',
                                data: [0.8, 1.5, 2.3, 3.2, 4.1, 4.5, 4.8, 5.0, 5.2],
                                borderColor: '#00f3ff',
                                backgroundColor: 'transparent',
                                borderWidth: 2,
                                borderDash: [5, 5],
                                tension: 0.3,
                                yAxisID: 'y1'
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: { ticks: { color: mutedColor, font: { size: 10 } }, grid: { color: gridColor } },
                            y: { type: 'linear', position: 'left', min: 0, max: 100, ticks: { color: '#10b981', callback: v => v + '%' }, grid: { color: gridColor } },
                            y1: { type: 'linear', position: 'right', min: 0, max: 6, ticks: { color: '#00f3ff', callback: v => v + ' hrs' }, grid: { drawOnChartArea: false } }
                        },
                        plugins: {
                            legend: { position: 'top', labels: { color: textColor, font: { size: 10, weight: 'bold' } } }
                        }
                    }
                });
            } else {
                if (chartReductionInstance.options.scales.x) {
                    chartReductionInstance.options.scales.x.ticks.color = mutedColor;
                    chartReductionInstance.options.scales.x.grid.color = gridColor;
                }
                if (chartReductionInstance.options.scales.y) {
                    chartReductionInstance.options.scales.y.grid.color = gridColor;
                }
                if (chartReductionInstance.options.plugins.legend) {
                    chartReductionInstance.options.plugins.legend.labels.color = textColor;
                }
                chartReductionInstance.update();
            }
        }

        // 4. SHAP Feature Importance — Horizontal Bar Chart
        if (canvasShap) {
            if (!chartShapInstance) {
                chartShapInstance = new Chart(canvasShap.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: [
                            'Signal Quality Index (SQI)',
                            'PPG Pulse Wave Morph',
                            'Heart Rate Variability (HRV)',
                            'Systolic BP Deviation',
                            'Respiration Rate (RR)',
                            'ECG ST Segment Elevation'
                        ],
                        datasets: [
                            {
                                label: 'Mean |SHAP Value| (Impact on Reduction)',
                                data: [0.42, 0.35, 0.28, 0.22, 0.16, 0.09],
                                backgroundColor: [
                                    '#00f3ff',
                                    'rgba(0, 243, 255, 0.8)',
                                    '#ffb700',
                                    'rgba(255, 183, 0, 0.8)',
                                    '#10b981',
                                    '#ff2a5f'
                                ],
                                borderRadius: 4
                            }
                        ]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: { min: 0, max: 0.5, ticks: { color: mutedColor, font: { size: 10 } }, grid: { color: gridColor } },
                            y: { ticks: { color: textColor, font: { size: 9.5 } }, grid: { display: false } }
                        },
                        plugins: {
                            legend: { position: 'top', labels: { color: textColor, font: { size: 10, weight: 'bold' } } }
                        }
                    }
                });
            } else {
                if (chartShapInstance.options.scales.x) {
                    chartShapInstance.options.scales.x.ticks.color = mutedColor;
                    chartShapInstance.options.scales.x.grid.color = gridColor;
                }
                if (chartShapInstance.options.scales.y) {
                    chartShapInstance.options.scales.y.ticks.color = textColor;
                }
                if (chartShapInstance.options.plugins.legend) {
                    chartShapInstance.options.plugins.legend.labels.color = textColor;
                }
                chartShapInstance.update();
            }
        }
    }

    // =============================================================================
    // SINGLE CENTRALIZED ALERT-MESSAGE SYSTEM & CLINICAL CDS PORTAL
    // ACTIVE CLINICAL ALERTS INBOX & TIMEOUT ESCALATION ENGINE
    // =============================================================================

    let activeAlertRoleView = 'charge_nurse';
    let activeAlertSeverityFilter = 'ALL';
    let activeResolvingAlertId = null;

    let ALERT_MESSAGE_INBOX = [
        {
            id: "ALT-101",
            severity: "CRITICAL",
            bedId: "BED 103",
            patientId: "ICU-103",
            patientName: "Robert M. (71M)",
            parameter: "Heart Rate",
            value: "142 bpm",
            startTime: "00:45",
            timeActiveSeconds: 45,
            assignedNurse: "Nurse Emily Watson, RN",
            assignedDoctor: "Dr. Sarah Jenkins, MD",
            status: "Escalated to Charge Nurse",
            actionRequired: "Evaluate ECG rhythm, check electrolytes & administer antiarrhythmic protocol",
            history: [
                { time: "00:00", event: "New alert generated: HR 142 bpm breach" },
                { time: "00:05", event: "Sent to assigned nurse" },
                { time: "02:00", event: "Automated 2-min timeout: Escalated to Charge Nurse" }
            ]
        },
        {
            id: "ALT-102",
            severity: "URGENT",
            bedId: "BED 102",
            patientId: "ICU-102",
            patientName: "Sarah C. (52F)",
            parameter: "SpO₂",
            value: "86%",
            startTime: "02:10",
            timeActiveSeconds: 130,
            assignedNurse: "Nurse Emily Watson, RN",
            assignedDoctor: "Dr. Sarah Jenkins, MD",
            status: "Acknowledged",
            actionRequired: "Continuous pulse oximetry monitoring & immediate oxygen therapy escalation",
            history: [
                { time: "00:00", event: "New alert generated: SpO₂ 86% desaturation" },
                { time: "00:10", event: "Sent to assigned nurse" },
                { time: "01:15", event: "Acknowledged by nurse" }
            ]
        },
        {
            id: "ALT-103",
            severity: "WARNING",
            bedId: "BED 101",
            patientId: "ICU-101",
            patientName: "John Doe (64M)",
            parameter: "NIBP",
            value: "175/105 mmHg",
            startTime: "05:20",
            timeActiveSeconds: 320,
            assignedNurse: "Nurse Emily Watson, RN",
            assignedDoctor: "Dr. Sarah Jenkins, MD",
            status: "Under review",
            actionRequired: "Administer IV antihypertensive protocol & monitor arterial line telemetry",
            history: [
                { time: "00:00", event: "New alert generated: BP 175/105 mmHg surge" },
                { time: "00:12", event: "Sent to assigned nurse" },
                { time: "02:00", event: "Escalated to Charge Nurse due to timeout" },
                { time: "03:40", event: "Under review by physician" }
            ]
        },
        {
            id: "ALT-104",
            severity: "ADVISORY",
            bedId: "BED 104",
            patientId: "ICU-104",
            patientName: "Elena R. (45F)",
            parameter: "Respiration Rate",
            value: "22 bpm",
            startTime: "00:15",
            timeActiveSeconds: 15,
            assignedNurse: "Nurse Emily Watson, RN",
            assignedDoctor: "Dr. Sarah Jenkins, MD",
            status: "New",
            actionRequired: "Assess chest wall movement & re-verify ventilator baseline settings",
            history: [
                { time: "00:00", event: "New alert generated: Resp Rate 22 bpm" }
            ]
        }
    ];

    function formatTimeActive(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    window.changeAlertRoleFilter = function(roleVal) {
        activeAlertRoleView = roleVal;
        renderCentralAlertInbox();
    };

    window.setAlertSeverityFilter = function(sev) {
        activeAlertSeverityFilter = sev;
        const btns = ['ALL', 'CRITICAL', 'URGENT', 'WARNING', 'ADVISORY'];
        btns.forEach(b => {
            const btnEl = document.getElementById(`sevFilter${b === 'ALL' ? 'All' : b.charAt(0).toUpperCase() + b.slice(1).toLowerCase()}`);
            if (btnEl) {
                if (b === sev) btnEl.classList.add('active');
                else btnEl.classList.remove('active');
            }
        });
        renderCentralAlertInbox();
    };

    function renderCentralAlertInbox() {
        const feed = document.getElementById('centralAlertInboxFeed');
        if (!feed) return;

        // Update counters
        const cntAll = ALERT_MESSAGE_INBOX.length;
        const cntCrit = ALERT_MESSAGE_INBOX.filter(a => a.severity === 'CRITICAL').length;
        const cntUrg = ALERT_MESSAGE_INBOX.filter(a => a.severity === 'URGENT').length;
        const cntWarn = ALERT_MESSAGE_INBOX.filter(a => a.severity === 'WARNING').length;
        const cntAdv = ALERT_MESSAGE_INBOX.filter(a => a.severity === 'ADVISORY').length;

        const elAll = document.getElementById('cntSevAll');
        const elCrit = document.getElementById('cntSevCritical');
        const elUrg = document.getElementById('cntSevUrgent');
        const elWarn = document.getElementById('cntSevWarning');
        const elAdv = document.getElementById('cntSevAdvisory');

        if (elAll) elAll.textContent = cntAll;
        if (elCrit) elCrit.textContent = cntCrit;
        if (elUrg) elUrg.textContent = cntUrg;
        if (elWarn) elWarn.textContent = cntWarn;
        if (elAdv) elAdv.textContent = cntAdv;

        // Filter alerts
        let filtered = ALERT_MESSAGE_INBOX.filter(item => {
            // Severity filter
            if (activeAlertSeverityFilter !== 'ALL' && item.severity !== activeAlertSeverityFilter) {
                return false;
            }

            const currentUserKey = sessionStorage.getItem('amma_user') || 'doctor';
            const user = USER_ACCOUNTS[currentUserKey] || { name: patientState.docName || 'Dr. Sarah Jenkins, MD', role: 'doctor' };

            // When in Doctor View or logged in as Doctor: Only show alerts assigned to THIS specific doctor!
            if (activeAlertRoleView === 'doctor' || (user.role === 'doctor' && activeAlertRoleView !== 'admin' && activeAlertRoleView !== 'charge_nurse')) {
                const docName = (user.role === 'doctor' ? user.name : patientState.docName) || '';
                const docNameClean = docName.toLowerCase().replace(/^(dr\.|doctor)\s+/i, '').trim();
                const assignedDocClean = (item.assignedDoctor || '').toLowerCase().replace(/^(dr\.|doctor)\s+/i, '').trim();

                const matchesDoctor = assignedDocClean.includes(docNameClean) || docNameClean.includes(assignedDocClean) || item.assignedDoctor === user.name;
                return matchesDoctor;
            }

            // When in Nurse View or logged in as Nurse: Only show alerts assigned to THIS specific nurse!
            if (activeAlertRoleView === 'nurse' || (user.role === 'nurse' && activeAlertRoleView !== 'admin' && activeAlertRoleView !== 'charge_nurse')) {
                const nurseName = (user.role === 'nurse' ? user.name : patientState.nurseName) || '';
                const nurseNameClean = nurseName.toLowerCase().replace(/^(nurse)\s+/i, '').trim();
                const assignedNurseClean = (item.assignedNurse || '').toLowerCase().replace(/^(nurse)\s+/i, '').trim();

                const matchesNurse = assignedNurseClean.includes(nurseNameClean) || nurseNameClean.includes(assignedNurseClean) || item.assignedNurse === user.name;
                return matchesNurse;
            }

            if (activeAlertRoleView === 'charge_nurse') {
                return item.status !== 'Resolved';
            }

            // Admin sees all history
            return true;
        });

        feed.innerHTML = '';
        if (filtered.length === 0) {
            feed.innerHTML = `<div class="empty-inbox-msg" style="text-align:center; padding:30px; color:var(--text-muted); font-size:13px;"><i class="fa-solid fa-inbox fa-2x mb-8" style="opacity:0.5;"></i><br>No active clinical alerts matching selected role/severity filter.</div>`;
            return;
        }

        filtered.forEach(item => {
            const card = document.createElement('div');
            card.className = `central-alert-card ${item.severity.toLowerCase()}`;

            let sevClass = 'sev-badge-critical';
            let iconClass = 'fa-circle-exclamation';
            if (item.severity === 'URGENT') { sevClass = 'sev-badge-urgent'; iconClass = 'fa-triangle-exclamation'; }
            else if (item.severity === 'WARNING') { sevClass = 'sev-badge-warning'; iconClass = 'fa-triangle-exclamation'; }
            else if (item.severity === 'ADVISORY') { sevClass = 'sev-badge-advisory'; iconClass = 'fa-circle-info'; }

            let statusClass = 'status-new';
            if (item.status.includes('Acknowledged')) statusClass = 'status-acknowledged';
            else if (item.status.includes('review') || item.status.includes('checked')) statusClass = 'status-checked';
            else if (item.status.includes('Escalated')) statusClass = 'status-escalated';
            else if (item.status.includes('Resolved')) statusClass = 'status-resolved';

            const formattedTime = formatTimeActive(item.timeActiveSeconds);

            card.innerHTML = `
                <div class="card-top-header">
                    <div class="header-left">
                        <span class="sev-badge ${sevClass}"><i class="fa-solid ${iconClass}"></i> [${item.severity}]</span>
                        <span class="bed-tag">${item.bedId}</span>
                        <span class="patient-id-tag">Patient: <strong>${item.patientId}</strong> (${item.patientName || ''})</span>
                    </div>
                    <div class="header-right">
                        <span class="status-pill ${statusClass}"><i class="fa-solid fa-circle-dot"></i> Status: ${item.status}</span>
                        <span class="time-active-chip"><i class="fa-solid fa-stopwatch"></i> Active: <strong>${formattedTime}</strong></span>
                    </div>
                </div>

                <div class="card-body-content">
                    <div class="abnormal-parameter-box">
                        <span class="param-lbl">ABNORMAL PARAMETER:</span>
                        <span class="param-val">${item.parameter} <strong class="val-highlight">${item.value}</strong></span>
                    </div>
                    <div class="care-team-assignment">
                        <span><i class="fa-solid fa-user-nurse text-cyan"></i> Assigned Nurse: <strong>${item.assignedNurse}</strong></span>
                        <span><i class="fa-solid fa-user-doctor text-amber"></i> Assigned Doctor: <strong>${item.assignedDoctor}</strong></span>
                    </div>
                    <div class="required-action-box">
                        <i class="fa-solid fa-notes-medical text-cyan"></i> <strong>Required Action:</strong> ${item.actionRequired}
                    </div>
                </div>

                <div class="card-action-bar">
                    <div class="action-btn-group">
                        ${item.status !== 'Resolved' ? `
                            <button class="btn btn-act-ack" onclick="acknowledgeAlert('${item.id}')"><i class="fa-solid fa-check"></i> Acknowledge</button>
                            <button class="btn btn-act-esc" onclick="escalateAlert('${item.id}')"><i class="fa-solid fa-arrow-up-right-dots"></i> Escalate</button>
                            <button class="btn btn-act-res" onclick="openResolveAlertModal('${item.id}')"><i class="fa-solid fa-check-double"></i> Resolve</button>
                        ` : `
                            <span class="text-emerald" style="font-size:12px; font-weight:700;"><i class="fa-solid fa-circle-check"></i> RESOLVED</span>
                        `}
                    </div>
                    <button class="btn btn-act-hist" onclick="toggleAlertHistory('${item.id}')"><i class="fa-solid fa-clock-rotate-left"></i> Complete Alert History</button>
                </div>
            `;

            feed.appendChild(card);
        });
    }

    // Automated 1-second timeout & active timer loop
    setInterval(() => {
        let changed = false;
        ALERT_MESSAGE_INBOX.forEach(item => {
            if (item.status !== 'Resolved') {
                item.timeActiveSeconds++;
                changed = true;

                // Automated timeout escalation
                if (item.timeActiveSeconds >= 120 && (item.status === 'New' || item.status === 'Sent to assigned nurse')) {
                    item.status = 'Escalated to Charge Nurse';
                    item.history.push({
                        time: formatTimeActive(item.timeActiveSeconds),
                        event: 'Automated 2-min timeout: Escalated to Charge Nurse'
                    });
                } else if (item.timeActiveSeconds >= 300 && item.status === 'Escalated to Charge Nurse') {
                    item.status = 'Escalated to ICU Doctor Team';
                    item.history.push({
                        time: formatTimeActive(item.timeActiveSeconds),
                        event: 'Automated 5-min timeout: Escalated to ICU Doctor Team'
                    });
                }
            }
        });

        const tabCmd = document.getElementById('tab-command');
        if (tabCmd && tabCmd.classList.contains('active')) {
            renderCentralAlertInbox();
        }
    }, 1000);

    window.acknowledgeAlert = function(alertId) {
        const item = ALERT_MESSAGE_INBOX.find(a => a.id === alertId);
        if (item) {
            const currentUserKey = sessionStorage.getItem('amma_user') || 'nurse';
            const user = USER_ACCOUNTS[currentUserKey] || { name: 'Clinician', role: 'nurse' };
            item.status = 'Acknowledged';
            item.history.push({
                time: formatTimeActive(item.timeActiveSeconds),
                event: `Acknowledged by ${user.name} (${user.role.toUpperCase()})`
            });
            renderCentralAlertInbox();
            recordClinicianCareEvent(`ALERT ACKNOWLEDGED: ${item.bedId}`, `${item.parameter} ${item.value} acknowledged by ${user.name}`, item.bedId, user.name, 'ACKNOWLEDGED');
        }
    };

    window.escalateAlert = function(alertId) {
        const item = ALERT_MESSAGE_INBOX.find(a => a.id === alertId);
        if (item) {
            const currentUserKey = sessionStorage.getItem('amma_user') || 'nurse';
            const user = USER_ACCOUNTS[currentUserKey] || { name: 'Clinician', role: 'nurse' };

            if (item.status.includes('Charge Nurse')) {
                item.status = 'Escalated to ICU Doctor Team';
            } else {
                item.status = 'Escalated to Charge Nurse';
            }

            item.history.push({
                time: formatTimeActive(item.timeActiveSeconds),
                event: `Manually escalated to ${item.status} by ${user.name}`
            });
            renderCentralAlertInbox();
            recordClinicianCareEvent(`ALERT ESCALATED: ${item.bedId}`, `${item.parameter} ${item.value} escalated to ${item.status} by ${user.name}`, item.bedId, user.name, 'DISPATCHED');
        }
    };

    window.openResolveAlertModal = function(alertId) {
        activeResolvingAlertId = alertId;
        const item = ALERT_MESSAGE_INBOX.find(a => a.id === alertId);
        const modal = document.getElementById('alertResolutionModal');
        const banner = document.getElementById('resAlertTargetBanner');
        const resolverInput = document.getElementById('txtResolverName');
        const noteInput = document.getElementById('txtResolutionNote');

        if (item && banner) {
            banner.innerHTML = `<strong>[${item.severity}] ${item.bedId} | ${item.parameter} ${item.value}</strong><br><span style="font-size:11px; opacity:0.8;">Patient: ${item.patientId} (${item.patientName}) • Assigned: ${item.assignedNurse}</span>`;
        }

        const currentUserKey = sessionStorage.getItem('amma_user') || 'nurse';
        const user = USER_ACCOUNTS[currentUserKey] || { name: 'Nurse Emily Watson, RN' };
        if (resolverInput) resolverInput.value = user.name;
        if (noteInput) noteInput.value = '';

        if (modal) modal.classList.remove('hidden');
    };

    window.closeResolveAlertModal = function() {
        const modal = document.getElementById('alertResolutionModal');
        if (modal) modal.classList.add('hidden');
    };

    window.submitAlertResolution = function() {
        if (!activeResolvingAlertId) return;
        const item = ALERT_MESSAGE_INBOX.find(a => a.id === activeResolvingAlertId);
        const noteInput = document.getElementById('txtResolutionNote');
        const resolverInput = document.getElementById('txtResolverName');

        const note = noteInput ? noteInput.value.trim() : '';
        const resolver = resolverInput ? resolverInput.value.trim() : 'Clinician';

        if (!note) {
            alert('Please enter a clinical resolution note before submitting!');
            return;
        }

        if (item) {
            item.status = 'Resolved';
            item.history.push({
                time: formatTimeActive(item.timeActiveSeconds),
                event: `Resolved by ${resolver}. Clinical Note: ${note}`
            });
            renderCentralAlertInbox();
            recordClinicianCareEvent(`ALERT RESOLVED: ${item.bedId}`, `${item.parameter} ${item.value} resolved. Note: ${note}`, item.bedId, resolver, 'ACKNOWLEDGED');
            window.closeResolveAlertModal();
        }
    };

    window.toggleAlertHistory = function(alertId) {
        const item = ALERT_MESSAGE_INBOX.find(a => a.id === alertId);
        const modal = document.getElementById('alertHistoryModal');
        const banner = document.getElementById('histAlertTargetBanner');
        const feed = document.getElementById('alertHistoryTimelineFeed');

        if (item && banner && feed) {
            banner.innerHTML = `<strong>[${item.severity}] ${item.bedId} • ${item.patientId} (${item.patientName})</strong><br><span style="font-size:11px; opacity:0.8;">Abnormal Parameter: ${item.parameter} ${item.value} | Assigned: ${item.assignedNurse}, ${item.assignedDoctor}</span>`;

            feed.innerHTML = '';
            item.history.forEach((h) => {
                const el = document.createElement('div');
                el.style.cssText = 'background:rgba(255,255,255,0.04); border-left:3px solid var(--ecg-color); padding:8px 12px; border-radius:4px; font-size:12px;';
                el.innerHTML = `<span style="font-family:var(--font-mono); font-weight:700; color:var(--ecg-color); margin-right:8px;">[${h.time}]</span> <span style="color:#f0f4f8;">${h.event}</span>`;
                feed.appendChild(el);
            });
        }

        if (modal) modal.classList.remove('hidden');
    };

    window.closeAlertHistoryModal = function() {
        const modal = document.getElementById('alertHistoryModal');
        if (modal) modal.classList.add('hidden');
    };

    window.verifyAdmin3TierAccess = function() {
        const currentUserKey = sessionStorage.getItem('amma_user') || '';
        if (currentUserKey !== 'admin') {
            alert('SECURITY BREACH / ACCESS DENIED: Only System Administrator accounts (admin) can modify 3-Tiered Alarm Engine Parameters & Safety Boundaries!');
            return false;
        }
        return true;
    };

    renderCentralAlertInbox();
});
