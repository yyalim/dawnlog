import fs from "fs/promises";
import path from "path";

export function formatOutputFilename(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `dawnlog-${yyyy}-${mm}-${dd}.md`;
}

export async function saveOutput(
  content: string,
  outputDir: string,
  date: Date = new Date(),
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  const filename = formatOutputFilename(date);
  const outputPath = path.join(outputDir, filename);
  await fs.writeFile(outputPath, content, "utf-8");
  return path.resolve(outputPath);
}
