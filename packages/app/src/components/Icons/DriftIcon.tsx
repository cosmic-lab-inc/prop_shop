import React from 'react';
import {Box} from '@mui/material';

type IconProps = {
  size?: number | string;
};

export function DriftIcon({size}: IconProps) {
  const _size = size ?? 50;
  return (
    <Box
      component="img"
      sx={{
        height: _size,
        width: _size,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        pl: '2px',
      }}
      alt="Drift"
      src={new URL('/src/assets/drift.png', import.meta.url).href}
    />
  );
}
