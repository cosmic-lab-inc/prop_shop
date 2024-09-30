import * as React from 'react';
import {Box} from '@mui/material';
import {Funds} from './Funds';
import {observer} from 'mobx-react';
import {NewFund} from './NewFund';
import {PropShopClient} from '@cosmic-lab/prop-shop-sdk';

export const Home = observer(({client}: { client: PropShopClient }) => {
  return (
    <Box
      sx={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <Funds client={client}/>
      <NewFund client={client}/>
    </Box>
  );
});
