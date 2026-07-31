// =================================================================================
// 2. SYNC DRIVE PHOTOS TO MASTER (Hybrid - Direct Filename Matching)
// =================================================================================
function syncDrivePhotosToMaster() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shRaw = ss.getSheetByName("RAW_INVENTORY");
  const shMaster = ss.getSheetByName("MASTER_INVENTORY");

  // Production Google Drive folder ID is excluded from the public repository.
  const folderId = PropertiesService.getScriptProperties().getProperty("DRIVE_FOLDER_ID");
  
  if (!shRaw || !shMaster || !folderId) {
    Logger.log("ERROR: Script dependencies are incomplete!");
    return;
  }

  const lastRowMaster = shMaster.getLastRow();
  if (lastRowMaster < 2) return;

  const masterData = shMaster.getRange(2, 1, lastRowMaster - 1, 6).getValues();
  const lastRowRaw = shRaw.getLastRow();
  const rawData = shRaw.getRange(2, 1, lastRowRaw - 1, 5).getValues(); 
  
  let rawPhotoMap = {};
  for (let j = 0; j < rawData.length; j++) {
    const rawSku = rawData[j][0];
    const rawPhotos = rawData[j][4]; 
    if (rawSku) {
      rawPhotoMap[rawSku] = String(rawPhotos || "").trim();
    }
  }

  const folder = DriveApp.getFolderById(folderId);
  let successCount = 0;
  let processedInThisRun = 0;

  // Limit processing to 15 products per run to reduce Google Drive API quota pressure.
  const MAX_PER_RUN = 15;

  for (let i = 0; i < masterData.length; i++) {
    const sku = masterData[i][0];
    const pipelineStatus = masterData[i][5];

    if (sku && pipelineStatus === "PENDING_PHOTOS") {
      
      if (processedInThisRun >= MAX_PER_RUN) break; 
      processedInThisRun++; 

      const currentRow = i + 2;
      const rawPhotosString = rawPhotoMap[sku];

      if (rawPhotosString && rawPhotosString !== "") {
        // Supports both legacy pipe (|) separators and comma (,) separators.
        let delimiter = rawPhotosString.includes("|") ? "|" : ",";
        let fileNames = rawPhotosString.split(delimiter);
        
        let urls = [];
        
        for (let f = 0; f < fileNames.length; f++) {
          let name = fileNames[f].trim();
          if (name === "") continue;
          
          // If RAW data already contains a URL, use it directly.
          if (name.startsWith("http")) {
            urls.push(name);
            continue;
          }
          
          // Find the Drive file using an exact filename match.
          let files = folder.getFilesByName(name);
          if (files.hasNext()) {
            let file = files.next();
            urls.push(file.getDownloadUrl()); 
          }
        }

        if (urls.length > 0) {
          const mainImg = urls[0];
          let galleryImgs = (urls.length > 1) ? urls.slice(1).join(",") : "";
          
          shMaster.getRange(currentRow, 13).setValue(mainImg);
          shMaster.getRange(currentRow, 14).setValue(galleryImgs);

          // Product is now eligible for the WooCommerce publishing workflow.
          shMaster.getRange(currentRow, 6).setValue("READY_TO_PUBLISH");
          successCount++;
        } else {
          shMaster.getRange(currentRow, 6).setValue("NO_PHOTOS_FOUND");
        }
      } else {
        shMaster.getRange(currentRow, 6).setValue("NO_PHOTOS_FOUND");
      }
    }
  }

  if (successCount > 0) {
    Logger.log(`PHOTO SYNC SUCCESS: Connected images for ${successCount} products.`);
  }
}
