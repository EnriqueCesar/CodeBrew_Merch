# CodeBrew Merch PWA

Buscador PWA para merch: lee el `SKU #` de la etiqueta, busca el producto en la base, muestra campaña/ruta POS, SKU POS, precio y genera código de barras + QR con el SKU POS.

## Uso en GitHub Pages

1. Sube todos los archivos a un repositorio, respetando la raíz del proyecto.
2. Activa GitHub Pages en `Settings > Pages`.
3. Abre la URL HTTPS del sitio.
4. Busca por cámara o escribe manualmente el SKU de etiqueta.

## Flujo POS

La tarjeta muestra la ruta sugerida, por ejemplo:

- `Mercancía → World Cup`
- `Mercancía → Spring`
- `Mercancía → Discovery`

Después escanea el código de barras generado. El código codifica únicamente el `SKU POS`.
