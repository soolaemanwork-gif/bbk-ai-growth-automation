// =================================================================================
// 4. WOOCOMMERCE WEBHOOK CALLBACK (POST)
// =================================================================================
function doPost(e) {
  try {
    const jsonString = e.postData.contents;
    const data = JSON.parse(jsonString);
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName("MASTER_INVENTORY");
    
    if (!sheet) {
      return ContentService.createTextOutput("MASTER_INVENTORY sheet not found");
    }
    
    const productID = data.product_id;
    const values = sheet.getDataRange().getValues();
    let targetRow = -1;
    
    for (let i = 1; i < values.length; i++) {
      if (values[i][18] == productID) { 
        targetRow = i + 1; 
        break;
      }
    }
    
    if (targetRow !== -1) {
      sheet.getRange(targetRow, 17).setValue(data.tanggal_terjual); // Column Q
      sheet.getRange(targetRow, 18).setValue(data.durasi_terjual); // Column R
      
      return ContentService.createTextOutput(
        "Successfully updated row " + targetRow
      );
    }
    
    return ContentService.createTextOutput(
      "Product ID not found in Column S"
    );
    
  } catch(err) {
    return ContentService.createTextOutput(
      "Error: " + err.toString()
    );
  }
}
