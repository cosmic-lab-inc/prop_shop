import React from "react";
import Box from "@mui/material/Box";
import { keyframes, styled } from "styled-components";
import { customTheme } from "../styles";

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

export function Typing() {
  return (
    <Box sx={{ display: "flex", color: customTheme.light }}>
      <Dot />
      <Dot />
      <Dot />
      <Dot />
    </Box>
  );
}
