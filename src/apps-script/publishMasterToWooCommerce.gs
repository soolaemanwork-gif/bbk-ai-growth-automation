// =================================================================================
// 3. PUBLISH TO WOOCOMMERCE
// =================================================================================
function publishToWoo() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("MASTER_INVENTORY");
  const lastRow = sh.getLastRow();
  
  if (lastRow < 2) return;
  
  const data = sh.getRange(2, 1, lastRow - 1, 24).getValues();
  const props = PropertiesService.getScriptProperties();
  const domain = props.getProperty("WOO_DOMAIN").trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
  
  const MAX_PROCESS = 5; // Limit each execution to 5 products to reduce WooCommerce server load
  let processedCount = 0;
  
  for (let i = 0; i < data.length; i++) {
    if (processedCount >= MAX_PROCESS) {
      Logger.log("Processing limit reached. Stopping execution.");
      break;
    }

    const row = data[i];
    const isReady = (row[5] === "READY_TO_PUBLISH" || row[5] === "SKIP: NO IMAGE");
    const hasSku = row[0];
    const hasImage = row[12] && String(row[12]).trim() !== ""; 

    if (isReady && hasSku) {
      processedCount++;

      if (!hasImage) {
        sh.getRange(i + 2, 6).setValue("SKIP: NO IMAGE");
        continue; 
      }

      let payload = {
        "sku": row[0], "title": row[1], "seo_title": row[2], "category_slug": row[3],
        "status_unit": row[4], "lokasi_unit": row[6], "kondisi_unit": row[7],
        "excerpt": row[8], "content": row[9], "yoast_keyword": row[10], "yoast_description": row[11],
        "main_image": row[12], "photo_urls": row[13], "link_telegram": row[17],
        "stock_status": (row[4] === "SOLD") ? "outofstock" : "instock",
        "image_alt": row[20], "image_title": row[21], "image_caption": row[22], "image_description": row[23]
      };
      
      let options = {
        "method": "post",
        "contentType": "application/json",
        "headers": { 
          "Authorization": "Basic " + Utilities.base64Encode(
            props.getProperty("WOO_CK") + ":" + props.getProperty("WOO_CS")
          ) 
        },
        "payload": JSON.stringify(payload),
        "muteHttpExceptions": true
      };
      
      try {
        let res = UrlFetchApp.fetch(
          "https://" + domain + "/wp-json/bbk/v1/tambah-produk",
          options
        );
        let resCode = res.getResponseCode();
        
        if (resCode === 200) {
          let resData = JSON.parse(res.getContentText());

          sh.getRange(i + 2, 6).setValue("PUBLISHED"); 
          sh.getRange(i + 2, 19).setValue(resData.id); 
        } else {
          sh.getRange(i + 2, 6).setValue("ERROR: " + resCode);
        }
      } catch(e) { 
        sh.getRange(i + 2, 6).setValue("ERROR: SCRIPT FAILED");
      }
    }
  }
}
