"""
==============================================================================
AMMA ICU SENTINEL - Flask REST API Server (Root Entry Point)
==============================================================================
Loads real-world ICU patient monitoring data directly from a CSV file.
Removes all hardcoded mock arrays and fallback synthetic data generators.
"""

import os
import sys
import argparse

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend'))

from app import app, initialize_data_loader, parse_args

if __name__ == '__main__':
    args = parse_args()
    initialize_data_loader(data_path=args.data_path, chunksize=args.chunksize)
    app.run(host=args.host, port=args.port, debug=False)
