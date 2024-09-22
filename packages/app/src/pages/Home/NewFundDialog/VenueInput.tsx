import {Venue} from '@cosmic-lab/prop-shop-sdk';
import {ToggleButton, ToggleButtonGroup, Typography} from '@mui/material';
import React from 'react';
import {DriftIcon, PhoenixIcon} from '../../../components';

type VenueOption = {
  venue: Venue;
  icon: React.ReactNode;
};

const venues: VenueOption[] = [
  {
    venue: Venue.Drift,
    icon: <DriftIcon/>,
  },
  {
    venue: Venue.Phoenix,
    icon: <PhoenixIcon/>,
  },
];

export function VenueInput({
                             value,
                             onChange,
                           }: {
  defaultValue: Venue;
  value: Venue;
  onChange: (value: Venue) => void;
}) {
  const handleChange = (
    _event: React.MouseEvent<HTMLElement>,
    newValue: Venue | null
  ) => {
    if (newValue !== null) {
      console.log('update:', Venue[newValue]);
      onChange(newValue);
    }
  };

  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      // onChange={handleChange}
      aria-label="theme selection"
      sx={{
        bgcolor: 'transparent',
        borderRadius: 1,
        '& .MuiToggleButtonGroup-grouped': {
          border: 0,
          '&:not(:first-of-type)': {
            borderRadius: 1,
          },
          '&:first-of-type': {
            borderRadius: 1,
          },
        },
      }}
    >
      {venues.map(({venue, icon}) => (
        <ToggleButton
          key={venue.toString()}
          value={venue}
          aria-label={venue.toString()}
          onClick={handleChange}
          sx={{
            gap: 1,
            p: 1,
            m: 1,
            bgcolor: 'transparent',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-around',
          }}
        >
          {icon}
          <Typography variant="body1">{Venue[venue]}</Typography>
        </ToggleButton>
      ))}
      ;
    </ToggleButtonGroup>
  );
}