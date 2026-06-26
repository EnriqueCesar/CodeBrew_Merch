const $ = (id) => document.getElementById(id);
const products = window.PRODUCTS || [];
const bySku = new Map(products.map(p => [normalizeSku(p.skuIntl), p]));
$('countProducts').textContent = products.length;
let stream = null;
function normalizeSku(value){ return String(value || '').replace(/\D/g,'').replace(/^0+/,'') || ''; }
function moneyTier(p){ const t=p.tier||{}; return Object.entries(t).filter(([k,v])=>v).map(([k,v])=>`${k}: ${v}`); }
function extractSku(text){
  const clean = String(text || '').replace(/[Oo]/g,'0').replace(/[Il|]/g,'1');
  const skuLine = clean.match(/SKU\s*#?\s*[:\-]?\s*(0?\d[\d\s\-]{6,12})/i);
  if(skuLine) return normalizeSku(skuLine[1]);
  const any = clean.match(/\b0?\d{8,9}\b/);
  return any ? normalizeSku(any[0]) : '';
}
function renderProduct(p, sourceSku){
  const tiers = moneyTier(p);
  $('result').className='result';
  $('result').innerHTML = `<div class="card">
    <div>
      <span class="badge">${p.base || 'Base Merch'}</span>
      <div class="title">${p.nombrePos || 'Sin nombre POS'}</div>
      <p class="desc">${p.descripcion || ''}</p>
      <div class="grid">
        <div class="field"><span>SKU leído</span><b>${sourceSku || p.skuIntl}</b></div>
        <div class="field"><span>SKU INTL</span><b>${p.skuIntl || '-'}</b></div>
        <div class="field"><span>SKU POS</span><b>${p.skuPos || '-'}</b></div>
        <div class="field"><span>Código DIA</span><b>${p.codigoDia || '-'}</b></div>
        <div class="field"><span>Botón POS</span><b>${p.botonPos || 'MERCH'}</b></div>
        <div class="field"><span>Precio</span><b class="price">${tiers[0] || '-'}</b></div>
      </div>
    </div>
    <div class="qrbox"><div><b>QR para escanear</b><br><small>Codifica SKU POS: ${p.skuPos || '-'}</small></div><canvas id="qr"></canvas></div>
  </div>`;
  if(window.QRCode && p.skuPos){ QRCode.toCanvas($('qr'), String(p.skuPos), {width:220, margin:1}); }
}
function renderNotFound(sku){
  $('result').className='result notfound';
  $('result').innerHTML=`<div class="title">SKU no encontrado</div><p>Se leyó: <b>${sku || 'sin lectura'}</b></p><p class="desc">Valida que el OCR haya tomado completo el número después de “SKU #”.</p>`;
}
function searchSku(raw){ const normalized=normalizeSku(raw); const p=bySku.get(normalized); p ? renderProduct(p, raw) : renderNotFound(raw); }
$('manualBtn').addEventListener('click',()=>searchSku($('manualSku').value));
$('manualSku').addEventListener('keydown',e=>{ if(e.key==='Enter') searchSku(e.target.value); });
$('startCamera').addEventListener('click', async()=>{
  try{
    stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}, width:{ideal:1280}, height:{ideal:720}}, audio:false});
    $('video').srcObject=stream; await $('video').play();
    $('scanBtn').disabled=false; $('stopCamera').disabled=false; $('startCamera').disabled=true; $('ocrStatus').textContent='Cámara activa';
  }catch(err){ $('ocrStatus').textContent='Sin permiso de cámara'; alert('No se pudo abrir la cámara. En GitHub Pages debe abrirse con HTTPS.'); }
});
$('stopCamera').addEventListener('click',()=>{ if(stream) stream.getTracks().forEach(t=>t.stop()); stream=null; $('video').srcObject=null; $('scanBtn').disabled=true; $('stopCamera').disabled=true; $('startCamera').disabled=false; $('ocrStatus').textContent='Listo'; });
$('scanBtn').addEventListener('click', async()=>{
  const video=$('video'), canvas=$('snapshot'), ctx=canvas.getContext('2d');
  canvas.width=video.videoWidth; canvas.height=video.videoHeight; ctx.drawImage(video,0,0,canvas.width,canvas.height);
  $('ocrStatus').textContent='Leyendo texto...'; $('scanBtn').disabled=true;
  try{
    const { data:{ text } } = await Tesseract.recognize(canvas, 'eng', { logger:m=>{ if(m.status) $('ocrStatus').textContent = Math.round((m.progress||0)*100)+'% OCR'; }});
    const sku=extractSku(text); $('manualSku').value=sku; sku ? searchSku(sku) : renderNotFound('');
  }catch(e){ renderNotFound('Error OCR'); }
  $('ocrStatus').textContent='Listo'; $('scanBtn').disabled=false;
});
if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js')); }
