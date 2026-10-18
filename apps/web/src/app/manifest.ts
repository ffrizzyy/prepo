import type { MetadataRoute } from "next";
import { BRAND } from "@prepo/shared";

/**
 * The web app manifest, served at `/manifest.webmanifest`.
 *
 * This is what makes Prepo installable: browsers require a manifest, icons at
 * 192px and 512px, a name and `display: standalone` before they will offer to
 * install a site at all. Everything the install dialog shows comes from here, so
 * the values are the real ones — the product name, the real description, and the
 * mark the desktop shell uses.
 *
 * `start_url` is `/` rather than a workspace route on purpose. A manifest is
 * shared by everyone who installs the app, and it cannot name a workspace; `/`
 * sends the visitor to the front door, which knows whose session it has (landing
 * page when signed out, workspace when signed in).
 *
 * The colours are the app's own tokens: `--ink` for the icon's square, which is
 * also what the splash screen should be.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0b0b0c",
    theme_color: "#0b0b0c",
    categories: ["productivity", "business"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        // Maskable icons are cropped by the platform to whatever shape it likes,
        // so this one bleeds to every edge and keeps the mark inside the safe
        // zone. It is a separate file rather than a `purpose` on the icon above,
        // because a maskable icon must not have transparent corners.
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
