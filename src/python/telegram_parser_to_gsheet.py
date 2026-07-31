# -*- coding: utf-8 -*-

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import gspread
from google.oauth2.service_account import Credentials
from PIL import Image
from requests.exceptions import ReadTimeout  # Handles network timeout errors
from tqdm import tqdm

# =========================================================
# CONFIGURATION
# Production paths and source identifiers are anonymized.
# =========================================================
BASE_DIR = Path("./data")
EXPORT_ROOT = BASE_DIR / "exports"

# Master directory for processed product images
OUTPUT_DIR = BASE_DIR / "webp_master"
IMG_DIR = OUTPUT_DIR

LOGO_FILE = BASE_DIR / "logo.png"
LOGO_SIZE_PERCENT = 0.50
LOGO_OPACITY = 200

MAX_PHOTOS = 999
MAX_SIDE = 1600
WEBP_QUALITY = 80
PHOTO_URL_PREFIX = ""
TIME_WINDOW = 15

SERVICE_ACCOUNT_FILE = BASE_DIR / "credentials.json"
SPREADSHEET_NAME = "BBK_MASTER_SYSTEM"
WORKSHEET_NAME = "RAW_INVENTORY"

LOCAL_TZ = ZoneInfo("Asia/Jakarta")

# Warehouse names and locations are anonymized for the public repository.
WAREHOUSE_MAP = {
    "SOURCE_01": "WAREHOUSE_A", "SOURCE_02": "WAREHOUSE_A",
    "SOURCE_03": "WAREHOUSE_A", "SOURCE_04": "WAREHOUSE_A",
    "SOURCE_05": "WAREHOUSE_B", "SOURCE_06": "WAREHOUSE_C",
    "SOURCE_07": "WAREHOUSE_D", "SOURCE_08": "WAREHOUSE_E",
    "SOURCE_09": "WAREHOUSE_E", "SOURCE_10": "WAREHOUSE_B",
}

# Private Telegram group URLs are intentionally excluded.
SOURCE_MAP = {
    "SOURCE_01": "TELEGRAM_SOURCE_URL_01", "SOURCE_02": "TELEGRAM_SOURCE_URL_02",
    "SOURCE_03": "TELEGRAM_SOURCE_URL_03", "SOURCE_04": "TELEGRAM_SOURCE_URL_04",
    "SOURCE_05": "TELEGRAM_SOURCE_URL_05", "SOURCE_06": "TELEGRAM_SOURCE_URL_06",
    "SOURCE_07": "TELEGRAM_SOURCE_URL_07", "SOURCE_08": "TELEGRAM_SOURCE_URL_08",
    "SOURCE_09": "TELEGRAM_SOURCE_URL_09", "SOURCE_10": "TELEGRAM_SOURCE_URL_10",
}

# --- Core connection and processing functions ---
def connect_sheet():
    scopes = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"]
    creds = Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=scopes)
    client = gspread.authorize(creds)
    
    # Increase the global gspread timeout to reduce connection failures
    client.timeout = 60
    
    return client.open(SPREADSHEET_NAME).worksheet(WORKSHEET_NAME)

def resize_and_compress_webp(src, dest):
    try:
        img = Image.open(src).convert("RGB")
        w, h = img.size
        scale = min(MAX_SIDE / max(w, h), 1.0)
        if scale < 1.0:
            img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
            w, h = img.size
        if LOGO_FILE.exists():
            logo_raw = Image.open(LOGO_FILE).convert("RGBA")
            target_w = int(w * LOGO_SIZE_PERCENT)
            logo_h = int(logo_raw.size[1] * (target_w / logo_raw.size[0]))
            logo = logo_raw.resize((target_w, logo_h), Image.LANCZOS)
            alpha = logo.getchannel("A").point(lambda i: int(i * LOGO_OPACITY / 255))
            logo.putalpha(alpha)
            img_rgba = img.convert("RGBA")
            x, y = (w - target_w) // 2, int(h * 0.03)
            img_rgba.paste(logo, (x, y), logo)
            img = img_rgba.convert("RGB")
        img.save(dest, "WEBP", quality=WEBP_QUALITY, optimize=True, method=6)
    except Exception as e: print(f"Failed to process {src}: {e}")

def process_photos(unit_code, photo_paths):
    links, cleaned, seen = [], [], set()
    for p in photo_paths:
        if str(p) not in seen:
            seen.add(str(p)); cleaned.append(p)
    for i, src in enumerate(tqdm(cleaned[:MAX_PHOTOS], desc=f"Photos {unit_code}", leave=False), start=1):
        filename = f"{unit_code}_{i}.webp"
        resize_and_compress_webp(src, IMG_DIR / filename)
        links.append(f"{PHOTO_URL_PREFIX}{filename}")
    return links

def parse_telegram_text(raw_text):
    if isinstance(raw_text, str): return " ".join(raw_text.split())
    if isinstance(raw_text, list):
        parts = [item.get("text", "") if isinstance(item, dict) else item for item in raw_text]
        return " ".join("".join(parts).split())
    return ""

