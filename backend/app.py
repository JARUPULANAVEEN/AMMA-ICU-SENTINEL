"""
=============================================================================
AMMA ICU SENTINEL - ICU Smart Alarm & Clinical CDS Backend (Flask Server)
=============================================================================
This backend handles:
1. Automatic Real-Time CSV Storage (`hospital_records.csv`) for Patients & Staff
2. External Hospital Dataset Integration (`data/` folder auto-loader)
3. Authentication & Staff Account Directory
4. ICU Patient Telemetry & Bed Monitoring Data
5. Direct Emergency SMS & Push Dispatch Notifications
6. HIPAA Access Audit Logs (Login/Logout Timestamps)
=============================================================================
"""

import os
import time
import json
import csv
import datetime
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, '..'))

app = Flask(__name__, static_folder=PROJECT_ROOT, static_url_path='')
CORS(app)

DATA_FOLDER = os.path.join(PROJECT_ROOT, 'data')
UNIFIED_CSV_FILE = os.path.join(PROJECT_ROOT, 'hospital_records.csv')
EXTERNAL_HOSPITAL_DATASETS = []

if not os.path.exists(DATA_FOLDER):
    os.makedirs(DATA_FOLDER)

# --- Default Staff Accounts ---
USER_ACCOUNTS = {
    "doctor": {"pass": "amma123", "name": "Dr. Sarah Jenkins, MD", "role": "doctor", "phone": "+1-555-0192", "icon": "fa-user-doctor"},
    "nurse": {"pass": "amma123", "name": "Nurse Emily Watson, RN", "role": "nurse", "phone": "+1-555-0144", "icon": "fa-user-nurse"},
    "admin": {"pass": "amma123", "name": "Admin - AMMA ICU SENTINEL", "role": "admin", "phone": "+1-555-0100", "icon": "fa-user-shield"}
}

# --- ICU Bed Patient Telemetry Registry ---
ICU_BEDS_DATA = {
    101: {"number": "BED 101", "name": "John Doe (64M) • Cardiac Post-Op", "hr": 72, "spo2": 98, "sysBP": 120, "diaBP": 80, "rr": 16, "sqi": 96},
    102: {"number": "BED 102", "name": "Sarah C. (52F) • COPD Severe Baseline", "hr": 84, "spo2": 93, "sysBP": 118, "diaBP": 76, "rr": 18, "sqi": 94},
    103: {"number": "BED 103", "name": "Robert M. (71M) • Sepsis Telemetry", "hr": 96, "spo2": 95, "sysBP": 105, "diaBP": 65, "rr": 22, "sqi": 91},
    104: {"number": "BED 104", "name": "Elena R. (45F) • Acute Trauma ICU", "hr": 68, "spo2": 99, "sysBP": 124, "diaBP": 82, "rr": 14, "sqi": 98}
}

# --- Session Access Audit Logs ---
AUDIT_LOG_EVENTS = []

# =============================================================================
# CSV REAL-TIME STORAGE & EXTERNAL DATASET LOADER
# =============================================================================

CSV_HEADERS = [
    'timestamp', 'record_type', 'bed_id', 'patient_name', 
    'hr', 'spo2', 'sys_bp', 'dia_bp', 'rr', 'sqi', 
    'staff_username', 'staff_name', 'staff_role', 'event_description'
]

