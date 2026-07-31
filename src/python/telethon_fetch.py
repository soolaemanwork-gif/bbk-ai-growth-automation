# -*- coding: utf-8 -*-

import json
import argparse

from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from telethon import TelegramClient
from tqdm import tqdm

from config_telethon import (
    API_ID,
    API_HASH,
    SESSION_NAME
)

# ================= CONFIGURATION =================
# Production paths and Telegram source IDs are anonymized
# for this public repository.

BASE_DIR = Path("./data")
EXPORT_ROOT = BASE_DIR / "exports"

LOCAL_TZ = ZoneInfo("Asia/Jakarta")

SOURCE_MAP = {
    "SOURCE_01": -1000000000001,
    "SOURCE_02": -1000000000002,
    "SOURCE_03": -1000000000003,
    "SOURCE_04": -1000000000004,
    "SOURCE_05": -1000000000005,
    "SOURCE_06": -1000000000006,
    "SOURCE_07": -1000000000007,
    "SOURCE_08": -1000000000008,
    "SOURCE_09": -1000000000009,
    "SOURCE_10": -1000000000010,
}

# ================= ARGUMENTS =================

parser = argparse.ArgumentParser()
parser.add_argument("--date", help="YYYY-MM-DD")
parser.add_argument("--start", help="YYYY-MM-DD")
parser.add_argument("--end", help="YYYY-MM-DD")
args = parser.parse_args()

# ================= DATE RANGE =================

def parse_local(dt_str):
    dt = datetime.fromisoformat(dt_str)
    return dt.replace(tzinfo=LOCAL_TZ)

if args.date:
    start_local = parse_local(args.date)
    end_local = start_local + timedelta(days=1)
elif args.start and args.end:
    start_local = parse_local(args.start)
    end_local = parse_local(args.end) + timedelta(days=1)
else:
    now_local = datetime.now(LOCAL_TZ)
    end_local = now_local
    start_local = end_local - timedelta(days=1)

START_DATE = start_local.astimezone(timezone.utc)
END_DATE = end_local.astimezone(timezone.utc)

print(f"Local time range: {start_local} -> {end_local}")

# ================= TELETHON =================

client = TelegramClient(
    SESSION_NAME,
    API_ID,
    API_HASH
)

async def fetch_group(src_code, chat_id):
    out_dir = EXPORT_ROOT / src_code
    out_dir.mkdir(parents=True, exist_ok=True)

    messages = []
    
    pbar = tqdm(desc=f"Scanning [{src_code}]", unit=" msg", leave=False)

    async for msg in client.iter_messages(chat_id, offset_date=END_DATE):
        pbar.update(1)
        if not msg.date: continue
        if msg.date < START_DATE: break
        if not msg.photo: continue

        photo_path = await msg.download_media(out_dir / f"{msg.id}.jpg")

        messages.append({
            "id": msg.id,
            "grouped_id": msg.grouped_id,
            "type": "message",
            "date": msg.date.isoformat(),
            "date_unixtime": int(msg.date.timestamp()),
            "text": msg.text or "",
            "photo": Path(photo_path).name if photo_path else ""
        })

    pbar.close()

    with open(out_dir / "result.json", "w", encoding="utf-8") as f:
        json.dump({"messages": messages}, f, ensure_ascii=False, indent=2)

    print(f"[{src_code}] Successfully fetched {len(messages)} messages with images.")

# ================= MAIN =================

async def main():
    await client.start()
    for src, chat_id in SOURCE_MAP.items():
        await fetch_group(src, chat_id)
    await client.disconnect()

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
