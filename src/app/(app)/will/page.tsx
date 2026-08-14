import { WillClient } from "./will-client";

export const metadata = {
  title: "意志 · OpenMate",
  description: "OpenWill 工作流引擎、条件触发、多分支编排",
};

export default function WillPage() {
  return <WillClient />;
}
