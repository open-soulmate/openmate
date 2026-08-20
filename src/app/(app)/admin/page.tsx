"use client";
import dynamic from "next/dynamic";
const AdminClient = dynamic(() => import("./admin-client").then((m) => m.AdminClient), { ssr: false });
export default function AdminPage() {
  return <AdminClient />;
}
