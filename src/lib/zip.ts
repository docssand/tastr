import JSZip from "jszip";
import type { ZipContents } from "@/lib/importers/types";

export async function loadZip(file: File): Promise<ZipContents> {
  const zip = await JSZip.loadAsync(file);
  const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);

  return {
    fileNames,
    has: (fileName: string) => fileNames.some((n) => n === fileName || n.endsWith(`/${fileName}`)),
    readText: async (fileName: string) => {
      const entry =
        zip.file(fileName) ?? zip.file(fileNames.find((n) => n.endsWith(`/${fileName}`)) ?? "");
      if (!entry) throw new Error(`File non trovato nello zip: ${fileName}`);
      return entry.async("text");
    },
  };
}
