// Next.js's app/manifest.js file convention — auto-served at
// /manifest.webmanifest with the <link rel="manifest"> tag wired in
// automatically, no manual head tag needed.
export default function manifest() {
  return {
    name: "AI Qo'ng'iroq Agent",
    short_name: "AI Qo'ng'iroq",
    description: "E-rieltor.uz AI ovozli qo'ng'iroq agenti",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f5f9",
    theme_color: "#5b5ff5",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
