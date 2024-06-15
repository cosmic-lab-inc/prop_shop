import React from "react";
import * as ReactDOM from "react-dom/client";
import { AppRoot } from "./AppRoot";

const el = document.getElementById("root");
if (el === null) {
  throw new Error("Root container missing in index.html");
}

const root = ReactDOM.createRoot(el);

root.render(<AppRoot />);