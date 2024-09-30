import React from 'react';
import {Box, Typography} from '@mui/material';
import {PropShopClient} from '@cosmic-lab/prop-shop-sdk';
import {ActionButton} from '../../components';
import {NewFundDialog} from './NewFundDialog';
import {customTheme} from "../../styles";

// todo: fetch vaults and sort by criteria using PropShopClient
export function NewFund({client}: { client: PropShopClient }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <NewFundDialog
        client={client}
        open={open}
        onClose={() => setOpen(false)}
      />
      <Box
        sx={{
          width: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 5
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'left',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 1
          }}
        >
          <Typography variant="h2">
            Beat the market.
          </Typography>
          <Typography variant="h2">
            Rapidly scale your capital.
          </Typography>
          <Typography variant="h2">
            Profit share with investors.
          </Typography>
        </Box>
        <Box
          sx={{
            width: '35%',
            height: '130px',
          }}
        >
          <ActionButton onClick={() => setOpen(true)}>
            <Typography variant="h3" sx={{color: customTheme.light}}>
              Create a Fund
            </Typography>
          </ActionButton>
        </Box>
      </Box>
    </>
  );
}
