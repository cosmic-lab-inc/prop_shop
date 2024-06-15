import React, { useEffect, useRef } from "react";
import hljs from "highlight.js/lib/core";
import rust from "highlight.js/lib/languages/rust";
import "./code-snippet.css";
import { customTheme } from "../styles";
import { Box } from "@mui/material";

hljs.registerLanguage("rust", rust);

export function CodeSnippet({ code }: { code: string }) {
  const codeRef = useRef(null);

  useEffect(() => {
    hljs.highlightBlock(codeRef.current!);
  }, []);

  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        bgcolor: customTheme.light,
        borderRadius: "3px",
        flexGrow: 1,
      }}
    >
      <pre>
        <code
          className="rust"
          style={{
            background: "transparent",
            fontSize: 20,
            lineHeight: "1.5rem",
            letterSpacing: "1px",
            fontFamily: customTheme.font.titilliumBold,
          }}
          ref={codeRef}
        >
          {code}
        </code>
      </pre>
    </Box>
  );
}
