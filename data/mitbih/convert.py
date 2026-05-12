# data/mitbih/convert.py
# Use: python convert.py 100
# Generates 100.csv with columns: time_s,ecg_mv

import wfdb
import numpy as np
import sys
import os

def convert(record_name):
    # Read the record MIT-BIH
    record = wfdb.rdrecord(record_name)
    
    # Get the first signal (canal MLII) and sampling frequency
    signal = record.p_signal[:, 0] 
    fs = record.fs 
    n = len(signal)
    
    # Generate time axis
    time = np.arange(n) / fs
    
    # Write CSV
    out_path = f"{record_name}.csv"
    with open(out_path, "w") as f:
        f.write("time_s,ecg_mv\n")
        for t, v in zip(time, signal):
            f.write(f"{t:.6f},{v:.6f}\n")
    
    print(f"[OK] {n} samples @ {fs} Hz → {out_path}")
    print(f"Duration: {n/fs:.1f} s | Channel: {record.sig_name[0]}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Use: python convert.py <record_name>")
        print("Example: python convert.py 100")
        sys.exit(1)
    
    # Change to the script's directory so that wfdb can find the files
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    convert(sys.argv[1])