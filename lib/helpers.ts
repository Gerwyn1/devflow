import "server-only";
import fs from "fs";

const filePath = "lib/database.json";

export interface Ticket {
  id: number;
  name: string;
  status: string;
  type: string;
}

// Helper function to read data
export function readFile() {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

// Helper function to write data
export function writeFile(data: Record<string, Ticket>) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
