import * as React from "react";
import { styled } from "@mui/material";
import { customTheme } from "../../styles";

const ArrowsWrapper = styled("div")<{ opacity?: string }>`
  background: transparent;
  padding-right: 5px;
  position: relative;
  height: calc(100% - 10px);
  opacity: ${(props) => props.opacity || "1"};
  display: flex;
  align-items: center;
  justify-content: center;

  svg path:last-child {
    transition: transform 0.3s ease;
  }

  &:hover svg path:last-child {
    transform: translateX(7px);
  }
`;

type IconProps = {
  width?: number;
  height?: number;
  color?: string;
  opacity?: string;
  style?: React.CSSProperties;
};

export function ArrowsIcon({
  width,
  height,
  color,
  opacity,
  style,
}: IconProps) {
  return (
    <ArrowsWrapper opacity={opacity} style={style}>
      <svg
        width={width ?? 20}
        height={height ?? 18}
        viewBox="0 0 14 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          opacity="0.6"
          d="M8 1L13 6L8 11"
          stroke={color ?? customTheme.rust}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M1 1L6 6L1 11"
          stroke={color ?? customTheme.rust}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </ArrowsWrapper>
  );
}
