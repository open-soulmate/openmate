import { NerveClient } from "./nerve-client";

export const metadata = {
  title: "神经 · OpenMate",
  description: "OpenNerve 事件总线、消息分发、节点管理",
};

export default function NervePage() {
  return <NerveClient />;
}
