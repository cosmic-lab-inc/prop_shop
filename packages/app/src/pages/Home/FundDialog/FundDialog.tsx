import React from 'react';
import {Dialog} from '@mui/material';
import {InvestorStats} from './InvestorStats';
import {FundOverview, PropShopClient} from '@cosmic-lab/prop-shop-sdk';
import {customTheme} from '../../../styles';
import Box from '@mui/material/Box';
import {observer} from 'mobx-react';

export const FundDialog = observer(
  ({
     client,
     fund,
     open,
     onClose,
   }: {
    client: PropShopClient;
    fund: FundOverview;
    open: boolean;
    onClose: () => void;
  }) => {
    React.useEffect(() => {
      async function run() {
        if (open) {
          await client.createWithdrawTimer({
            vault: fund.vault,
            venue: fund.venue
          });
          await client.fetchEquityInVault({
            vault: fund.vault,
            venue: fund.venue
          });
        }
      }

      run();
    }, [open]);

    return (
      <>
        <Dialog
          maxWidth="sm"
          fullWidth={true}
          fullScreen={false}
          scroll="paper"
          open={open}
          onClose={onClose}
          PaperProps={{
            style: {
              borderRadius: '10px',
            },
          }}
          sx={{
            bgcolor: 'transparent',
          }}
        >
          <Box
            sx={{
              width: '100%',
              height: '100%',
              flexDirection: 'column',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: customTheme.grey,
            }}
          >
            <InvestorStats client={client} fund={fund}/>
          </Box>
        </Dialog>
      </>
    );
  }
);
