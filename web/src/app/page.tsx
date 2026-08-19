"use client";

import dynamic from "next/dynamic";

// esptool-js ve Web Serial navigator'a erişiyor — build sırasında SSR'da patlar
// (frontend.plan.md §2.3), bu yüzden ssr: false zorunlu.
const IdeShell = dynamic(() => import("@/features/ide/IdeShell"), { ssr: false });

export default function Home() {
  return <IdeShell />;
}
