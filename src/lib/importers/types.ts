import type { ImportResult, ImportSource } from "@/lib/types";

export interface ZipContents {
  fileNames: string[];
  readText: (fileName: string) => Promise<string>;
  has: (fileName: string) => boolean;
}

export interface ImportAdapter {
  source: ImportSource;
  label: string;
  detect: (zip: ZipContents) => Promise<boolean> | boolean;
  parse: (zip: ZipContents, fileName: string) => Promise<ImportResult>;
}
