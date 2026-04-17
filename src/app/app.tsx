"use client";

import dynamic from "next/dynamic";

const LivMoreBase = dynamic(() => import("@/components/LivMoreBase"), {
  ssr: false,
});

export default function App() {
  return <LivMoreBase />;
}