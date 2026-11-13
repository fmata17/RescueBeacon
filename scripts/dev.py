"""Start the Python API and Vite together: python3 scripts/dev.py."""
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PYTHON = ROOT / "backend/.venv/bin/python"
processes = []


def main():
    os.chdir(ROOT)
    if not PYTHON.exists():
        interpreter = shutil.which("python3.14") or shutil.which("python3.13") or sys.executable
        subprocess.run([interpreter, "-m", "venv", str(PYTHON.parent.parent)], check=True)
    if subprocess.run([str(PYTHON), "-c", "import fastapi,uvicorn,openai,httpx,PIL"], capture_output=True).returncode:
        subprocess.run([str(PYTHON), "-m", "pip", "install", "-r", "backend/requirements.txt"], check=True)
    if not (ROOT / "frontend/node_modules/.bin/vite").exists():
        subprocess.run(["npm", "ci", "--prefix", "frontend"], check=True)
    for port in (5173, 8000):
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind(("0.0.0.0", port))
            except OSError:
                raise SystemExit(f"Port {port} is already in use. Stop the older RescueBeacon server, then run npm run dev from the repository root.")
    print("\nRescueBeacon: http://127.0.0.1:5173\nAPI: http://127.0.0.1:8000/docs\nCtrl+C stops both.\n", flush=True)
    processes.append(subprocess.Popen([str(PYTHON), "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000"], start_new_session=True))
    processes.append(subprocess.Popen(["npm", "--prefix", "frontend", "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173", "--strictPort"], start_new_session=True))
    while all(p.poll() is None for p in processes):
        time.sleep(0.3)
    raise SystemExit(next((p.returncode for p in processes if p.poll() is not None), 1))


try:
    main()
except KeyboardInterrupt:
    pass
finally:
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    for process in processes:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
    for process in processes:
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
