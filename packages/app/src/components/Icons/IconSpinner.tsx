import React from "react";
import { Box, keyframes, styled } from "@mui/material";

const SpinnerAnimation = keyframes`
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
`;
const Spinner = styled("div")(({ theme }) => ({
  width: "100px",
  height: "100px",
  borderRadius: "50%",
  animation: `${SpinnerAnimation} 1s linear infinite`,
}));

export function IconSpinner({ children }: { children: React.ReactNode }) {
  return (
    <Box>
      <Spinner>{children}</Spinner>
    </Box>
  );
}
