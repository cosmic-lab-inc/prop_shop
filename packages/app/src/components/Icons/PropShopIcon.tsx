import React from "react";

export function PropShopIcon({ size }: { size: number | string }) {
  const path = "src/assets/icon.png";
  return <img src={path} alt={"PropShop Icon"} style={{ width: size }} />;
}
