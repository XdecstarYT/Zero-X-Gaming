import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zero X | Gaming",
    short_name: "Zero X",
    description: "Original browser games. Play, compete, level up.",
    start_url: "/",
    display: "standalone",
    background_color: "#05060b",
    theme_color: "#05060b",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
