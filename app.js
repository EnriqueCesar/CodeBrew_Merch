(() => {
  const $ = (id) => document.getElementById(id);
  const products = window.PRODUCTS || [];
  let stream = null;
  let labelStream = null;
  let currentProduct = null;
  let currentTier = 'C2';
  const labelItems = [];

  function normalizeSku(value){ return String(value || '').replace(/[^0-9]/g,'').replace(/^0+/,'') || ''; }
  function normalizeText(value){ return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim(); }
  function moneyClean(v){ return String(v || '').trim(); }
  function tierKeys(p){ return Object.keys(p.tier || {}).filter(k => moneyClean(p.tier[k])); }
  function priceFor(p, tier){ const keys = tierKeys(p); const k = keys.includes(tier) ? tier : (keys[0] || 'C1'); return p.tier?.[k] || ''; }
  function priceLabel(p, tier){ const keys = tierKeys(p); const k = keys.includes(tier) ? tier : (keys[0] || 'C1'); const price = p.tier?.[k] || ''; return price ? `${k}: ${price}` : '-'; }
  function priceOnly(p, tier){ return priceFor(p, tier) || '-'; }
  function qrValue(p){ return String(p?.skuPos || p?.botonPos || p?.nombrePos || '').trim(); }
  function routeText(p){ return `Mercancía → ${p?.botonPos || 'Botón POS'}`; }
  function looksEssentialQuery(value){ return /\bCOR(?:23|24|25|26)/i.test(String(value || '')); }
  function posStepsHtml(p){
    const btn = p?.botonPos || 'Botón POS';
    return `<div class="pos-flow-title">Ayuda visual POS</div>
      <div class="pos-flow-visual">
        <div class="pos-step"><b>1</b><span><strong>Identifica Mercancía</strong><br><span class="pos-chip">Mercancía</span></span></div>
        <div class="pos-step"><b>2</b><span><strong>Abre el botón correcto</strong><br><span class="pos-chip">${btn}</span></span></div>
        <div class="pos-step"><b>3</b><span><strong>Escanea el código</strong><br>Usa el código de esta ficha en el POS.</span></div>
      </div>`;
  }

  const numericIndex = new Map();
  products.forEach(p => {
    [p.skuIntl, p.codigoDia, p.skuPos].forEach(v => {
      const key = normalizeSku(v);
      if (key && !numericIndex.has(key)) numericIndex.set(key, p);
    });
  });

  function findProduct(raw){
    const input = String(raw || '').trim();
    const numeric = normalizeSku(input);
    if (numeric && numericIndex.has(numeric)) return numericIndex.get(numeric);
    const q = normalizeText(input);
    if (!q) return null;
    let exact = products.find(p => [p.nombrePos,p.nombreInventario,p.botonPos,p.skuPos].some(v => normalizeText(v) === q));
    if (exact) return exact;
    return products.find(p => normalizeText(`${p.nombrePos} ${p.nombreInventario} ${p.descripcion} ${p.botonPos} ${p.skuPos}`).includes(q)) || null;
  }

  function extractSku(text){
    const clean = String(text || '').replace(/[Oo]/g,'0').replace(/[Il|]/g,'1');
    const skuLine = clean.match(/SKU\s*#?\s*[:\-]?\s*(0?\d[\d\s\-]{6,14})/i);
    if (skuLine) return normalizeSku(skuLine[1]);
    const any = clean.match(/\b0?\d{8,9}\b/);
    return any ? normalizeSku(any[0]) : '';
  }

  function qrDataUrl(value, size=260){
    const text = String(value || '').trim();
    if (!text || !window.QRious) return '';
    const qr = new QRious({ value: text, size, level: 'H', padding: 8 });
    return qr.toDataURL('image/png');
  }

  const CODE128 = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];
  function makeBarcodeSVG(value){
    const text = String(value || '').trim();
    if (!text) return '<div class="no-code">Sin código POS</div>';
    const codes = [104];
    for (const ch of text) { const v = ch.charCodeAt(0) - 32; if (v < 0 || v > 95) continue; codes.push(v); }
    let checksum = 104; for (let i = 1; i < codes.length; i++) checksum += codes[i] * i;
    codes.push(checksum % 103, 106);
    const height = 86, scale = 2; let x = 0, bars = '';
    for (const code of codes) {
      const pattern = CODE128[code];
      for (let i = 0; i < pattern.length; i++) { const w = Number(pattern[i]) * scale; if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="${height}"/>`; x += w; }
    }
    return `<svg class="barcode" viewBox="0 0 ${x} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Código POS ${text}">${bars}</svg>`;
  }

  function tierSelectHtml(p, selected='C1', id='tierSelect'){
    const keys = tierKeys(p);
    if (keys.length <= 1) return '';
    return `<label class="tier-inline">Tier <select id="${id}">${keys.map(k => `<option value="${k}" ${k===selected?'selected':''}>${k} · ${p.tier[k]}</option>`).join('')}</select></label>`;
  }

  function renderProduct(p, source){
    currentProduct = p;
    const keys = tierKeys(p); if (!keys.includes(currentTier)) currentTier = keys[0] || 'C1';
    const boton = p.botonPos || 'Mercancía';
    const skuPos = qrValue(p);
    $('result').className = 'result';
    $('result').innerHTML = `
      <div class="card">
        <div class="info">
          <span class="badge">Mercancía → ${boton}</span>
          <div class="title">${p.nombrePos || 'Sin nombre POS'}</div>
          <p class="desc">${p.descripcion || ''}</p>
          ${tierSelectHtml(p, currentTier, 'tierSelect')}
          <div class="grid">
            <div class="field"><span>SKU leído</span><b>${source || p.skuIntl || '-'}</b></div>
            <div class="field"><span>Botón POS</span><b>${boton}</b><em>${p.base || ''}</em></div>
            <div class="field main"><span>SKU POS</span><b>${skuPos || '-'}</b></div>
            <div class="field"><span>Código DIA</span><b>${p.codigoDia || '-'}</b></div>
            <div class="field"><span>Nombre POS</span><b>${p.nombrePos || '-'}</b></div>
            <div class="field"><span>Precio</span><b class="price">${priceLabel(p, currentTier)}</b></div>
          </div>
          <div class="pos-help"><b>Flujo POS:</b> Mercancía → ${boton} → escanear código generado.</div>
          <div class="actions" style="margin-top:14px"><button id="addCurrentLabel">Agregar a etiquetado</button></div>
        </div>
        <div class="scanbox">
          <div class="scan-title">Código para escanear en POS</div>
          <div class="barcode-wrap">${makeBarcodeSVG(skuPos)}<div class="human">${skuPos || ''}</div></div>
          ${posStepsHtml(p)}
        </div>
      </div>`;
    const tierSelect = $('tierSelect');
    if (tierSelect) tierSelect.addEventListener('change', e => { currentTier = e.target.value; renderProduct(p, source); });
    $('addCurrentLabel').addEventListener('click', () => { $('labelSku').value = p.skuIntl && p.skuIntl !== 'NA' ? p.skuIntl : (p.nombreInventario || p.nombrePos || source || ''); showTab('etiquetado'); setLabelProduct(p); });
  }

  function renderNotFound(q){
    currentProduct = null;
    $('result').className = 'result notfound';
    const essential = looksEssentialQuery(q);
    $('result').innerHTML = `<div class="not-card"><div class="title">${essential ? 'Essentials / método no se etiqueta como Merch' : 'Artículo no encontrado'}</div><p>Se buscó: <b>${q || 'sin lectura'}</b></p><p class="desc">${essential ? 'Los códigos COR23, COR24, COR25 y COR26 pertenecen a métodos / Essentials. Para Merch, busca SKU #, Código DIA, SKU POS, Nombre POS o Nombre Inventario.' : 'Verifica SKU #, Código DIA, SKU POS, Nombre POS o Nombre Inventario. Si es producto nuevo, actualiza la Base de Precios.'}</p></div>`;
  }

  function search(raw){ const p = findProduct(raw); p ? renderProduct(p, raw) : renderNotFound(raw); }

  function showTab(name){
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tabpage').forEach(p => p.classList.toggle('active', p.id === name));
  }

  function updateLabelTier(p){
    const sel = $('labelTier'); const keys = p ? tierKeys(p) : ['C1'];
    sel.innerHTML = (keys.length ? keys : ['C2']).map(k => `<option value="${k}">${k}${p?.tier?.[k] ? ' · '+p.tier[k] : ''}</option>`).join('');
    if (p && keys.includes('C2')) sel.value = 'C2';
    sel.disabled = !p || keys.length <= 1;
  }

  function setLabelProduct(p){ updateLabelTier(p); renderLabelPreview(p); }

  function renderLabelPreview(p){
    if (!p) { $('labelPreview').className = 'label-preview empty-small'; $('labelPreview').textContent = 'SKU / nombre no encontrado para etiquetado.'; updateLabelTier(null); return; }
    const tier = $('labelTier').value || tierKeys(p)[0] || 'C1';
    const qr = qrDataUrl(qrValue(p), 160);
    $('labelPreview').className = 'label-preview';
    $('labelPreview').innerHTML = `<div class="preview-card">
      <div><b>${p.botonPos || 'Mercancía'}</b><small>${p.nombrePos || ''} | ${priceOnly(p, tier)}</small><strong>SKU ${qrValue(p) || '-'}</strong></div>
      ${qr ? `<img class="mini-qr" src="${qr}" alt="QR">` : ''}
    </div>`;
  }

  function addLabel(raw, qty){
    const p = findProduct(raw); setLabelProduct(p); if (!p) return;
    const tier = $('labelTier').value || tierKeys(p)[0] || 'C1';
    const safeQty = Math.max(1, Math.min(500, Number(qty) || 1));
    labelItems.push({ product:p, qty:safeQty, tier });
    renderCart(); $('labelQty').value = 1; $('labelSku').select();
  }

  function renderCart(){
    const total = labelItems.reduce((a,x)=>a+x.qty,0); $('totalLabels').textContent = total; $('pdfLabels').disabled = total === 0;
    if (!labelItems.length) { $('labelCart').className = 'cart empty-small'; $('labelCart').textContent = 'Sin etiquetas agregadas.'; return; }
    $('labelCart').className = 'cart';
    $('labelCart').innerHTML = labelItems.map((x,i)=>`
      <div class="cart-row">
        <div><strong>${x.product.botonPos || 'Mercancía'}</strong><small>${x.product.nombrePos || ''} | ${priceOnly(x.product, x.tier)} · ${x.tier}</small></div>
        <div class="sku-col"><small>SKU</small><b>${qrValue(x.product) || '-'}</b></div>
        <input data-i="${i}" class="qtyEdit" type="number" min="1" max="500" value="${x.qty}">
        <button class="remove" data-remove="${i}">×</button>
      </div>`).join('');
    document.querySelectorAll('.qtyEdit').forEach(inp => inp.addEventListener('change', e => { labelItems[Number(e.target.dataset.i)].qty = Math.max(1, Number(e.target.value)||1); renderCart(); }));
    document.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', e => { labelItems.splice(Number(e.target.dataset.remove),1); renderCart(); }));
  }

  function generatePdf(){
    if (!window.jspdf || !window.jspdf.jsPDF) { alert('No cargó el generador PDF. Revisa internet/CDN.'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({orientation:'portrait', unit:'in', format:'letter'});
    const labelW = 2, labelH = 1.5, marginX = 0.25, marginY = 0.25, gapX = 0.08, gapY = 0.08;
    const cols = 4, rows = 7;
    const expanded=[]; labelItems.forEach(item => { for(let i=0;i<item.qty;i++) expanded.push({p:item.product, tier:item.tier}); });
    expanded.forEach((it,idx) => {
      if (idx > 0 && idx % (cols*rows) === 0) doc.addPage();
      const pos = idx % (cols*rows), col = pos % cols, row = Math.floor(pos / cols);
      const x = marginX + col * (labelW + gapX), y = marginY + row * (labelH + gapY);
      const p = it.p, tier = it.tier, sku = qrValue(p);
      doc.setDrawColor(190,170,130); doc.setLineWidth(0.01); doc.roundedRect(x,y,labelW,labelH,0.08,0.08);
      doc.setTextColor(0,72,51); doc.setFont('helvetica','bold'); doc.setFontSize(11.5);
      doc.text(String(p.botonPos || 'Mercancía'), x + labelW/2, y + 0.19, {align:'center', maxWidth:labelW-0.12});
      doc.setTextColor(35,43,38); doc.setFont('helvetica','normal'); doc.setFontSize(6.7);
      const line = `${p.nombrePos || ''} | ${priceOnly(p, tier)}`;
      doc.text(doc.splitTextToSize(line, labelW - 0.14).slice(0,2), x + labelW/2, y + 0.36, {align:'center'});
      doc.setFont('helvetica','bold'); doc.setFontSize(11.5); doc.setTextColor(0,72,51);
      doc.text(`SKU ${sku || '-'}`, x + labelW/2, y + 0.60, {align:'center', maxWidth:labelW-0.14});
      const qr = qrDataUrl(sku, 340); if (qr) doc.addImage(qr, 'PNG', x + 0.58, y + 0.70, 0.84, 0.74);
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
    const s = mode === 'label' ? labelStream : stream; if(s) s.getTracks().forEach(t => t.stop());
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
      if (mode === 'label') setLabelProduct(findProduct(sku)); else (sku ? search(sku) : renderNotFound(''));
    }catch(e){ if (mode === 'label') setLabelProduct(null); else renderNotFound('Error OCR'); }
    $(statusId).textContent = 'Listo'; $(scanBtnId).disabled = false;
  }

  function init(){
    document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
    $('manualBtn').addEventListener('click', () => search($('manualSku').value));
    $('manualSku').addEventListener('keydown', e => { if(e.key === 'Enter') search(e.target.value); });
    $('labelAddBtn').addEventListener('click', () => addLabel($('labelSku').value, $('labelQty').value));
    $('labelSku').addEventListener('keydown', e => { if(e.key === 'Enter') addLabel(e.target.value, $('labelQty').value); });
    $('labelSku').addEventListener('input', e => setLabelProduct(findProduct(e.target.value)));
    $('labelTier').addEventListener('change', () => renderLabelPreview(findProduct($('labelSku').value)));
    $('clearLabels').addEventListener('click', () => { labelItems.length = 0; renderCart(); });
    $('pdfLabels').addEventListener('click', generatePdf);
    $('startCamera').addEventListener('click', () => openCamera('video','ocrStatus','startCamera','scanBtn','stopCamera','consulta'));
    $('stopCamera').addEventListener('click', () => closeCamera('video','ocrStatus','startCamera','scanBtn','stopCamera','consulta'));
    $('scanBtn').addEventListener('click', () => scanFromCamera('video','snapshot','ocrStatus','scanBtn','manualSku','consulta'));
    $('labelStartCamera').addEventListener('click', () => openCamera('labelVideo','labelOcrStatus','labelStartCamera','labelScanBtn','labelStopCamera','label'));
    $('labelStopCamera').addEventListener('click', () => closeCamera('labelVideo','labelOcrStatus','labelStartCamera','labelScanBtn','labelStopCamera','label'));
    $('labelScanBtn').addEventListener('click', () => scanFromCamera('labelVideo','labelSnapshot','labelOcrStatus','labelScanBtn','labelSku','label'));
    renderCart();
    if('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
