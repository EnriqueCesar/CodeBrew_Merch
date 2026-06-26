(() => {
  const $ = (id) => document.getElementById(id);
  const products = window.PRODUCTS || [];
  const bySku = new Map(products.map(p => [normalizeSku(p.skuIntl), p]));
  let stream = null;
  let labelStream = null;
  let currentProduct = null;
  const labelItems = [];

  function normalizeSku(value){ return String(value || '').replace(/\D/g,'').replace(/^0+/,'') || ''; }
  function cleanMoney(v){ return String(v || '').trim(); }
  function moneyTier(p){ return Object.entries(p.tier || {}).filter(([,v]) => cleanMoney(v)).map(([k,v]) => `${k}: ${v}`); }
  function firstTier(p){ return moneyTier(p)[0] || '-'; }
  function priceOnly(p){ const ft = firstTier(p); return ft.includes(':') ? ft.split(':').slice(1).join(':').trim() : ft; }

  function inferCampaign(p){
    const name = String(p.nombrePos || p.nombreInventario || '').trim();
    const upper = name.toUpperCase();
    const base = String(p.base || '').toUpperCase();
    if (base.includes('DISCOVERY') || upper.startsWith('DISC') || upper.startsWith('TOTEBAG')) return 'Discovery';
    if (upper.startsWith('WC')) return 'World Cup';
    if (upper.startsWith('SP')) return 'Spring';
    if (upper.startsWith('WT')) return 'Winter';
    if (upper.startsWith('COR')) return 'Essentials';
    if (upper.startsWith('XM')) return 'Christmas';
    if (upper.startsWith('FL')) return 'Fall';
    if (upper.startsWith('SII') || upper.startsWith('SI')) return 'Summer';
    return p.campana || p.campaign || 'Mercancía';
  }

  function posButton(p){ return inferCampaign(p); }
  function routeText(p){ return `Mercancía → ${posButton(p)}`; }

  function extractSku(text){
    const clean = String(text || '').replace(/[Oo]/g,'0').replace(/[Il|]/g,'1');
    const skuLine = clean.match(/SKU\s*#?\s*[:\-]?\s*(0?\d[\d\s\-]{6,14})/i);
    if (skuLine) return normalizeSku(skuLine[1]);
    const any = clean.match(/\b0?\d{8,9}\b/);
    return any ? normalizeSku(any[0]) : '';
  }

  const CODE128 = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];

  function makeBarcodeSVG(value){
    const text = String(value || '').trim();
    if (!text) return '';
    const codes = [104];
    for (const ch of text) codes.push(ch.charCodeAt(0) - 32);
    let checksum = 104;
    for (let i = 1; i < codes.length; i++) checksum += codes[i] * i;
    codes.push(checksum % 103, 106);
    const height = 86, scale = 2;
    let x = 0, bars = '';
    for (const code of codes) {
      const pattern = CODE128[code];
      for (let i = 0; i < pattern.length; i++) {
        const w = Number(pattern[i]) * scale;
        if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="${height}"/>`;
        x += w;
      }
    }
    return `<svg class="barcode" viewBox="0 0 ${x} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Código de barras SKU POS ${text}">${bars}</svg>`;
  }

  function productBySku(raw){ return bySku.get(normalizeSku(raw)); }

  function renderProduct(p, sourceSku){
    currentProduct = p;
    const skuPos = String(p.skuPos || '').trim();
    const boton = posButton(p);
    $('result').className = 'result';
    $('result').innerHTML = `
      <div class="card">
        <div class="info">
          <span class="badge">${routeText(p)}</span>
          <div class="title">${p.nombrePos || 'Sin nombre POS'}</div>
          <p class="desc">${p.descripcion || ''}</p>
          <div class="grid">
            <div class="field"><span>SKU leído</span><b>${sourceSku || p.skuIntl || '-'}</b></div>
            <div class="field"><span>Botón POS</span><b>${boton}</b><em>${routeText(p)}</em></div>
            <div class="field main"><span>SKU POS</span><b>${skuPos || '-'}</b></div>
            <div class="field"><span>Código DIA</span><b>${p.codigoDia || '-'}</b></div>
            <div class="field"><span>Nombre POS</span><b>${p.nombrePos || '-'}</b></div>
            <div class="field"><span>Precio</span><b class="price">${firstTier(p)}</b></div>
          </div>
          <div class="pos-help"><b>Flujo POS:</b> Mercancía → ${boton} → escanear código generado.</div>
          <div class="actions" style="margin-top:14px"><button id="addCurrentLabel">Agregar a etiquetado</button></div>
        </div>
        <div class="scanbox">
          <div class="scan-title">Código para escanear en POS</div>
          <div class="barcode-wrap">${makeBarcodeSVG(skuPos)}<div class="human">${skuPos || ''}</div></div>
          <div class="qr-wrap">
            ${p.qrData ? `<img src="${p.qrData}" alt="QR SKU POS ${skuPos}">` : '<div class="noqr">Sin QR</div>'}
            <span>QR respaldo</span>
          </div>
        </div>
      </div>`;
    $('addCurrentLabel').addEventListener('click', () => { $('labelSku').value = p.skuIntl || sourceSku || ''; showTab('etiquetado'); renderLabelPreview(p); });
  }

  function renderNotFound(sku){
    currentProduct = null;
    $('result').className = 'result notfound';
    $('result').innerHTML = `<div class="not-card"><div class="title">SKU no encontrado</div><p>Se leyó: <b>${sku || 'sin lectura'}</b></p><p class="desc">Valida que el OCR haya tomado completo el número después de “SKU #”.</p></div>`;
  }

  function searchSku(raw){
    const normalized = normalizeSku(raw);
    const p = bySku.get(normalized);
    p ? renderProduct(p, raw) : renderNotFound(raw);
  }

  function showTab(name){
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tabpage').forEach(p => p.classList.toggle('active', p.id === name));
  }

  function renderLabelPreview(p){
    if (!p) { $('labelPreview').className = 'label-preview empty-small'; $('labelPreview').textContent = 'SKU no encontrado para etiquetado.'; return; }
    $('labelPreview').className = 'label-preview';
    $('labelPreview').innerHTML = `<div class="preview-card"><div><b>${posButton(p)}</b><small>${p.nombrePos || ''} | ${priceOnly(p)} · SKU POS ${p.skuPos || '-'}</small></div>${p.qrData ? `<img class="mini-qr" src="${p.qrData}" alt="QR">` : ''}</div>`;
  }

  function addLabel(rawSku, qty){
    const p = productBySku(rawSku);
    renderLabelPreview(p);
    if (!p) return;
    const safeQty = Math.max(1, Math.min(500, Number(qty) || 1));
    const key = String(p.skuPos || p.skuIntl);
    const existing = labelItems.find(x => String(x.product.skuPos || x.product.skuIntl) === key);
    if (existing) existing.qty += safeQty; else labelItems.push({product:p, qty:safeQty});
    renderCart();
    $('labelQty').value = 1;
    $('labelSku').select();
  }

  function renderCart(){
    const total = labelItems.reduce((a,x)=>a+x.qty,0);
    $('totalLabels').textContent = total;
    $('pdfLabels').disabled = total === 0;
    if (!labelItems.length) { $('labelCart').className = 'cart empty-small'; $('labelCart').textContent = 'Sin etiquetas agregadas.'; return; }
    $('labelCart').className = 'cart';
    $('labelCart').innerHTML = labelItems.map((x,i)=>`
      <div class="cart-row">
        <div><strong>${posButton(x.product)}</strong><small>${x.product.nombrePos || ''} | ${priceOnly(x.product)}</small></div>
        <div class="sku-col"><small>SKU POS</small><b>${x.product.skuPos || '-'}</b></div>
        <input data-i="${i}" class="qtyEdit" type="number" min="1" max="500" value="${x.qty}">
        <button class="remove" data-remove="${i}">×</button>
      </div>`).join('');
    document.querySelectorAll('.qtyEdit').forEach(inp => inp.addEventListener('change', e => { labelItems[Number(e.target.dataset.i)].qty = Math.max(1, Number(e.target.value)||1); renderCart(); }));
    document.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', e => { labelItems.splice(Number(e.target.dataset.remove),1); renderCart(); }));
  }

  function splitText(doc, text, maxWidth){
    return doc.splitTextToSize(String(text || ''), maxWidth);
  }

  function generatePdf(){
    if (!window.jspdf || !window.jspdf.jsPDF) { alert('No cargó el generador PDF. Revisa internet/CDN.'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({orientation:'portrait', unit:'in', format:'letter'});
    const labelW = 2, labelH = 1.5, marginX = 0.25, marginY = 0.25, gapX = 0.08, gapY = 0.08;
    const cols = 4, rows = 7;
    let n = 0;
    const expanded = [];
    labelItems.forEach(item => { for(let i=0;i<item.qty;i++) expanded.push(item.product); });
    expanded.forEach((p,idx) => {
      if (idx > 0 && n % (cols*rows) === 0) doc.addPage();
      const pos = n % (cols*rows), col = pos % cols, row = Math.floor(pos / cols);
      const x = marginX + col * (labelW + gapX), y = marginY + row * (labelH + gapY);
      doc.setDrawColor(190,170,130); doc.setLineWidth(0.01); doc.roundedRect(x,y,labelW,labelH,0.08,0.08);
      doc.setTextColor(0,72,51); doc.setFont('helvetica','bold'); doc.setFontSize(12.5);
      doc.text(posButton(p), x + labelW/2, y + 0.20, {align:'center', maxWidth:labelW-0.12});
      doc.setFont('helvetica','normal'); doc.setFontSize(6.8); doc.setTextColor(35,43,38);
      const line = `${p.nombrePos || ''} | ${priceOnly(p)}`;
      const lines = splitText(doc, line, labelW - 0.14).slice(0,2);
      doc.text(lines, x + labelW/2, y + 0.36, {align:'center'});
      if (p.qrData) doc.addImage(p.qrData, 'PNG', x + 0.58, y + 0.58, 0.84, 0.84);
      n++;
    });
    doc.save(`CodeBrew_Etiquetas_${expanded.length}_pzas.pdf`);
  }

  async function openCamera(videoId, statusId, startId, scanId, stopId, mode){
    try{
      const s = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}, width:{ideal:1280}, height:{ideal:720}}, audio:false});
      if (mode === 'label') labelStream = s; else stream = s;
      $(videoId).srcObject = s; await $(videoId).play();
      $(scanId).disabled = false; $(stopId).disabled = false; $(startId).disabled = true; $(statusId).textContent = 'Cámara activa';
    }catch(err){ $(statusId).textContent = 'Sin permiso de cámara'; alert('No se pudo abrir la cámara. En GitHub Pages debe abrirse con HTTPS y permiso de cámara.'); }
  }

  function closeCamera(videoId, statusId, startId, scanId, stopId, mode){
    const s = mode === 'label' ? labelStream : stream;
    if(s) s.getTracks().forEach(t => t.stop());
    if (mode === 'label') labelStream = null; else stream = null;
    $(videoId).srcObject = null; $(scanId).disabled = true; $(stopId).disabled = true; $(startId).disabled = false; $(statusId).textContent = 'Listo';
  }

  async function scanFromCamera(videoId, canvasId, statusId, scanBtnId, targetInputId, mode){
    const video = $(videoId), canvas = $(canvasId), ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight; ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    $(statusId).textContent = 'Leyendo texto...'; $(scanBtnId).disabled = true;
    try{
      if (!window.Tesseract) throw new Error('OCR no cargó');
      const { data:{ text } } = await Tesseract.recognize(canvas, 'eng', { logger:m => { if(m.status) $(statusId).textContent = Math.round((m.progress || 0) * 100) + '% OCR'; }});
      const sku = extractSku(text); $(targetInputId).value = sku;
      if (mode === 'label') renderLabelPreview(productBySku(sku)); else (sku ? searchSku(sku) : renderNotFound(''));
    }catch(e){ if (mode === 'label') renderLabelPreview(null); else renderNotFound('Error OCR'); }
    $(statusId).textContent = 'Listo'; $(scanBtnId).disabled = false;
  }

  function init(){
    document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
    $('manualBtn').addEventListener('click', () => searchSku($('manualSku').value));
    $('manualSku').addEventListener('keydown', e => { if(e.key === 'Enter') searchSku(e.target.value); });
    $('labelAddBtn').addEventListener('click', () => addLabel($('labelSku').value, $('labelQty').value));
    $('labelSku').addEventListener('keydown', e => { if(e.key === 'Enter') addLabel(e.target.value, $('labelQty').value); });
    $('labelSku').addEventListener('input', e => renderLabelPreview(productBySku(e.target.value)));
    $('clearLabels').addEventListener('click', () => { labelItems.length = 0; renderCart(); });
    $('pdfLabels').addEventListener('click', generatePdf);

    $('startCamera').addEventListener('click', () => openCamera('video','ocrStatus','startCamera','scanBtn','stopCamera','consulta'));
    $('stopCamera').addEventListener('click', () => closeCamera('video','ocrStatus','startCamera','scanBtn','stopCamera','consulta'));
    $('scanBtn').addEventListener('click', () => scanFromCamera('video','snapshot','ocrStatus','scanBtn','manualSku','consulta'));

    $('labelStartCamera').addEventListener('click', () => openCamera('labelVideo','labelOcrStatus','labelStartCamera','labelScanBtn','labelStopCamera','label'));
    $('labelStopCamera').addEventListener('click', () => closeCamera('labelVideo','labelOcrStatus','labelStartCamera','labelScanBtn','labelStopCamera','label'));
    $('labelScanBtn').addEventListener('click', () => scanFromCamera('labelVideo','labelSnapshot','labelOcrStatus','labelScanBtn','labelSku','label'));

    if('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
