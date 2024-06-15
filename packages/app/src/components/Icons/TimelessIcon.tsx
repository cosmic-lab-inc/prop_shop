import React from "react";
import { customTheme } from "../../styles";

type IconProps = {
  color?: string;
  size?: number | string;
};

export function TimelessIcon({ color, size }: IconProps) {
  return (
    <svg
      width={size ?? "800px"}
      height={size ?? "800px"}
      viewBox="-6 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g id="Group_35" data-name="Group 35" transform="translate(-257 -464)">
        <g id="Group_34" data-name="Group 34">
          <path
            id="Path_42"
            data-name="Path 42"
            d="M282,475c0,3-3.134,7-7,7s-7-4-7-7Z"
            fill={customTheme.red}
          />
          <path
            id="Path_43"
            data-name="Path 43"
            d="M282,501a7,7,0,0,0-14,0Z"
            fill={customTheme.red}
          />
        </g>
        <path
          id="Path_44"
          data-name="Path 44"
          d="M289,475v-1a2,2,0,0,1,2-2,2,2,0,0,0,2-2v-4a2,2,0,0,0-2-2H259a2,2,0,0,0-2,2v4a2,2,0,0,0,2,2,2,2,0,0,1,2,2v1a14.013,14.013,0,0,0,8.834,13A14.013,14.013,0,0,0,261,501v1a2,2,0,0,1-2,2,2,2,0,0,0-2,2v4a2,2,0,0,0,2,2h32a2,2,0,0,0,2-2v-4a2,2,0,0,0-2-2,2,2,0,0,1-2-2v-1a14.013,14.013,0,0,0-8.834-13A14.013,14.013,0,0,0,289,475Zm-30-9h32l0,4H259Zm32,44H259v-4h32Zm-4-9v1a3.959,3.959,0,0,0,.556,2H262.444a3.959,3.959,0,0,0,.556-2v-1a12.009,12.009,0,0,1,11-11.949V491h2v-1.949A12.009,12.009,0,0,1,287,501Zm-11-14.051V485h-2v1.949A12.009,12.009,0,0,1,263,475v-1a3.959,3.959,0,0,0-.556-2h25.112a3.959,3.959,0,0,0-.556,2v1A12.009,12.009,0,0,1,276,486.949Z"
          fill={color ?? "#303033"}
        />
      </g>
    </svg>
  );
}
