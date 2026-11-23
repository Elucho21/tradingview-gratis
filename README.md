# TradingView Gratis

Plataforma de charts en vivo, gratis y open source: cripto en tiempo real (Binance), acciones, forex, metales e índices (Twelve Data).

**Live:** https://tradingview-gratis.netlify.app

## Funciones

- **Gráfico:** velas, velas huecas, Heikin Ashi, barras, línea, área y línea base. Leyenda OHLC al pasar el mouse, cuenta regresiva al cierre de la vela, escalas %, log y auto, botón "ir al tiempo real" e historial infinito al scrollear hacia atrás.
- **Temporalidades:** 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1D, 3D, 1S y 1M. Se pueden escribir directo en el gráfico (ej: `240` + Enter).
- **Indicadores (11):** EMA, SMA, Bandas de Bollinger, VWAP, SuperTrend, Volumen, RSI, MACD, Estocástico, ATR y OBV. Se configuran desde la leyenda (ocultar, configurar, eliminar).
- **Dibujos (11):** tendencia, rayo, horizontal, vertical, rectángulo, Fibonacci (retroceso y extensión), posición larga/corta con R:R, texto y regla. Se pueden seleccionar, mover y borrar, con modo imán, bloqueo, ocultar y deshacer/rehacer.
- **Multi-gráfico:** 1, 2, 3 o 4 gráficos, con símbolo, temporalidad y cruz sincronizables.
- **Comparar símbolos:** superposición en % (hasta 4).
- **Replay de velas:** elegís un punto y reproducís a 1x, 3x o 10x, o vela por vela.
- **Panel lateral:** watchlist (orden y reordenamiento por arrastre), detalles del símbolo, libro de órdenes y operaciones en vivo.
- **Alertas:** cruza, sube a o baja a. Avisan con mensaje en pantalla, sonido y notificación del navegador. Se crean con clic derecho sobre el precio y se ven como líneas en el gráfico.
- **Diario de trades:** estadísticas, P&L no realizado en vivo, cierre rápido, marcas en el gráfico y exportación a CSV.
- **Varios:** menú contextual, atajos de teclado (`?`), tema claro/oscuro, modo foco, pantalla completa, captura (descargar o copiar), link compartible (`?s=ETHUSDT&tf=1h`) y diseño responsive.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5180
npm run build      # genera dist/
```

Deploy a Netlify: `netlify deploy --prod --dir dist` (o conectar el repo: build `npm run build`, publish `dist`).

Stack: Vite + React + TypeScript + [lightweight-charts](https://github.com/tradingview/lightweight-charts) + zustand.

Las acciones, el forex y los índices necesitan una API key gratuita de [Twelve Data](https://twelvedata.com) (Ajustes → API key). Sin key, solo funcionan los símbolos de demo (por ejemplo, AAPL y EUR/USD).
