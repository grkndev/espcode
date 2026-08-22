"use client";

import dynamic from "next/dynamic";

// esptool-js ve Web Serial navigator'a erişiyor — build sırasında SSR'da patlar
// (bkz. app/editor/page.tsx), bu yüzden ssr: false zorunlu.
const FlashTool = dynamic(() => import("@/features/tools/FlashTool"), { ssr: false });

export default function ToolsFlashPage() {
  return <FlashTool />;
}
