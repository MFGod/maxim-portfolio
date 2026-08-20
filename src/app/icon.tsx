import { ImageResponse } from 'next/og';

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0e0c0a',
        color: '#c8a44e',
        fontSize: 30,
        fontWeight: 700,
        fontFamily: 'sans-serif',
        borderRadius: 14,
      }}
    >
      MZ
    </div>,
    size,
  );
}