def extract_units(src_code, base_url):
    folder = EXPORT_ROOT / src_code
    path = folder / "result.json"
    if not path.exists(): return []
    with open(path, "r", encoding="utf-8") as f: data = json.load(f)
    msgs = sorted([m for m in data.get("messages", []) if m.get("type") == "message" and m.get("photo")], key=lambda x: x.get("id", 0))
    grouped, current_group, last_ts, group_index = {}, [], None, 0
    for m in msgs:
        ts = int(m.get("date_unixtime", 0))
        if last_ts is None or abs(ts - last_ts) <= TIME_WINDOW: current_group.append(m)
        else:
            grouped[f"time_album_{group_index}"] = current_group
            group_index += 1; current_group = [m]
        last_ts = ts
    if current_group: grouped[f"time_album_{group_index}"] = current_group
    units = []
    for group in grouped.values():
        text_candidates = [(m, parse_telegram_text(m.get("text", "")).strip()) for m in group if parse_telegram_text(m.get("text", ""))]
        if not text_candidates: continue
        cap_msg, caption = max(text_candidates, key=lambda x: len(x[1]))
        if len(caption) < 30: continue
        photos = [folder / m["photo"] for m in group if "photo" in m and (folder / m["photo"]).exists()]
        if photos:
            units.append({
                "link": f"{base_url}/{cap_msg['id']}",
                "caption": caption,
                "timestamp": datetime.fromtimestamp(int(cap_msg["date_unixtime"]), tz=timezone.utc).astimezone(LOCAL_TZ).strftime("%Y-%m-%d %H:%M:%S"),
                "photos": photos,
                "src": src_code
            })
    return units

def main():
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    print("\nConnecting to Google Sheets...")
    sheet = connect_sheet()
    headers = sheet.row_values(1)
    all_rows = sheet.get_all_values()[1:]
    
    link_idx = headers.index("LINK_MESSAGE")
    code_idx = headers.index("KODE_UNIT")
    
    existing_links = {r[link_idx] for r in all_rows if len(r) > link_idx and r[link_idx]}
    nums = [int(r[code_idx][3:]) for r in all_rows if len(r) > code_idx and r[code_idx].startswith("BBK")]
    next_idx = max(nums) + 1 if nums else 1

    print("Scanning Telegram exports...\n")
    all_units = [u for src, base_url in SOURCE_MAP.items() for u in extract_units(src, base_url) if u["link"] not in existing_links]
    print(f"Total new inventory units: {len(all_units)}\n")

    rows_to_append = []
    for u in tqdm(all_units, desc="Processing Units"):
        unit_code = f"BBK{next_idx:04d}"
        next_idx += 1
        photo_data = process_photos(unit_code, u["photos"])
        
        row_dict = {
            "KODE_UNIT": unit_code,
            "SOURCE_GROUP": u["src"],
            "LINK_MESSAGE": u["link"],
            "CAPTION_RAW": u["caption"],
            "PHOTO_URLS": "|".join(photo_data),
            "FETCH_DATE": datetime.now(LOCAL_TZ).strftime("%Y-%m-%d %H:%M:%S"),
            "LAST_SEEN_DATE": u["timestamp"],
            "LOKASI_GUDANG": WAREHOUSE_MAP.get(u["src"], "WAREHOUSE_UNKNOWN"),
            "STATUS_UNIT": "Available",
            "IS_PROCESSED": "FALSE"
        }
        
        row = [row_dict.get(h, "") for h in headers]
        rows_to_append.append(row)
        existing_links.add(u["link"])

    # --- UPLOAD: BATCHING 10 ROWS + RETRY MECHANISM ---
    if rows_to_append:
        chunk_size = 10
        total_rows = len(rows_to_append)
        max_attempts = 3
        
        print(f"\nStarting data upload (Total: {total_rows} rows, {chunk_size} rows per batch)...")
        
        for i in range(0, total_rows, chunk_size):
            chunk = rows_to_append[i:i + chunk_size]
            success = False
            
            # Retry each individual batch if a network timeout or connection issue occurs
            for attempt in range(max_attempts):
                try:
                    print(f"Uploading rows {i+1} to {min(i+chunk_size, total_rows)} (Attempt {attempt + 1})...")
                    sheet.append_rows(chunk, value_input_option="USER_ENTERED")
                    success = True
                    break  # Upload succeeded; continue to the next batch
                except (ReadTimeout, Exception) as e:
                    print(f"   [!] Batch upload failed: {e}")
                    if attempt < max_attempts - 1:
                        print("   Waiting 5 seconds before retrying...")
                        time.sleep(5)
                    else:
                        print("\n[ERROR] Batch upload failed after 3 attempts.")
                        raise e
            
            if success:
                # Add a short delay between batches to reduce Google API quota pressure
                time.sleep(1)
                
        print(f"\nSuccessfully uploaded {total_rows} new inventory units to Google Sheets.")
    else:
        print("\nNo new inventory data to upload.")
    
    print("\nPipeline completed.")

if __name__ == "__main__":
    main()
