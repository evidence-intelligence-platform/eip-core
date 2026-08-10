"""
EIF Database Backup & Restore CLI Tool
---
Version: 1.0.0
Owner: EIF Architecture Team
---
Supports automated snapshot backups, restores, and 30-day retention cleanup
for local SQLite or PostgreSQL databases.

Usage:
  python scripts/backup_db.py backup
  python scripts/backup_db.py list
  python scripts/backup_db.py restore <backup_filename>
  python scripts/backup_db.py prune
"""

import datetime
import glob
import gzip
import os
import shutil
import subprocess
import sys

# Ensure root directory is in sys.path
sys.path.insert(0, os.path.realpath(os.path.join(os.path.dirname(__file__), "..")))

BACKUP_DIR = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", "backups"))
RETENTION_DAYS = 30


def ensure_backup_dir():
    if not os.path.exists(BACKUP_DIR):
        os.makedirs(BACKUP_DIR, exist_ok=True)


def get_db_path_from_url(db_url: str) -> str:
    if db_url.startswith("sqlite:///"):
        relative_path = db_url.replace("sqlite:///", "")
        base_dir = os.path.realpath(os.path.join(os.path.dirname(__file__), ".."))
        return os.path.join(base_dir, relative_path)
    return ""


def create_backup():
    ensure_backup_dir()
    db_url = os.getenv("DATABASE_URL", "sqlite:///database.db")
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

    print(f"[BACKUP] Target database URL: {db_url}")

    if db_url.startswith("sqlite:///"):
        db_file = get_db_path_from_url(db_url)
        if not os.path.exists(db_file):
            print(f"[ERROR] SQLite database file not found at: {db_file}")
            sys.exit(1)

        backup_name = f"sqlite_backup_{timestamp}.db.gz"
        backup_path = os.path.join(BACKUP_DIR, backup_name)

        print(f"[BACKUP] Compressing {os.path.basename(db_file)} -> {backup_name}...")
        with open(db_file, "rb") as f_in:
            with gzip.open(backup_path, "wb") as f_out:
                shutil.copyfileobj(f_in, f_out)

        size_kb = os.path.getsize(backup_path) / 1024
        print(f"[SUCCESS] Database snapshot created successfully! File: {backup_name} ({size_kb:.1f} KB)")
        print(f"[PATH] Saved to: {backup_path}")

    elif db_url.startswith("postgresql://") or db_url.startswith("postgres://"):
        # This branch used to print SUCCESS without writing anything, so every
        # production "backup" silently produced no file. It now runs pg_dump for
        # real and fails loudly if it cannot.
        print("[BACKUP] PostgreSQL database detected.")

        pg_dump = shutil.which("pg_dump")
        if not pg_dump:
            print("[ERROR] pg_dump not found on PATH. Install the PostgreSQL client tools")
            print("        (e.g. `apt-get install postgresql-client`) and retry.")
            sys.exit(1)

        backup_name = f"postgres_backup_{timestamp}.sql.gz"
        backup_path = os.path.join(BACKUP_DIR, backup_name)
        partial_path = backup_path + ".partial"

        print(f"[BACKUP] Dumping to {backup_name}...")
        try:
            with gzip.open(partial_path, "wb") as f_out:
                proc = subprocess.Popen(
                    [pg_dump, "--no-owner", "--no-privileges", "--format=plain", db_url],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                )
                assert proc.stdout is not None
                shutil.copyfileobj(proc.stdout, f_out)
                proc.stdout.close()
                stderr = proc.stderr.read().decode("utf-8", "replace") if proc.stderr else ""
                code = proc.wait()

            if code != 0:
                os.remove(partial_path)
                print(f"[ERROR] pg_dump exited with code {code}")
                if stderr.strip():
                    print(stderr.strip())
                sys.exit(1)

            # A dump that produced almost nothing is a failure wearing a success
            # costume — an empty gzip member is ~20 bytes.
            if os.path.getsize(partial_path) < 200:
                os.remove(partial_path)
                print("[ERROR] pg_dump produced an empty archive — refusing to keep it.")
                sys.exit(1)

            os.replace(partial_path, backup_path)
        except Exception as exc:  # noqa: BLE001 - the CLI reports and exits
            if os.path.exists(partial_path):
                os.remove(partial_path)
            print(f"[ERROR] Backup failed: {exc}")
            sys.exit(1)

        size_kb = os.path.getsize(backup_path) / 1024
        print(f"[SUCCESS] PostgreSQL dump written: {backup_name} ({size_kb:.1f} KB)")
        print(f"[PATH] Saved to: {backup_path}")

    else:
        print(f"[ERROR] Unsupported DATABASE_URL scheme: {db_url}")
        sys.exit(1)


