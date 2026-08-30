import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Maxim Zicharev — Frontend Developer';

/**
 * Карточка на латинице: встроенного кириллического шрифта у `next/og` нет, а
 * тянуть файл шрифта по сети на каждый рендер — лишняя точка отказа.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: 'linear-gradient(140deg, #241d14 0%, #120f0c 45%, #0a0806 100%)',
        color: '#ece3d2',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            borderRadius: 12,
            border: '1px solid #82652d',
            background: '#c8a44e1f',
            color: '#c8a44e',
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          MZ
        </div>
        <div style={{ fontSize: 22, color: '#968c79', letterSpacing: 4 }}>
          PORTFOLIO
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: -2 }}>
          Maxim Zicharev
        </div>
        <div style={{ fontSize: 40, color: '#c8a44e', marginTop: 8 }}>
          Frontend Developer
        </div>
      </div>

      <div style={{ display: 'flex', fontSize: 24, color: '#bcb19c' }}>
        <span>React, TypeScript, Next.js, Vue 3, Telegram &amp; VK Mini Apps</span>
      </div>
    </div>,
    size,
  );
}
