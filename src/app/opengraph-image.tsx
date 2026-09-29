import { ImageResponse } from "next/og";

export const alt = "Zero X | Gaming: original browser games";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
        background: "radial-gradient(900px 500px at 85% 0%, rgba(255,43,214,0.25), transparent), #05060b",
        color: "#eef1ff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24, fontSize: 44, fontWeight: 800, letterSpacing: 8 }}>
        <div
          style={{
            width: 88,
            height: 88,
            borderRadius: 18,
            border: "3px solid #ff2bd6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 64,
            color: "#22e5ff",
          }}
        >
          X
        </div>
        ZERO X | GAMING
      </div>
      <div style={{ marginTop: 48, fontSize: 88, fontWeight: 900, lineHeight: 1.05 }}>Play. Compete.</div>
      <div style={{ fontSize: 88, fontWeight: 900, color: "#22e5ff" }}>Level up.</div>
      <div style={{ marginTop: 32, fontSize: 32, color: "#a2aac6" }}>
        Zero Dash · Grid Lock · Orbit · Blitz Trivia. No downloads.
      </div>
    </div>,
    size,
  );
}
