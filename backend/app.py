import json
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

ICU_BEDS_DATA = {
    "101": {"number": "BED 101", "name": "John Doe (64M) • Cardiac Post-Op", "patientId": "ICU-101", "patientName": "John Doe (64M)", "hr": 72, "spo2": 98, "sysBP": 120, "diaBP": 80, "rr": 16, "sqi": 96},
    "102": {"number": "BED 102", "name": "Sarah C. (52F) • COPD Severe Baseline", "patientId": "ICU-102", "patientName": "Sarah C. (52F)", "hr": 84, "spo2": 93, "sysBP": 118, "diaBP": 76, "rr": 18, "sqi": 94},
    "103": {"number": "BED 103", "name": "Robert M. (71M) • Sepsis Telemetry", "patientId": "ICU-103", "patientName": "Robert M. (71M)", "hr": 142, "spo2": 95, "sysBP": 105, "diaBP": 65, "rr": 22, "sqi": 91},
    "104": {"number": "BED 104", "name": "Elena R. (45F) • Acute Trauma ICU", "patientId": "ICU-104", "patientName": "Elena R. (45F)", "hr": 68, "spo2": 99, "sysBP": 124, "diaBP": 82, "rr": 14, "sqi": 98}
}

STORED_RECORDS = []

@app.route('/', methods=['GET'])
def index():
    return jsonify({"status": "active", "system": "AMMA ICU SENTINEL Smart Alarm API"})

@app.route('/api/beds', methods=['GET'])
def get_beds():
    return jsonify({"beds": ICU_BEDS_DATA})

@app.route('/api/records', methods=['POST', 'GET'])
def handle_records():
    if request.method == 'POST':
        data = request.json or {}
        STORED_RECORDS.append(data)
        return jsonify({"status": "success", "count": len(STORED_RECORDS)})
    return jsonify({"records": STORED_RECORDS})

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=False)
