import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "save siri | จัดการการเงิน",
    short_name: "save siri",
    description: "จัดการรายรับรายจ่ายและวางแผนการออม",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7f4",
    theme_color: "#397b61",
    lang: "th",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}