import React from "react";
import { keyframes, styled } from "styled-components";
import { customTheme } from "../../styles";
import { EpochIcon } from "..";
import { Box } from "@mui/material";

// Keyframes for the dot animation
const blink = keyframes`
  0% { opacity: 0.2; color: ${customTheme.light}; }
  20% { opacity: 0.7; color: ${customTheme.light}; }
  40% { opacity: 1; color: ${customTheme.red}; }
  100% { opacity: 0.2; color: ${customTheme.light}; }
`;

// Styled component for the animated dot
const Dot = styled("div")`
  background-color: currentColor;
  border-radius: 50%;
  width: 10px;
  height: 10px;
  margin: 0 4px;
  animation: ${blink} 1.8s infinite both;

  &:nth-of-type(1) {
    animation-delay: -0.64s;
  }

  &:nth-of-type(2) {
    animation-delay: -0.32s;
  }

  &:nth-of-type(3) {
    animation-delay: -0.16s;
  }
`;

export function EpochButton() {
  return (
    <Box
      sx={{
        width: "100px",
        height: "100px",
        display: "flex",
        justifyContent: "center",
        alignContent: "center",
        borderRadius: "50%",
        border: `2px solid ${customTheme.light}`,
        bgcolor: customTheme.grey,
        boxShadow: `0 0 10px 0 ${customTheme.light}`,
      }}
    >
      <EpochIcon size={90} />
    </Box>
  );
}
