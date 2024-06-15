import React from "react";

type IconProps = {
  color?: string;
  size?: number | string;
};

export function HistorianIcon({ color, size }: IconProps) {
  return (
    <svg
      width={size ?? "800px"}
      height={size ?? "800px"}
      viewBox="0 0 128 128"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      role="img"
      className="iconify iconify--noto"
      preserveAspectRatio="xMidYMid meet"
    >
      <path fill="#d68b52" d="M22.13 18.65h23.19v15.08H22.13z"></path>

      <ellipse
        cx="114.59"
        cy="108.83"
        rx="9.41"
        ry="12.65"
        fill="#f2bd72"
      ></ellipse>

      <path
        d="M114.59 96.18h-5.18s.04-63.41.04-74.11s-7.61-15.55-10.42-15.55h-76.9s10.1 1.21 10.23 15.55c.09 10.21 0 62.8 0 79.61s6.37 19.79 6.37 19.79h75.38c.07 0 .14-.01.21-.02c.09 0 .18.02.27.02c5.2 0 9.41-5.66 9.41-12.65c0-6.97-4.21-12.64-9.41-12.64z"
        fill="#ffd8a1"
      ></path>

      <path
        d="M114.59 96.18h-5.18s.04-63.41.04-74.11s-7.61-15.55-10.42-15.55h-76.9s10.1 1.21 10.23 15.55c.09 10.21 0 62.8 0 79.61s6.37 19.79 6.37 19.79h75.38c.07 0 .14-.01.21-.02c.09 0 .18.02.27.02c5.2 0 9.41-5.66 9.41-12.65c0-6.97-4.21-12.64-9.41-12.64z"
        fill="#ffd8a1"
      ></path>

      <path
        d="M32.26 100.75l.09-9.1s59.53 6.46 77.04-14.12v22.99l-77.13.23z"
        fill="#f2bd72"
      ></path>

      <g
        opacity=".6"
        fill="none"
        stroke="#9e673c"
        strokeWidth="3.005"
        strokeLinecap="round"
        strokeMiterlimit="10"
      >
        <path
          d="M45.52 30.1c1.17 0 2.35-.02 3.52 0c.89.02 1.72.14 2.63.05c.98-.1 1.96-.29 2.96-.26c1.22.04 2.39.41 3.62.41c.6 0 1.14-.17 1.73-.2c.68-.03 1.36 0 2.04 0h4.3"
          opacity=".77"
        ></path>

        <path
          d="M79.01 30.1c.73 0 1.49.06 2.21-.05c1.12-.17 2.19-.63 3.36-.53c1.25.11 2.31.84 3.54 1.03c1.99.29 3.86-.9 5.87-1.09c.64-.06 1.28-.02 1.92.03c1.45.12 2.88.3 4.31.53"
          opacity=".77"
        ></path>

        <path
          d="M45.52 53.51c1 0 2.04.1 3.03 0c1.39-.14 2.73-.63 4.16-.56c1.44.07 2.76.7 4.17.95c1.94.33 3.89-.08 5.81-.33c2.05-.27 4-.05 6.06-.05h7.7"
          opacity=".77"
        ></path>

        <path
          d="M86.77 53.51c.74 0 1.48-.01 2.22 0c1.25.02 2.18-.38 3.37-.61c1.69-.33 3.38.19 5.05.36c1.23.12 2.52.26 3.75.25"
          opacity=".77"
        ></path>

        <path
          d="M68.56 76.96c1.34 0 2.74-.09 4.05.09c2.27.32 4.18-.39 6.41-.62c2.09-.22 4.18.2 6.28.37c2.18.18 4.37.1 6.56.02c2.27-.08 4.54.13 6.83.13"
          opacity=".77"
        ></path>

        <path
          d="M44.58 76.96c1.96 0 3.89.37 5.85.23c.66-.05 1.32-.14 1.99-.17c1.33-.07 2.67.23 3.98.08c.87-.1 1.7-.14 2.58-.14"
          opacity=".77"
        ></path>

        <path
          d="M68.56 18.48c1.34 0 2.74-.09 4.05.09c2.27.32 4.18-.39 6.41-.62c2.09-.22 4.18.2 6.28.37c2.18.18 4.37.1 6.56.02c2.27-.08 4.54.13 6.83.13"
          opacity=".77"
        ></path>

        <path
          d="M44.58 18.48c1.96 0 3.89.37 5.85.23c.66-.05 1.32-.14 1.99-.17c1.33-.07 2.67.23 3.98.08c.87-.1 1.7-.14 2.58-.14"
          opacity=".77"
        ></path>

        <path
          d="M45.52 41.87c.96 0 1.89.04 2.83.11c1.68.12 3.24-.64 4.87-.81c2.05-.21 4.07.45 6.1.75c2.01.3 4.05.12 6.07 0c.92-.06 1.88-.14 2.8-.12c.99.02 1.93.33 2.92.32c1.27-.01 2.44-.57 3.69-.76c2.78-.43 5.55.97 8.36.78c.92-.06 1.81-.29 2.72-.38c1.12-.11 2.25-.01 3.37.09l4.98.45"
          opacity=".77"
        ></path>

        <path
          d="M45.52 65.26c.96 0 1.89.04 2.83.11c1.68.12 3.24-.64 4.87-.81c2.05-.21 4.07.45 6.1.75c2.01.3 4.05.12 6.07 0c.92-.06 1.88-.14 2.8-.12c.99.02 1.93.33 2.92.32c1.27-.01 2.44-.57 3.69-.76c2.78-.43 5.55.97 8.36.78c.92-.06 1.81-.29 2.72-.38c1.12-.11 2.25-.01 3.37.09l4.98.45"
          opacity=".77"
        ></path>

        <path
          d="M58.39 88.62c.52.01.99-.11 1.5-.13c.74-.04 1.47.17 2.2.28c1.75.26 3.58.39 5.32.01c.98-.22 1.91-.59 2.91-.73c2.51-.36 4.99.76 7.54.75c2.2-.02 4.56-1.02 6.73-.44c1.42.37 2.88.28 4.38.28"
          opacity=".77"
        ></path>
      </g>

      <path
        d="M38.25 96.18v6.17h84.41c-1.64-3.69-4.64-6.17-8.07-6.17H38.25z"
        fill="#fcebcd"
      ></path>

      <ellipse
        cx="38.73"
        cy="108.83"
        rx="9.41"
        ry="12.65"
        fill="#f2bd72"
      ></ellipse>

      <path
        d="M45.71 108.17c0 5.33-3.34 8.35-6.92 9.33c-4.61 1.26-6.53.16-6.53.16V98.68s3.25-.82 6.72.16c3.54.99 6.73 4 6.73 9.33z"
        fill="#784d30"
      ></path>

      <ellipse
        cx="33.48"
        cy="108.17"
        rx="6.72"
        ry="9.65"
        fill="#784d30"
      ></ellipse>

      <ellipse
        cx="33.48"
        cy="108.18"
        rx="6.72"
        ry="9.65"
        fill="#784d30"
      ></ellipse>

      <ellipse
        cx="24.86"
        cy="108.18"
        rx="4.46"
        ry="4.5"
        fill="#ba793e"
      ></ellipse>

      <path
        d="M33.02 105.44c1.27.39 2.82 3.08.18 5.66c-.67.65.02 2.09.48 3.3c.58 1.54 1 2.37 2.34 1.45c1.8-1.22 3.51-4.71 3.51-7.67c0-4.79-2.71-8.68-6.05-8.68c-1.72 0-3.06.55-4.19 2.88c-.5 1.04-.55 2.37 1.04 2.53c0 .01 1.78.26 2.69.53z"
        fill="#ba793e"
      ></path>

      <ellipse
        cx="22.34"
        cy="20.09"
        rx="10.09"
        ry="13.57"
        fill="#f2bd72"
      ></ellipse>

      <g>
        <path
          d="M29.32 19.43c0 5.33-3.34 8.35-6.92 9.33c-4.61 1.26-6.53.16-6.53.16V9.94s3.25-.82 6.72.16c3.53.98 6.73 4 6.73 9.33z"
          fill="#784d30"
        ></path>

        <ellipse
          cx="17.09"
          cy="19.43"
          rx="6.72"
          ry="9.65"
          fill="#784d30"
        ></ellipse>

        <ellipse
          cx="17.09"
          cy="19.44"
          rx="6.72"
          ry="9.65"
          fill="#784d30"
        ></ellipse>

        <ellipse
          cx="8.46"
          cy="19.44"
          rx="4.46"
          ry="4.5"
          fill="#ba793e"
        ></ellipse>

        <path
          d="M16.62 16.7c1.27.39 2.82 3.08.18 5.66c-.67.65.02 2.09.48 3.3c.58 1.54 1 2.37 2.34 1.45c1.8-1.22 3.51-4.71 3.51-7.67c0-4.79-2.71-8.68-6.05-8.68c-1.72 0-3.06.55-4.19 2.88c-.5 1.04-.55 2.37 1.04 2.53c0 .01 1.79.25 2.69.53z"
          fill="#ba793e"
        ></path>
      </g>
    </svg>
  );
}
