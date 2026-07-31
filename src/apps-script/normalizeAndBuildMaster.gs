// =================================================================================
// 1. NORMALIZE AND BUILD MASTER (OpenAI Processing Workflow)
// =================================================================================
function normalizeAndBuildMaster() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shRaw = ss.getSheetByName("RAW_INVENTORY");
  const shMaster = ss.getSheetByName("MASTER_INVENTORY");
  
  if (!shRaw || !shMaster) {
    Logger.log("ERROR: Required sheet not found!");
    return;
  }

  const apiKey = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!apiKey) {
    Logger.log("ERROR: OPENAI_API_KEY is not configured!");
    return;
  }

  const lastRowRaw = shRaw.getLastRow();
  if (lastRowRaw < 2) return;

  const rawData = shRaw.getRange(2, 1, lastRowRaw - 1, 10).getValues();
  
  const MAX_AI_PER_RUN = 10; // Small batch to reduce Apps Script runtime timeout risk
  let targetIndices = [];
  
  for (let i = 0; i < rawData.length; i++) {
    let val = rawData[i][9]; 
    let valStr = String(val).trim().toLowerCase();
    if (val === false || valStr === "false" || valStr === "") {
      targetIndices.push(i);
      if (targetIndices.length >= MAX_AI_PER_RUN) {
        break; 
      }
    }
  }
  
  if (targetIndices.length === 0) {
    Logger.log("INFO: All records have already been processed.");
    return;
  }
  
  Logger.log("INFO: Starting batch processing for " + targetIndices.length + " products.");

  for (let k = 0; k < targetIndices.length; k++) {
    let targetIndex = targetIndices[k];
    const rowRaw = targetIndex + 2;
    const kodeUnit = rawData[targetIndex][0];    
    const sourceGroup = rawData[targetIndex][1];  
    const linkTelegram = rawData[targetIndex][2]; 
    const captionRaw = String(rawData[targetIndex][3] || "").trim(); 
    const tanggalAsli = rawData[targetIndex][6];

    if (!kodeUnit) {
      shRaw.getRange(rowRaw, 10).setValue("SKIP: EMPTY UNIT CODE");
      continue; 
    }

    const lowerCaption = captionRaw.toLowerCase();
    if (captionRaw.length < 30 || lowerCaption === "sold" || lowerCaption === "sold out" || lowerCaption === "terjual") {
      shRaw.getRange(rowRaw, 10).setValue("SKIP: INVALID CAPTION / SOLD-ONLY / < 30 CHARACTERS");
      continue; 
    }

    shRaw.getRange(rowRaw, 10).setValue("PROCESSING");
    SpreadsheetApp.flush(); 

    try {
      // Production warehouse names and locations are anonymized.
      const warehouseMap = {
        "SOURCE_01": "WAREHOUSE_A", "SOURCE_02": "WAREHOUSE_A",
        "SOURCE_03": "WAREHOUSE_A", "SOURCE_04": "WAREHOUSE_A",
        "SOURCE_05": "WAREHOUSE_B", "SOURCE_06": "WAREHOUSE_C",
        "SOURCE_07": "WAREHOUSE_D", "SOURCE_08": "WAREHOUSE_E",
        "SOURCE_09": "WAREHOUSE_E", "SOURCE_10": "WAREHOUSE_B"
      };
      const lokasiAcf = warehouseMap[sourceGroup] || "WAREHOUSE_A"; 

      const validSlugs = [
        "blower", "ducting", "hood", "ice-bin", "ice-maker",
        "kompor-1-tungku", "kompor-2-tungku", "kompor-3-tungku", "kompor-4-tungku", "kompor-6-tungku",
        "kompor-batu-lava", "deep-fryer", "kompor-wok-kwali-range", "kompor-grill-tepanyaki", "noodle-boiler",
        "oven", "lainnya-kompor", "meja-1-susun-stainless", "meja-2-susun-stainless", "meja-3-susun-stainless",
        "meja-bumbu-stainless", "meja-kabinet-stainless", "meja-kompor-stainless", "lainnya-meja-stainless",
        "rak-1-susun-stainless", "rak-2-susun-stainless", "rak-3-susun-stainless", "rak-4-susun-stainless",
        "rak-5-susun-stainless", "wallshelf", "lainnya-rak-stainless", "showcase-1-pintu", "showcase-2-pintu",
        "cake-showcase", "single-sink-stainless", "double-sink-stainless", 
        "triple-sink-stainless", "sink-jumbo-stainless", "lainnya-sink-stainless", "peralatan-dapur-bekas-lainnya"
      ];

      // The production prompt is intentionally preserved in Indonesian
      // because changing its language may alter model behavior and output.
      const prompt = `Anda adalah seorang Professional Copywriter Komersial dan Ahli SEO E-Commerce untuk "Bukan Baru Kitchen" (BBKitchen). Tugas Anda mengekstrak data CAPTION MENTAH peralatan dapur komersial menjadi format JSON bersih untuk WooCommerce.

PILIHAN CATEGORY_SLUG YANG WAJIB DIGUNAKAN, sesuaikan dengan unit, validasi dengan kata yang sama terlebih dahulu: [${validSlugs.join(", ")}]

CAPTION MENTAH:
${captionRaw}

⚠️ ATURAN EMAS (MUTLAK):
1. JANGAN PERNAH MASUKKAN HARGA atau LOKASI GUDANG/DAERAH asli dari caption!
2. "product_title": 
- SEO-friendly, unik, natural.
- WAJIB sertakan ukuran/kapasitas/seri/tipe jika ada.
- Perbaiki typo caption.
- Jangan gunakan ALL CAPS.
3. "yoast_keyword": 
- 1 keyword saja.
- Huruf kecil.
- Fokus komersial
- Tambahkan kondisi_unit
4. "kondisi_unit": 
- Hanya: BARU atau BEKAS.
- Jika ragu → BEKAS.
- SECOND/COPOTAN/REKONDISI/EX → BEKAS.
- Komponen baru ≠ unit baru.
5. Jika barang memiliki minus/lecet, tulis dengan jujur tapi tetap elegan dan profesional.
6. "full_description" wajib 300 kata: 
-P1: fungsi + cocokan dengan target =Resto, Cafe, Katering, Dapur MBG, UMKM Kuliner, Bakery, Hotel,Rumah Makan
-P2: spesifikasi HTML <ul><li>.
-P3: CTA profesional untuk Cek Harga dan negoisasi ke admin BBKitchen
7. "yoast_description": 
-wajib 200 karakter sertakan spesifikasi
-Awali dengan "yoast_keyword".
-Akhiri dengan CTA WhatsApp.
8. DILARANG halusinasi spesifikasi, brand, material, kondisi.

9. ⚠️ METADATA FOTO/GAMBAR (SEO OPTIMIZATION):
- "image_alt": Teks alternatif gambar, deskriptif, mengandung "yoast_keyword", fokus pada detail fisik unit untuk aksesibilitas dan Google Images (max 80 karakter).
- "image_title": Judul aset gambar. Gunakan format: [Nama Produk] BBKitchen [Kode Unit]. Jangan gunakan spasi kosong, buat rapi.
- "image_caption": Keterangan singkat yang muncul di bawah gambar. Berisi ringkasan kondisi dan tipe unit.
- "image_description": Deskripsi lengkap internal gambar. Jelaskan apa yang terlihat di foto serta keunggulan fisik produk secara singkat.

FORMAT OUTPUT WAJIB JSON MURNI:
{
  "product_title": "",
  "category_slug": "",
  "kondisi_unit": "",
  "short_description": "",
  "full_description": "",
  "yoast_keyword": "",
  "yoast_description": "",
  "image_alt": "",
  "image_title": "",
  "image_caption": "",
  "image_description": ""
}`;

      const response = UrlFetchApp.fetch("https://api.openai.com/v1/chat/completions", {
        method: "post",
        headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
        payload: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { "type": "json_object" },
          messages: [{ role: "user", content: prompt }],
          temperature: 0.6
        }),
        muteHttpExceptions: true
      });

      const jsonRes = JSON.parse(response.getContentText());
      if (jsonRes.error) throw new Error("OpenAI Error: " + jsonRes.error.message);

      const out = JSON.parse(jsonRes.choices[0].message.content.trim());

      const masterValues = shMaster.getRange(1, 1, shMaster.getLastRow() + 20, 1).getValues();
      let masterLastRow = 1;
      for (let m = 0; m < masterValues.length; m++) {
        if (masterValues[m][0] === "") {
          masterLastRow = m + 1;
          break;
        }
      }

      const defaultStatusUnit = "READY"; 

      const insertData = [[
        kodeUnit,                       
        out.product_title,              
        "%%title%% %%page%% %%sep%% BBKitchen", 
        out.category_slug,              
        defaultStatusUnit,              
        "PENDING_PHOTOS",               
        lokasiAcf,                      
        out.kondisi_unit,               
        out.short_description,          
        out.full_description,           
        out.yoast_keyword,              
        out.yoast_description,          
        "",                             
        "",                             
        tanggalAsli,                    
        "",                             
        "",                             
        linkTelegram,                   
        "",                             
        false,                          
        out.image_alt,                  
        out.image_title,                
        out.image_caption,              
        out.image_description           
      ]];

      shMaster.getRange(masterLastRow, 1, 1, insertData[0].length).setValues(insertData);
      shRaw.getRange(rowRaw, 10).setValue(true); 
      Logger.log("SUCCESS: AI processed " + kodeUnit + " into MASTER row " + masterLastRow);
      
    } catch (err) {
      shRaw.getRange(rowRaw, 10).setValue("ERROR: " + err.message);
      Logger.log("ERROR processing " + kodeUnit + ": " + err.message);
    }
    
    Utilities.sleep(200);
  }
}