def list_backups():
    ensure_backup_dir()
    pattern = os.path.join(BACKUP_DIR, "*.gz")
    files = sorted(glob.glob(pattern), reverse=True)

    print("\n==================================================")
    print(" AVAILABLE DATABASE BACKUPS")
    print("==================================================")
    if not files:
        print(" No database backups found in backups/ directory.")
        print("==================================================\n")
        return

    for idx, filepath in enumerate(files, 1):
        filename = os.path.basename(filepath)
        size_kb = os.path.getsize(filepath) / 1024
        mtime = datetime.datetime.fromtimestamp(os.path.getmtime(filepath)).strftime("%Y-%m-%d %H:%M:%S")
        print(f" {idx}. {filename} | {size_kb:.1f} KB | Created: {mtime}")
    print("==================================================\n")


def restore_backup(backup_filename: str):
    ensure_backup_dir()
    backup_path = os.path.join(BACKUP_DIR, backup_filename)

    if not os.path.exists(backup_path):
        print(f"[ERROR] Specified backup file does not exist: {backup_path}")
        sys.exit(1)

    db_url = os.getenv("DATABASE_URL", "sqlite:///database.db")
    if db_url.startswith("sqlite:///"):
        db_file = get_db_path_from_url(db_url)
        print(f"[RESTORE] Decompressing {backup_filename} -> {os.path.basename(db_file)}...")

        # Create temporary safety copy if existing db exists
        if os.path.exists(db_file):
            safety_copy = db_file + ".bak"
            shutil.copy2(db_file, safety_copy)
            print(f"[SAFETY] Existing database safely backed up to {os.path.basename(safety_copy)}")

        with gzip.open(backup_path, "rb") as f_in:
            with open(db_file, "wb") as f_out:
                shutil.copyfileobj(f_in, f_out)

        print(f"[SUCCESS] Database successfully restored from {backup_filename}!")

    elif db_url.startswith("postgresql://") or db_url.startswith("postgres://"):
        # Previously this printed an error and exited 0, so a failed restore
        # looked like a successful one to any caller checking the exit code.
        psql = shutil.which("psql")
        if not psql:
            print("[ERROR] psql not found on PATH. Install the PostgreSQL client tools")
            print("        (e.g. `apt-get install postgresql-client`) and retry.")
            sys.exit(1)

        if os.getenv("CONFIRM_RESTORE") != "yes":
            print("[ABORT] Restoring overwrites the target database.")
            print("        Re-run with CONFIRM_RESTORE=yes to proceed.")
            sys.exit(1)

        print(f"[RESTORE] Streaming {backup_filename} into the target database...")
        try:
            proc = subprocess.Popen(
                [psql, "--quiet", "--set", "ON_ERROR_STOP=on", db_url],
                stdin=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            assert proc.stdin is not None
            with gzip.open(backup_path, "rb") as f_in:
                shutil.copyfileobj(f_in, proc.stdin)
            proc.stdin.close()
            stderr = proc.stderr.read().decode("utf-8", "replace") if proc.stderr else ""
            code = proc.wait()
        except Exception as exc:  # noqa: BLE001 - the CLI reports and exits
            print(f"[ERROR] Restore failed: {exc}")
            sys.exit(1)

        if code != 0:
            print(f"[ERROR] psql exited with code {code}")
            if stderr.strip():
                print(stderr.strip())
            sys.exit(1)

        print(f"[SUCCESS] Database restored from {backup_filename}.")

    else:
        print(f"[ERROR] Unsupported DATABASE_URL scheme: {db_url}")
        sys.exit(1)


def prune_old_backups():
    ensure_backup_dir()
    pattern = os.path.join(BACKUP_DIR, "*.gz")
    files = glob.glob(pattern)
    now = datetime.datetime.now()
    deleted_count = 0

    print(f"[PRUNE] Scanning for backups older than {RETENTION_DAYS} days...")
    for filepath in files:
        mtime = datetime.datetime.fromtimestamp(os.path.getmtime(filepath))
        age_days = (now - mtime).days
        if age_days > RETENTION_DAYS:
            os.remove(filepath)
            print(f"  * Removed expired backup: {os.path.basename(filepath)} ({age_days} days old)")
            deleted_count += 1

    print(f"[SUCCESS] Prune complete! Removed {deleted_count} expired backup(s).")


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/backup_db.py [backup|list|restore <filename>|prune]")
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "backup":
        create_backup()
    elif command == "list":
        list_backups()
    elif command == "restore":
        if len(sys.argv) < 3:
            print("[ERROR] Please specify backup filename to restore: python scripts/backup_db.py restore <filename>")
            sys.exit(1)
        restore_backup(sys.argv[2])
    elif command == "prune":
        prune_old_backups()
    else:
        print(f"[ERROR] Unknown command: '{command}'. Available: backup, list, restore, prune")
        sys.exit(1)


if __name__ == "__main__":
    main()
