import gspread
import shutil
import os
from pathlib import Path
from google.oauth2.service_account import Credentials

# ================= CONFIGURATION =================
# Production paths are anonymized for this public repository.
BASE_DIR = Path("./data")
IMG_SOURCE_DIR = BASE_DIR / "webp_master"
ARCHIVE_DIR = BASE_DIR / "archive"
SERVICE_ACCOUNT_FILE = BASE_DIR / "credentials.json"
SPREADSHEET_NAME = "BBK_MASTER_SYSTEM"
WORKSHEET_NAME = "MASTER_INVENTORY"

def clean_published():
    # Ensure the archive directory exists
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    
    # 1. API authentication
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive"
    ]
    creds = Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=scopes)
    client = gspread.authorize(creds)
    
    print("Connecting to Google Sheets...")
    sheet = client.open(SPREADSHEET_NAME).worksheet(WORKSHEET_NAME)
    
    # 2. Retrieve all data
    rows = sheet.get_all_values()
    headers = rows[0]
    data = rows[1:]
    
    # Debug: Ensure required headers are detected correctly
    try:
        idx_kode = headers.index("SKU")
        idx_status = headers.index("STATUS_PIPELINE")
    except ValueError as e:
        print("Error: Required columns were not found in the Sheet! Make sure the headers are 'SKU' and 'STATUS_PIPELINE'.")
        print(f"Detected headers: {headers}")
        return
    
    updates = []
    print(f"Checking {len(data)} products...")
    
    # 3. Process published products
    for i, row in enumerate(data):
        kode = row[idx_kode]
        status = row[idx_status]
        
        if status == "PUBLISHED" and kode:
            # Find files whose names begin with the SKU (example: BBK0051_*)
            files_found = list(IMG_SOURCE_DIR.glob(f"{kode}_*"))
            
            if files_found:
                for file_path in files_found:
                    try:
                        dest_path = ARCHIVE_DIR / file_path.name
                        shutil.move(str(file_path), str(dest_path))
                        print(f"✅ Archived: {file_path.name}")
                    except Exception as e:
                        print(f"❌ Failed to move {file_path.name}: {e}")
                
                # Mark the corresponding Google Sheets fields for clearing (Columns M and N)
                row_num = i + 2
                updates.append({'range': f"M{row_num}:N{row_num}", 'values': [["", ""]]})
    
    # 4. Batch update Google Sheets
    if updates:
        sheet.batch_update(updates)
        print(f"\n✨ Completed! {len(updates)} products were cleaned from the Sheet.")
    else:
        print("\nNo newly published products need to be cleaned.")

if __name__ == "__main__":
    clean_published()
