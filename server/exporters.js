const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const PROJECT = 'ITMS Material Tracker - Samruddhi Mahamarg (Shirdi IC20)';
const safe = s => String(s).replace(/[\\/*?:[\]]/g, ' ').slice(0, 30);

async function toExcel(rep, res, filename) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(safe(rep.title));
  const n = rep.columns.length;
  ws.mergeCells(1, 1, 1, n); ws.getCell(1, 1).value = PROJECT; ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FFE8590C' } };
  ws.mergeCells(2, 1, 2, n); ws.getCell(2, 1).value = rep.title; ws.getCell(2, 1).font = { bold: true, size: 12 };
  ws.mergeCells(3, 1, 3, n); ws.getCell(3, 1).value = rep.subtitle || ''; ws.getCell(3, 1).font = { italic: true, color: { argb: 'FF555555' } };
  const hr = ws.getRow(5);
  rep.columns.forEach((c, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8590C' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    ws.getColumn(i + 1).width = Math.max(c.width || 14, 10);
  });
  hr.height = 22;
  rep.rows.forEach(row => {
    const r = ws.addRow(rep.columns.map(c => row[c.key]));
    r.eachCell(cell => {
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
      if (typeof cell.value === 'number') cell.alignment = { horizontal: 'right' };
    });
    if (row._total) r.eachCell(cell => { cell.font = { bold: true }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }; });
  });
  ws.views = [{ state: 'frozen', ySplit: 5 }];
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

function toPdf(rep, res, filename) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
  doc.pipe(res);
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#e8590c').text(PROJECT);
  doc.fontSize(12).fillColor('#000000').text(rep.title);
  doc.font('Helvetica').fontSize(8).fillColor('#555555').text(rep.subtitle || '');

  const left = 30, width = doc.page.width - 60, RH = 18;
  const tw = rep.columns.reduce((a, c) => a + (c.width || 12), 0);
  const cw = rep.columns.map(c => ((c.width || 12) / tw) * width);
  let y = doc.y + 8;

  const cellText = (txt, i, x, bold, color, right) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(color)
      .text(String(txt ?? ''), x + 3, y + 5, { width: cw[i] - 6, height: RH - 6, lineBreak: false, ellipsis: true, align: right || typeof txt === 'number' ? 'right' : 'left' });
  };
  const header = () => {
    doc.rect(left, y, width, RH).fill('#e8590c');
    let x = left;
    rep.columns.forEach((c, i) => { cellText(c.header, i, x, true, '#ffffff', typeof (rep.rows[0] || {})[c.key] === 'number'); x += cw[i]; });
    y += RH;
  };
  header();
  if (!rep.rows.length) { doc.font('Helvetica').fontSize(10).fillColor('#555555').text('No data for the selected filters.', left, y + 8); }
  rep.rows.forEach((row, ri) => {
    if (y + RH > doc.page.height - 40) { doc.addPage(); y = 30; header(); }
    if (row._total) doc.rect(left, y, width, RH).fill('#e5e7eb');
    else if (ri % 2) doc.rect(left, y, width, RH).fill('#f3f4f6');
    let x = left;
    rep.columns.forEach((c, i) => { cellText(row[c.key], i, x, !!row._total, '#111111'); x += cw[i]; });
    doc.moveTo(left, y + RH).lineTo(left + width, y + RH).lineWidth(0.3).strokeColor('#d1d5db').stroke();
    y += RH;
  });
  doc.font('Helvetica').fontSize(7).fillColor('#777777').text('Generated: ' + new Date().toLocaleString('en-GB'), left, Math.min(y + 10, doc.page.height - 40), { lineBreak: false });
  doc.end();
}

module.exports = { toExcel, toPdf };
