import type { MetadataRoute } from "next";

/** Il CRM come app sul telefono: dall'icona si apre l'inserimento veloce. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Somaspace CRM",
    short_name: "Somaspace",
    description: "Il CRM interno di Somaspace",
    id: "/veloce",
    start_url: "/veloce",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0e0f11",
    theme_color: "#0e0f11",
    lang: "it",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Nuovo contatto", url: "/veloce" }],
  };
}
