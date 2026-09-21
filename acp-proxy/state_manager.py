import json
import sqlite3
import threading
import datetime
from pathlib import Path

class StateManager:
    def __init__(self, json_path='dna_state_strand_a.json', db_path='failure_memory.db'):
        self.json_path = Path(json_path)
        self.db_path = Path(db_path)
        self.lock = threading.Lock()
        self._init_json()
        self._init_db()

    def _init_json(self):
        if not self.json_path.exists():
            initial_data = {
                'cycle_status': 'unknown',
                'memory': []
            }
            with open(self.json_path, 'w') as f:
                json.dump(initial_data, f, indent=2)
        else:
            with open(self.json_path, 'r') as f:
                data = json.load(f)
            data.setdefault('cycle_status', 'unknown')
            data.setdefault('memory', [])
            with open(self.json_path, 'w') as f:
                json.dump(data, f, indent=2)

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS verification_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                status TEXT,
                failure_count INTEGER,
                details TEXT
            )
        ''')
        conn.commit()
        conn.close()

    def update_state(self, status, failure_count, details=None):
        with self.lock:
            with open(self.json_path, 'r') as f:
                data = json.load(f)
            
            data['cycle_status'] = status
            
            record = {
                'timestamp': datetime.datetime.now().isoformat(),
                'status': status,
                'failure_count': failure_count,
                'details': details
            }
            data['memory'].append(record)
            
            if len(data['memory']) > 1000:
                data['memory'] = data['memory'][-1000:]
            
            with open(self.json_path, 'w') as f:
                json.dump(data, f, indent=2)
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO verification_records (status, failure_count, details)
                VALUES (?, ?, ?)
            ''', (status, failure_count, details))
            conn.commit()
            conn.close()

    def get_current_status(self):
        with open(self.json_path, 'r') as f:
            data = json.load(f)
        return data.get('cycle_status', 'unknown')

    def get_memory(self):
        with open(self.json_path, 'r') as f:
            data = json.load(f)
        return data.get('memory', [])