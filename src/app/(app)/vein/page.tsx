import { VeinClient } from "./vein-client";

export const metadata = {
  title: "文件管理 · OpenMate",
  description: "Vein 文件管理、存储统计",
};

export default function VeinPage() {
  return <VeinClient />;
}
