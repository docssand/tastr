import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Locandine dei suggerimenti: l'unico host esterno da cui l'app carica immagini.
    remotePatterns: [new URL("https://image.tmdb.org/t/p/**")],
  },
};

export default nextConfig;
