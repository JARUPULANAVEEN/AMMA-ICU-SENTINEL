"""
==============================================================================
AMMA ICU SENTINEL - Real-World Monitoring CSV Data Loader Engine
==============================================================================
Provides robust, scalable, streaming/chunked CSV parsing, schema normalization,
input validation, missing value imputation, and clinical telemetry streaming.
Supports custom fields: Timestamp, Patient_ID, Patient_Name, Doctor_ID, Doctor_Name,
Nurse_ID, Nurse_Name, Gravity_Field, Antigravity_Index.
"""

import os
import sys
import logging
import pandas as pd
import numpy as np
from datetime import datetime

# Setup Logger
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("CSVDataLoader")

# Default Standard & Extended Clinical Telemetry Schema Mapping
SCHEMA_MAPPING = {
    'heart_rate': 'hr',
    'hr': 'hr',
    'pulse': 'hr',
    'oxygen_saturation': 'spo2',
    'spo2': 'spo2',
    'o2_sat': 'spo2',
    'systolic_bp': 'sys_bp',
    'sys_bp': 'sys_bp',
    'sys': 'sys_bp',
    'diastolic_bp': 'dia_bp',
    'dia_bp': 'dia_bp',
    'dia': 'dia_bp',
    'respiratory_rate': 'rr',
    'rr': 'rr',
    'resp': 'rr',
    'signal_quality': 'sqi',
    'sqi': 'sqi',
    'sqi_index': 'sqi',
    'temperature': 'temp',
    'temp': 'temp',
    'lactate': 'lactate',
    'lactate_level': 'lactate',
    'mean_arterial_pressure': 'map',
    'map': 'map',
    'bed': 'bed_id',
    'bed_id': 'bed_id',
    'bed_number': 'bed_id',
    'patient': 'patient_name',
    'patient_name': 'patient_name',
    'patient_id': 'patient_id',
    'doctor_id': 'doctor_id',
    'doctor_name': 'doctor_name',
    'nurse_id': 'nurse_id',
    'nurse_name': 'nurse_name',
    'gravity_field': 'gravity_field',
    'antigravity_index': 'antigravity_index',
    'diagnosis': 'diagnosis',
    'time': 'timestamp',
    'timestamp': 'timestamp',
    'date': 'timestamp'
}

# Physiological & Extended Field Normalization Defaults
CLINICAL_DEFAULTS = {
    'hr': 75.0,
    'spo2': 98.0,
    'sys_bp': 120.0,
    'dia_bp': 80.0,
    'rr': 16.0,
    'sqi': 95.0,
    'temp': 37.0,
    'lactate': 1.2,
    'map': 93.3,
    'gravity_field': 9.81,
    'antigravity_index': 5.0,
    'bed_id': '101',
    'patient_name': 'John Doe',
    'patient_id': 'P101',
    'doctor_id': 'DOC502',
    'doctor_name': 'Dr. Sarah Connor',
    'nurse_id': 'NUR304',
    'nurse_name': 'Nurse Alex Smith',
    'diagnosis': 'ICU Telemetry Monitoring'
}

# Physiological Validation Bounds
VALIDATION_BOUNDS = {
    'hr': (20, 250),
    'spo2': (50, 100),
    'sys_bp': (40, 260),
    'dia_bp': (20, 160),
    'rr': (4, 60),
    'sqi': (0, 100)
}


