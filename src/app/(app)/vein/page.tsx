import { VeinClient } from "./vein-client";

export const metadata = {
  title: "血管 · OpenMate",
  description: "OpenVein 文件管理、缓存、分片上传",
};

export default function VeinPage() {
  return <VeinClient />;
}
