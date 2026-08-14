"use client";
import dynamic from "next/dynamic";
const SearchClient = dynamic(() => import("./search-client").then(m => m.SearchClient), { ssr: false });
export default function SearchPage() { return <SearchClient />; }