class CSVTelemetryDataLoader:
    """
    Dynamic CSV Reader & Telemetry Pipeline for Real-World Monitoring Data.
    Supports scalable streaming/chunking, schema alignment, and input validation.
    """

    def __init__(self, data_path: str = None, chunksize: int = 5000):
        self.data_path = self._resolve_data_path(data_path)
        self.chunksize = chunksize
        self.df = None
        self.beds_cache = {}
        self.last_loaded_time = None
        self.load_data()

    def _resolve_data_path(self, provided_path: str) -> str:
        """Resolves data path from argument, env variable, or default fallbacks."""
        if provided_path and os.path.exists(provided_path):
            return os.path.abspath(provided_path)

        env_path = os.environ.get("DATA_PATH")
        if env_path and os.path.exists(env_path):
            return os.path.abspath(env_path)

        candidates = [
            os.path.join(os.getcwd(), "data", "docter_nures_data.csv"),
            os.path.join(os.getcwd(), "data", "telemetry_dataset.csv"),
            os.path.join(os.getcwd(), "data", "hospital_records.csv"),
            os.path.join(os.path.dirname(__file__), "..", "data", "docter_nures_data.csv"),
            os.path.join(os.path.dirname(__file__), "..", "data", "telemetry_dataset.csv")
        ]

        for cand in candidates:
            if os.path.exists(cand):
                return os.path.abspath(cand)

        raise FileNotFoundError(
            f"Unable to locate valid monitoring dataset CSV file! Provided: '{provided_path}'."
        )

    def load_data(self) -> pd.DataFrame:
        """
        Loads, cleans, validates, and normalizes real-world CSV monitoring data.
        Uses streaming chunk processing for large time-series datasets.
        """
        logger.info(f"Loading real-world monitoring dataset from: {self.data_path}")

        try:
            chunks = []
            for chunk in pd.read_csv(self.data_path, chunksize=self.chunksize, skipinitialspace=True):
                normalized_chunk = self._normalize_and_validate_chunk(chunk)
                if not normalized_chunk.empty:
                    chunks.append(normalized_chunk)

            if not chunks:
                logger.warning("CSV file was empty or contained no valid records. Creating empty schema frame.")
                self.df = pd.DataFrame(columns=list(CLINICAL_DEFAULTS.keys()))
            else:
                self.df = pd.concat(chunks, ignore_index=True)

            self._process_bed_telemetry()
            self.last_loaded_time = datetime.now()
            logger.info(f"Successfully loaded & validated {len(self.df)} monitoring records across {len(self.beds_cache)} ICU beds.")
            return self.df

        except Exception as e:
            logger.error(f"Error parsing CSV dataset file '{self.data_path}': {e}")
            raise

    def _normalize_and_validate_chunk(self, chunk: pd.DataFrame) -> pd.DataFrame:
        """
        Standardizes column names, validates data types, handles missing values,
        and enforces physiological safety bounds.
        """
        col_rename = {}
        for col in chunk.columns:
            clean_col = str(col).strip().lower()
            if clean_col in SCHEMA_MAPPING:
                col_rename[col] = SCHEMA_MAPPING[clean_col]
            else:
                col_rename[col] = clean_col

        chunk = chunk.rename(columns=col_rename)

        # Parse & standardize timestamps
        if 'timestamp' in chunk.columns:
            chunk['timestamp'] = pd.to_datetime(chunk['timestamp'], errors='coerce')
            chunk['timestamp'] = chunk['timestamp'].dt.strftime('%Y-%m-%d %H:%M:%S')
            chunk['timestamp'] = chunk['timestamp'].fillna(datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
        else:
            chunk['timestamp'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        # Extract bed_id from patient_id if bed_id is missing (e.g. P101 -> 101)
        if 'bed_id' not in chunk.columns or chunk['bed_id'].isnull().all():
            if 'patient_id' in chunk.columns:
                chunk['bed_id'] = chunk['patient_id'].astype(str).str.extract(r'(\d+)')[0].fillna('101')
            else:
                chunk['bed_id'] = '101'

        # Ensure numeric columns are cast properly & impute missing rows
        numeric_cols = ['hr', 'spo2', 'sys_bp', 'dia_bp', 'rr', 'sqi', 'temp', 'lactate', 'map', 'gravity_field', 'antigravity_index']
        for col in numeric_cols:
            if col in chunk.columns:
                chunk[col] = pd.to_numeric(chunk[col], errors='coerce')
                default_val = CLINICAL_DEFAULTS.get(col, 0.0)
                chunk[col] = chunk[col].fillna(default_val)
            else:
                chunk[col] = CLINICAL_DEFAULTS.get(col, 0.0)

            if col in VALIDATION_BOUNDS:
                min_b, max_b = VALIDATION_BOUNDS[col]
                chunk[col] = chunk[col].clip(lower=min_b, upper=max_b)

        # Handle string columns
        string_cols = ['bed_id', 'patient_name', 'patient_id', 'doctor_id', 'doctor_name', 'nurse_id', 'nurse_name', 'diagnosis']
        for col in string_cols:
            if col in chunk.columns:
                chunk[col] = chunk[col].astype(str).str.strip()
                chunk[col] = chunk[col].replace({'nan': '', 'None': '', 'N/A': ''})
                chunk[col] = chunk[col].apply(lambda x: x if len(x) > 0 else CLINICAL_DEFAULTS.get(col, ''))
            else:
                chunk[col] = CLINICAL_DEFAULTS.get(col, '')

        chunk['bed_id'] = chunk['bed_id'].str.replace(r'(?i)bed\s*', '', regex=True)

        return chunk

    def _process_bed_telemetry(self):
        """Builds real-time bed telemetry cache grouped by bed_id from CSV data."""
        self.beds_cache = {}
        if self.df.empty:
            return

        grouped = self.df.groupby('bed_id')
        for bed_key, group in grouped:
            latest = group.iloc[-1]
            bed_str = str(bed_key).strip()
            bed_num = f"BED {bed_str}"
            patient_name = latest['patient_name'] if latest['patient_name'] else f"ICU Patient {bed_str}"
            patient_id = latest['patient_id'] if latest['patient_id'] else f"ICU-{bed_str}"
            doctor_name = latest['doctor_name'] if latest['doctor_name'] else "Dr. Sarah Connor"
            nurse_name = latest['nurse_name'] if latest['nurse_name'] else "Nurse Alex Smith"
            diagnosis = latest['diagnosis'] if latest['diagnosis'] else f"Attending: {doctor_name} | Nurse: {nurse_name}"

            full_display_name = f"{patient_name} ({patient_id}) • {diagnosis}"

            self.beds_cache[bed_str] = {
                "number": bed_num,
                "name": full_display_name,
                "patientId": patient_id,
                "patientName": patient_name,
                "doctorId": str(latest['doctor_id']),
                "doctorName": doctor_name,
                "attendingDoctor": doctor_name,
                "nurseId": str(latest['nurse_id']),
                "nurseName": nurse_name,
                "assignedNurse": nurse_name,
                "gravityField": float(round(latest['gravity_field'], 2)),
                "antigravityIndex": float(round(latest['antigravity_index'], 2)),
                "diagnosis": diagnosis,
                "hr": int(round(latest['hr'])),
                "spo2": int(round(latest['spo2'])),
                "sysBP": int(round(latest['sys_bp'])),
                "diaBP": int(round(latest['dia_bp'])),
                "rr": int(round(latest['rr'])),
                "sqi": int(round(latest['sqi'])),
                "temp": float(round(latest['temp'], 1)),
                "lactate": float(round(latest['lactate'], 1)),
                "map": float(round(latest['map'], 1)),
                "timestamp": str(latest['timestamp'])
            }

    def get_latest_beds(self) -> dict:
        """Returns the parsed real-world ICU beds telemetry object."""
        if not self.beds_cache:
            self._process_bed_telemetry()
        return self.beds_cache

    def get_telemetry_stream(self, bed_id: str = None, limit: int = 100) -> list:
        """Returns historical time-series telemetry records from CSV."""
        if self.df is None or self.df.empty:
            return []

        df_filtered = self.df
        if bed_id:
            clean_bed = str(bed_id).replace("BED", "").strip()
            df_filtered = self.df[self.df['bed_id'] == clean_bed]

        records = df_filtered.tail(limit).to_dict(orient='records')
        return records

    def append_record(self, record_dict: dict) -> bool:
        """Appends a new record to the CSV dataset."""
        try:
            record_df = pd.DataFrame([record_dict])
            record_df = self._normalize_and_validate_chunk(record_df)
            header = not os.path.exists(self.data_path) or os.path.getsize(self.data_path) == 0
            record_df.to_csv(self.data_path, mode='a', header=header, index=False)
            self.load_data()
            return True
        except Exception as e:
            logger.error(f"Failed to append record to CSV: {e}")
            return False
