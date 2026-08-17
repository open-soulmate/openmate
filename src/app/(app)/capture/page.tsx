import { CaptureClient } from "./capture-client";

export const metadata = {
  title: "采集管理 · OpenMate",
  description: "浏览器采集内容管理、知识库提升",
};

export default function CapturePage() {
  return <CaptureClient />;
}
