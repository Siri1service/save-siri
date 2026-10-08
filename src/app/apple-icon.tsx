import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          borderRadius: 40,
          backgroundColor: "#397b61",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            width: 108,
            height: 76,
            paddingRight: 15,
            border: "8px solid #ffffff",
            borderRadius: 17,
            color: "#ffffff",
            fontSize: 30,
            fontWeight: 700,
          }}
        >
          s
        </div>
      </div>
    ),
    size,
  );
}