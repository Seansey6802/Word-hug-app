import type { MetadataRoute } from "next";

// Prototype: nothing should be indexed. Gift links are always private.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
