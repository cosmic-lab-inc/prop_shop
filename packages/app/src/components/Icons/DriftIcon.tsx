import React from 'react';
import {Box} from '@mui/material';

type IconProps = {
  size?: number | string;
};

export function DriftIcon({size}: IconProps) {
  const _size = size ?? 40;
  return (
    <Box
      component="img"
      sx={{
        width: _size,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        pl: '2px',
      }}
      alt="Drift"
      src={'/src/assets/drift.png'}
    />
  );
}
