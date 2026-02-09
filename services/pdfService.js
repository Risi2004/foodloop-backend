/**
 * PDF Service
 * Generates impact receipt PDFs with all donation and impact details
 */

const PDFDocument = require('pdfkit');

/**
 * Generate Impact Receipt PDF
 * @param {Object} receiptData - Receipt data from ImpactReceipt model
 * @param {Object} donationData - Donation data with populated donor, receiver, driver
 * @returns {Promise<Buffer>} PDF buffer
 */
const generateImpactReceiptPDF = async (receiptData, donationData) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: 'FoodLoop Impact Receipt',
          Author: 'FoodLoop',
          Subject: 'Impact Receipt',
        },
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      // Header
      doc
        .fontSize(20)
        .fillColor('#1b4332')
        .font('Helvetica-Bold')
        .text('FoodLoop Impact Receipt', { align: 'center' })
        .moveDown(0.3);

      doc
        .fontSize(10)
        .fillColor('#666666')
        .font('Helvetica')
        .text(`Tracking ID: ${donationData.trackingId || 'N/A'}`, { align: 'center' })
        .text(`Receipt Date: ${new Date(receiptData.createdAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}`, { align: 'center' })
        .moveDown(0.5);

      // Horizontal line
      doc
        .strokeColor('#1b4332')
        .lineWidth(1.5)
        .moveTo(40, doc.y)
        .lineTo(555, doc.y)
        .stroke()
        .moveDown(0.5);

      // Use two-column layout for information sections
      const leftMargin = 40;
      const rightMargin = 555;
      const centerX = (leftMargin + rightMargin) / 2;
      const sectionFontSize = 13;
      const textFontSize = 10;
      const lineSpacing = 4;
      const headerSpacing = 5; // Space after header before content
      const rowSpacing = 15; // Space between rows

      // ROW 1: Donor Information (Left) | Handling Organization (Right)
      const row1StartY = doc.y;
      
      // Donor Information Section (Left Column)
      doc
        .fontSize(sectionFontSize)
        .fillColor('#1b4332')
        .font('Helvetica-Bold')
        .text('Donor Information', leftMargin, row1StartY, { underline: true, width: centerX - leftMargin - 10 });

      // Get donor name - handle both direct donor object and nested structure
      let donorName = 'Anonymous';
      if (donationData.donor) {
        if (donationData.donor.donorType === 'Business') {
          donorName = donationData.donor.businessName || donationData.donor.name || donationData.donor.email || 'Anonymous';
        } else {
          donorName = donationData.donor.username || donationData.donor.name || donationData.donor.email || 'Anonymous';
        }
      }

      let donorContentY = row1StartY + sectionFontSize + headerSpacing;
      doc
        .fontSize(textFontSize)
        .fillColor('#000000')
        .font('Helvetica')
        .text(`Name: ${donorName}`, leftMargin + 10, donorContentY, { width: centerX - leftMargin - 20 });
      donorContentY += lineSpacing + 8;
      doc.text(`Email: ${donationData.donor?.email || 'N/A'}`, leftMargin + 10, donorContentY, { width: centerX - leftMargin - 20 });
      donorContentY += lineSpacing + 8;
      doc.text(`Type: ${donationData.donor?.donorType || donationData.donor?.type || 'Individual'}`, leftMargin + 10, donorContentY, { width: centerX - leftMargin - 20 });
      donorContentY += lineSpacing + 8;
      const donorAddress = donationData.donor?.address || donationData.donorAddress || 'N/A';
      if (donorAddress && donorAddress !== 'N/A') {
        doc.text(`Address: ${donorAddress}`, leftMargin + 10, donorContentY, { width: centerX - leftMargin - 20 });
        donorContentY += lineSpacing + 8;
      }

      // Receiver Information Section (Right Column) - Same row
      doc
        .fontSize(sectionFontSize)
        .fillColor('#1b4332')
        .font('Helvetica-Bold')
        .text('Handling Organization', centerX + 10, row1StartY, { underline: true, width: rightMargin - centerX - 10 });

      let receiverContentY = row1StartY + sectionFontSize + headerSpacing;
      doc
        .fontSize(textFontSize)
        .fillColor('#000000')
        .font('Helvetica')
        .text(`Name: ${donationData.receiver?.receiverName || donationData.receiver?.name || donationData.receiver?.email || 'N/A'}`, centerX + 20, receiverContentY, { width: rightMargin - centerX - 30 });
      receiverContentY += lineSpacing + 8;
      doc.text(`Type: ${donationData.receiver?.receiverType || donationData.receiver?.type || 'N/A'}`, centerX + 20, receiverContentY, { width: rightMargin - centerX - 30 });

      // Calculate end of row 1 and start of row 2
      const row1EndY = Math.max(donorContentY, receiverContentY);
      const row2StartY = row1EndY + rowSpacing;

      // ROW 2: Driver Information (Left) | Food Information (Right)
      // Both sections start at the same Y position for perfect alignment
      
      // Driver Information Section (Left Column)
      doc
        .fontSize(sectionFontSize)
        .fillColor('#1b4332')
        .font('Helvetica-Bold')
        .text('Driver Information', leftMargin, row2StartY, { underline: true, width: centerX - leftMargin - 10 });

      let driverContentY = row2StartY + sectionFontSize + headerSpacing;
      let driverEndY = driverContentY;
      
      if (donationData.driver) {
        doc
          .fontSize(textFontSize)
          .fillColor('#000000')
          .font('Helvetica')
          .text(`Name: ${donationData.driver?.driverName || donationData.driver?.name || 'N/A'}`, leftMargin + 10, driverContentY, { width: centerX - leftMargin - 20 });
        driverContentY += lineSpacing + 8;
        const vehicleType = donationData.driver?.vehicleType || 'N/A';
        const vehicleNumber = donationData.driver?.vehicleNumber || 'N/A';
        doc.text(`Vehicle Type: ${vehicleType}`, leftMargin + 10, driverContentY, { width: centerX - leftMargin - 20 });
        driverContentY += lineSpacing + 8;
        doc.text(`Vehicle Number: ${vehicleNumber}`, leftMargin + 10, driverContentY, { width: centerX - leftMargin - 20 });
        driverEndY = driverContentY;
      } else {
        doc
          .fontSize(textFontSize)
          .fillColor('#000000')
          .font('Helvetica')
          .text('No driver assigned', leftMargin + 10, driverContentY, { width: centerX - leftMargin - 20 });
        driverEndY = driverContentY + lineSpacing + 8;
      }

      // Food Information Section (Right Column) - Same row, same start Y
      doc
        .fontSize(sectionFontSize)
        .fillColor('#1b4332')
        .font('Helvetica-Bold')
        .text('Food Information', centerX + 10, row2StartY, { underline: true, width: rightMargin - centerX - 10 });

      let foodContentY = row2StartY + sectionFontSize + headerSpacing;
      doc
        .fontSize(textFontSize)
        .fillColor('#000000')
        .font('Helvetica')
        .text(`Item: ${donationData.donation?.itemName || 'N/A'}`, centerX + 20, foodContentY, { width: rightMargin - centerX - 30 });
      foodContentY += lineSpacing + 8;
      doc.text(`Quantity: ${donationData.donation?.quantity || 0} ${donationData.donation?.quantity === 1 ? 'serving' : 'servings'}`, centerX + 20, foodContentY, { width: rightMargin - centerX - 30 });
      foodContentY += lineSpacing + 8;
      doc.text(`Category: ${donationData.donation?.foodCategory || 'N/A'}`, centerX + 20, foodContentY, { width: rightMargin - centerX - 30 });
      foodContentY += lineSpacing + 8;
      doc.text(`Storage: ${donationData.donation?.storageRecommendation || 'N/A'}`, centerX + 20, foodContentY, { width: rightMargin - centerX - 30 });
      const foodEndY = foodContentY;

      // Move to next row - use the maximum Y from both columns
      const row2EndY = Math.max(driverEndY, foodEndY);
      doc.y = row2EndY + rowSpacing;

      // Delivery Information Section (Full Width)
      doc
        .fontSize(sectionFontSize)
        .fillColor('#1b4332')
        .font('Helvetica-Bold')
        .text('Delivery Information', leftMargin, doc.y, { underline: true })
        .moveDown(0.2);

      doc
        .fontSize(textFontSize)
        .fillColor('#000000')
        .font('Helvetica')
        .text(`Date: ${donationData.deliveryDate || 'N/A'}`, { indent: 10 })
        .text(`Drop Location: ${receiptData.dropLocation || 'N/A'}`, { indent: 10 })
        .moveDown(0.5);

      // Impact Metrics Section - Compact layout
      doc
        .fontSize(14)
        .fillColor('#1b4332')
        .font('Helvetica-Bold')
        .text('Impact Summary', { align: 'center', underline: true })
        .moveDown(0.3);

      // Impact metrics in a compact table format
      const metricsY = doc.y;
      const leftCol = 80;
      const rightCol = 380;
      const lineHeight = 18;

      doc
        .fontSize(10)
        .fillColor('#000000')
        .font('Helvetica-Bold')
        .text('Distance Traveled:', leftCol, metricsY)
        .font('Helvetica')
        .text(`${receiptData.distanceTraveled?.toFixed(2) || '0.00'} KM`, rightCol, metricsY);

      doc
        .font('Helvetica-Bold')
        .text('People Fed:', leftCol, metricsY + lineHeight)
        .font('Helvetica')
        .text(`${receiptData.peopleFed || 0}`, rightCol, metricsY + lineHeight);

      doc
        .font('Helvetica-Bold')
        .text('Weight per Serving:', leftCol, metricsY + (lineHeight * 2))
        .font('Helvetica')
        .text(`${receiptData.weightPerServing?.toFixed(3) || '0.000'} KG`, rightCol, metricsY + (lineHeight * 2));

      // Use stored methane (kg); if 0 or missing, recalculate from quantity × weightPerServing × 0.05
      const quantity = donationData.donation?.quantity ?? 0;
      const weightPerServing = receiptData.weightPerServing ?? 0;
      let methaneDisplay = receiptData.methaneSaved;
      if (methaneDisplay == null || methaneDisplay === 0) {
        const totalWeightKg = quantity * weightPerServing;
        methaneDisplay = Math.round(totalWeightKg * 0.05 * 100) / 100;
      }
      doc
        .font('Helvetica-Bold')
        .fillColor('#10b981')
        .text('Methane Saved:', leftCol, metricsY + (lineHeight * 3))
        .font('Helvetica')
        .text(`${typeof methaneDisplay === 'number' ? methaneDisplay.toFixed(2) : '0.00'} KG`, rightCol, metricsY + (lineHeight * 3));

      doc.y = metricsY + (lineHeight * 4) + 15;

      // Footer - Compact
      doc
        .moveDown(1)
        .fontSize(9)
        .fillColor('#666666')
        .font('Helvetica')
        .text('Thank you for being part of the FoodLoop community!', { align: 'center' })
        .text('Together, we are reducing food waste and feeding those in need.', { align: 'center' })
        .moveDown(0.3)
        .text('For questions or support, contact us at foodloop.official27@gmail.com', { align: 'center' });

      // Finalize PDF
      doc.end();
    } catch (error) {
      console.error('[PDFService] Error generating PDF:', error);
      reject(error);
    }
  });
};

module.exports = {
  generateImpactReceiptPDF,
};