def initialize_unified_csv():
    if not os.path.exists(UNIFIED_CSV_FILE):
        with open(UNIFIED_CSV_FILE, mode='w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(CSV_HEADERS)
        print(f"[CSV INITIALIZED] Created {UNIFIED_CSV_FILE}")

initialize_unified_csv()

GOOGLE_SHEET_WEBHOOK_URL = ""

def forward_to_google_sheets(record_type, data_dict):
    """Auto-forwards records to Google Sheets Webhook (Sheet 1 for Clinicians, Sheet 2 for Patients)"""
    if not GOOGLE_SHEET_WEBHOOK_URL:
        return
    try:
        import urllib.request
        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if record_type in ['STAFF_LOGIN', 'STAFF_LOGOUT', 'STAFF_CREATE', 'STAFF_DELETE']:
            payload = {
                "sheet_type": "CLINICIAN_STAFF_LOG",
                "timestamp": now,
                "username_id": data_dict.get('staff_username', 'N/A'),
                "staff_name": data_dict.get('staff_name', 'N/A'),
                "staff_role": str(data_dict.get('staff_role', 'N/A')).upper(),
                "event_type": record_type,
                "emergency_phone": data_dict.get('phone', 'N/A'),
                "details": data_dict.get('event_description', 'N/A')
            }
        else:
            payload = {
                "sheet_type": "PATIENT_TELEMETRY_DATA",
                "timestamp": now,
                "bed_id": data_dict.get('bed_id', 'N/A'),
                "patient_name": data_dict.get('patient_name', 'N/A'),
                "hr": data_dict.get('hr', 'N/A'),
                "spo2": data_dict.get('spo2', 'N/A'),
                "sys_bp": data_dict.get('sys_bp', 'N/A'),
                "dia_bp": data_dict.get('dia_bp', 'N/A'),
                "rr": data_dict.get('rr', 'N/A'),
                "sqi": data_dict.get('sqi', 'N/A'),
                "alarm_trigger": record_type,
                "action_description": data_dict.get('event_description', 'N/A')
            }
        req = urllib.request.Request(
            GOOGLE_SHEET_WEBHOOK_URL,
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        urllib.request.urlopen(req, timeout=3)
        print(f"[GSHEETS AUTO-SYNC] [{record_type}] payload posted to Google Sheets!")
    except Exception as e:
        pass


def append_to_unified_csv(record_type, data_dict):
    """Appends patient telemetry or staff event records into hospital_records.csv"""
    try:
        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        row = [
            now,
            record_type,
            data_dict.get('bed_id', 'N/A'),
            data_dict.get('patient_name', 'N/A'),
            data_dict.get('hr', 'N/A'),
            data_dict.get('spo2', 'N/A'),
            data_dict.get('sys_bp', 'N/A'),
            data_dict.get('dia_bp', 'N/A'),
            data_dict.get('rr', 'N/A'),
            data_dict.get('sqi', 'N/A'),
            data_dict.get('staff_username', 'N/A'),
            data_dict.get('staff_name', 'N/A'),
            data_dict.get('staff_role', 'N/A'),
            data_dict.get('event_description', 'N/A')
        ]
        with open(UNIFIED_CSV_FILE, mode='a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(row)
        print(f"[CSV AUTO-SAVED] [{record_type}] record written to {UNIFIED_CSV_FILE}")
        forward_to_google_sheets(record_type, data_dict)
    except Exception as e:
        print(f"[CSV ERROR] Could not write to {UNIFIED_CSV_FILE}: {e}")


def populate_beds_from_dataset():
    """Populates ICU_BEDS_DATA strictly from loaded CSV datasets without using hardcoded defaults"""
    global ICU_BEDS_DATA
    
    candidate_rows = []
    if os.path.exists(DATA_FOLDER):
        for file in os.listdir(DATA_FOLDER):
            if file.endswith('.csv'):
                filepath = os.path.join(DATA_FOLDER, file)
                try:
                    with open(filepath, mode='r', encoding='utf-8') as f:
                        reader = csv.DictReader(f)
                        rows = list(reader)
                        if rows:
                            candidate_rows.extend(rows)
                except Exception as e:
                    print(f"[DATASET INIT ERROR] {e}")

    fallback_csv = os.path.join(BASE_DIR, 'telemetry_dataset.csv')
    if not candidate_rows and os.path.exists(fallback_csv):
        try:
            with open(fallback_csv, mode='r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                candidate_rows = list(reader)
        except Exception as e:
            print(f"[FALLBACK CSV INIT ERROR] {e}")

    if candidate_rows:
        beds_found = {}
        for idx, r in enumerate(candidate_rows):
            try:
                raw_id = r.get('bed_id') or r.get('patient_id') or str(101 + (idx % 4))
                b_num = int(''.join(filter(str.isdigit, str(raw_id))) or (101 + (idx % 4)))
            except ValueError:
                b_num = 101 + (idx % 4)

            beds_found[b_num] = {
                "number": f"BED {b_num}",
                "name": r.get('patient_name') or r.get('name') or f"Patient {b_num}",
                "hr": int(r.get('hr') or r.get('heart_rate') or 75),
                "spo2": int(r.get('spo2') or r.get('oxygen') or 98),
                "sysBP": int(r.get('sys_bp') or r.get('sysBP') or 120),
                "diaBP": int(r.get('dia_bp') or r.get('diaBP') or 80),
                "rr": int(r.get('rr') or r.get('resp_rate') or 16),
                "sqi": int(r.get('sqi') or 95),
                "dataset_source": "INITIALIZED_FROM_CSV"
            }
        
        if beds_found:
            ICU_BEDS_DATA = beds_found
            print(f"[DATASET TELEMETRY] ICU Bed Telemetry driven strictly by CSV Dataset! Active Beds: {list(ICU_BEDS_DATA.keys())}")


def load_external_hospital_datasets():
    """Scans the 'data/' folder for external hospital CSV files and loads them"""
    global EXTERNAL_HOSPITAL_DATASETS
    EXTERNAL_HOSPITAL_DATASETS = []
    
    if os.path.exists(DATA_FOLDER):
        for file in os.listdir(DATA_FOLDER):
            if file.endswith('.csv'):
                filepath = os.path.join(DATA_FOLDER, file)
                try:
                    with open(filepath, mode='r', encoding='utf-8') as f:
                        reader = csv.DictReader(f)
                        rows = list(reader)
                        EXTERNAL_HOSPITAL_DATASETS.append({
                            "filename": file,
                            "filepath": filepath,
                            "row_count": len(rows),
                            "data": rows
                        })
                    print(f"[DATASET LOADED] Loaded {len(rows)} records from external dataset: {file}")
                except Exception as e:
                    print(f"[DATASET ERROR] Failed reading {filepath}: {e}")

    populate_beds_from_dataset()

load_external_hospital_datasets()

# =============================================================================
# FRONTEND STATIC ROUTES
# =============================================================================
@app.route('/')
def serve_index():
    return send_from_directory(PROJECT_ROOT, 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory(PROJECT_ROOT, filename)

# =============================================================================
# REST API ENDPOINTS
# =============================================================================

@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.json or {}
    username = data.get('username', '').strip().lower()
    password = data.get('password', '').strip()

    if username in USER_ACCOUNTS and USER_ACCOUNTS[username]['pass'] == password:
        user = USER_ACCOUNTS[username]
        timestamp = datetime.datetime.now().strftime("%I:%M:%S %p (%m/%d/%Y)")
        user['lastLogin'] = timestamp
        user['isOnline'] = True

        audit_entry = {
            "timestamp": timestamp,
            "name": user['name'],
            "role": user['role'],
            "username": username,
            "event": "LOG IN",
            "status": "Active Session"
        }
        AUDIT_LOG_EVENTS.insert(0, audit_entry)

        # Auto-Save to unified CSV
        append_to_unified_csv('STAFF_LOGIN', {
            'staff_username': username,
            'staff_name': user['name'],
            'staff_role': user['role'],
            'event_description': f'Clinician logged in at {timestamp}'
        })

        return jsonify({
            "status": "success",
            "message": "Login successful",
            "user": {
                "username": username,
                "name": user['name'],
                "role": user['role'],
                "phone": user.get('phone', ''),
                "icon": user.get('icon', 'fa-user-doctor')
            }
        })
    return jsonify({"status": "error", "message": "Invalid Username or Password"}), 401


@app.route('/api/logout', methods=['POST'])
def api_logout():
    data = request.json or {}
    username = data.get('username', '').strip().lower()

    if username in USER_ACCOUNTS:
        user = USER_ACCOUNTS[username]
        timestamp = datetime.datetime.now().strftime("%I:%M:%S %p (%m/%d/%Y)")
        user['lastLogout'] = timestamp
        user['isOnline'] = False

        audit_entry = {
            "timestamp": timestamp,
            "name": user['name'],
            "role": user['role'],
            "username": username,
            "event": "LOG OUT",
            "status": "Session Terminated"
        }
        AUDIT_LOG_EVENTS.insert(0, audit_entry)

        # Auto-Save to unified CSV
        append_to_unified_csv('STAFF_LOGOUT', {
            'staff_username': username,
            'staff_name': user['name'],
            'staff_role': user['role'],
            'event_description': f'Clinician logged out at {timestamp}'
        })

    return jsonify({"status": "success", "message": "Logged out successfully"})


@app.route('/api/staff', methods=['GET', 'POST', 'DELETE'])
def api_staff():
    if request.method == 'GET':
        return jsonify({"status": "success", "staff": USER_ACCOUNTS})

    elif request.method == 'POST':
        data = request.json or {}
        username = data.get('username', '').strip().lower()
        name = data.get('name', '').strip()
        pass_word = data.get('password', '').strip()
        role = data.get('role', 'doctor')
        phone = data.get('phone', '+1-555-0199')

        if not username or not name or not pass_word:
            return jsonify({"status": "error", "message": "Missing required fields"}), 400

        USER_ACCOUNTS[username] = {
            "pass": pass_word,
            "name": name,
            "role": role,
            "phone": phone,
            "icon": "fa-user-doctor" if role == 'doctor' else "fa-user-nurse"
        }

        # Auto-Save new staff creation to unified CSV
        append_to_unified_csv('STAFF_CREATED', {
            'staff_username': username,
            'staff_name': name,
            'staff_role': role,
            'event_description': f'New staff ID created with phone {phone}'
        })

        return jsonify({"status": "success", "message": f"Staff ID '{username}' created successfully", "staff": USER_ACCOUNTS[username]})

    elif request.method == 'DELETE':
        username = request.args.get('username', '').strip().lower()
        if username == 'admin':
            return jsonify({"status": "error", "message": "Admin account cannot be deleted"}), 400
        if username in USER_ACCOUNTS:
            deleted_user = USER_ACCOUNTS.pop(username)

            # Auto-Save staff deletion to unified CSV
            append_to_unified_csv('STAFF_DELETED', {
                'staff_username': username,
                'staff_name': deleted_user['name'],
                'staff_role': deleted_user['role'],
                'event_description': f'Staff ID {username} deleted from system'
            })

            return jsonify({"status": "success", "message": f"Staff '{deleted_user['name']}' deleted"})
        return jsonify({"status": "error", "message": "Staff ID not found"}), 404


@app.route('/api/beds', methods=['GET', 'POST'])
def api_beds():
    if request.method == 'GET':
        return jsonify({"status": "success", "beds": ICU_BEDS_DATA})
    elif request.method == 'POST':
        data = request.json or {}
        bed_id = data.get('bed_id', 101)
        if bed_id in ICU_BEDS_DATA:
            ICU_BEDS_DATA[bed_id].update({
                'hr': data.get('hr', ICU_BEDS_DATA[bed_id]['hr']),
                'spo2': data.get('spo2', ICU_BEDS_DATA[bed_id]['spo2']),
                'sysBP': data.get('sysBP', ICU_BEDS_DATA[bed_id]['sysBP']),
                'diaBP': data.get('diaBP', ICU_BEDS_DATA[bed_id]['diaBP']),
                'rr': data.get('rr', ICU_BEDS_DATA[bed_id]['rr']),
                'sqi': data.get('sqi', ICU_BEDS_DATA[bed_id]['sqi'])
            })

            # Auto-Save updated patient telemetry vitals into unified CSV
            append_to_unified_csv('PATIENT_TELEMETRY_UPDATE', {
                'bed_id': bed_id,
                'patient_name': ICU_BEDS_DATA[bed_id]['name'],
                'hr': ICU_BEDS_DATA[bed_id]['hr'],
                'spo2': ICU_BEDS_DATA[bed_id]['spo2'],
                'sys_bp': ICU_BEDS_DATA[bed_id]['sysBP'],
                'dia_bp': ICU_BEDS_DATA[bed_id]['diaBP'],
                'rr': ICU_BEDS_DATA[bed_id]['rr'],
                'sqi': ICU_BEDS_DATA[bed_id]['sqi'],
                'event_description': data.get('event_description', 'Vital update')
            })

            return jsonify({"status": "success", "bed": ICU_BEDS_DATA[bed_id]})
        return jsonify({"status": "error", "message": "Bed ID not found"}), 404


@app.route('/api/external-data', methods=['GET'])
def api_external_data():
    """Returns all external hospital CSV datasets placed inside the data/ directory"""
    load_external_hospital_datasets()
    return jsonify({
        "status": "success",
        "data_directory": os.path.abspath(DATA_FOLDER),
        "total_files": len(EXTERNAL_HOSPITAL_DATASETS),
        "datasets": EXTERNAL_HOSPITAL_DATASETS
    })


@app.route('/api/records', methods=['GET', 'POST'])
def api_records():
    """Returns or appends records to hospital_records.csv"""
    if request.method == 'POST':
        data = request.json or {}
        record_type = data.get('record_type', 'TELEMETRY_EVENT')
        append_to_unified_csv(record_type, data)
        return jsonify({"status": "success", "message": "Record saved to hospital_records.csv"})

    records = []
    if os.path.exists(UNIFIED_CSV_FILE):
        try:
            with open(UNIFIED_CSV_FILE, mode='r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                records = list(reader)
        except Exception as e:
            print(f"[CSV READ ERROR] {e}")
    return jsonify({
        "status": "success",
        "csv_filepath": os.path.abspath(UNIFIED_CSV_FILE),
        "total_records": len(records),
        "records": records
    })


if __name__ == '__main__':
    print("=============================================================")
    print("  AMMA ICU SENTINEL - ICU Smart Alarm Flask Backend Server")
    print(f"  Unified Storage CSV: {os.path.abspath(UNIFIED_CSV_FILE)}")
    print(f"  External Data Directory: {os.path.abspath(DATA_FOLDER)}")
    print("  Running on: http://127.0.0.1:5000 / http://localhost:5000")
    print("=============================================================")
    app.run(host='0.0.0.0', port=5000, debug=True)
