import React from 'react';
import {AppBar, Box, Toolbar as MuiToolbar, Typography} from '@mui/material';
import {TOOLBAR_HEIGHT} from '../../constants';
import {WalletButton} from '../Buttons';
import {customTheme} from '../../styles';
import {SearchBar} from '../SearchBar';
import {FundOverview, OrFilterFunds, PropShopClient, Searchable,} from '@cosmic-lab/prop-shop-sdk';
import {FundDialog} from '../../pages';
import {observer} from 'mobx-react';
import {PropShopIcon} from '../Icons';

export const Toolbar = observer(
  ({client}: { client: PropShopClient | undefined }) => {
    const [searchInput, setSearchInput] = React.useState('');
    const [showSearch, setShowSearch] = React.useState(false);
    const [funds, setFunds] = React.useState<Searchable<FundOverview>[]>(
      []
    );
    const [dialogFund, setDialogFund] = React.useState<FundOverview | undefined>(
      undefined
    );
    const [openDialog, setOpenDialog] = React.useState<boolean>(false);

    React.useEffect(() => {
      if (!client) {
        setFunds([]);
        return;
      }
      const funds = OrFilterFunds({
        key: client.publicKey,
        funds: client.fundOverviews,
        managed: true,
        invested: true,
      }).map((fund) => {
        return {
          title: fund.title,
          data: fund,
        } as Searchable<FundOverview>;
      });
      setFunds(funds);
    }, [client, client?.fundOverviews]);

    const changeSearchInput = (input: string) => {
      setSearchInput(input.toLowerCase());
    };

    const clickSearchItem = (value: Searchable<FundOverview>) => {
      setDialogFund(value.data);
      setShowSearch(false);
      setSearchInput('');
      setOpenDialog(true);
    };

    return (
      <>
        {client && dialogFund && (
          <FundDialog
            client={client}
            fund={dialogFund}
            open={openDialog}
            onClose={() => setOpenDialog(false)}
          />
        )}
        <AppBar
          position="fixed"
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            boxShadow: 'none',
            height: TOOLBAR_HEIGHT,
          }}
        >
          <MuiToolbar
            disableGutters
            sx={{
              p: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexDirection: 'row',
              height: TOOLBAR_HEIGHT,
              width: '80%',
              bgcolor: customTheme.light,
              gap: 2,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'left',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <PropShopIcon size={60}/>
              <Box
                sx={{
                  gap: 0,
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'left',
                  alignItems: 'center',
                }}
              >
                <Typography
                  variant="h2"
                  sx={{
                    fontFamily: customTheme.font.heavy,
                    color: customTheme.dark,
                  }}
                >
                  PROP
                </Typography>
                <Typography
                  variant="h2"
                  sx={{
                    fontFamily: customTheme.font.heavy,
                    color: customTheme.dark,
                  }}
                >
                  SHOP
                </Typography>
              </Box>
            </Box>

            <Box
              sx={{
                width: '25%',
              }}
            >
              <SearchBar
                search={searchInput}
                changeSearch={changeSearchInput}
                placeholder="Search your funds"
                options={funds}
                show={showSearch}
                setShow={setShowSearch}
                onClick={clickSearchItem}
              />
            </Box>

            <Box
              sx={{
                display: 'flex',
                width: '20%',
                height: '100%',
                p: 1,
              }}
            >
              <WalletButton client={client}/>
            </Box>
          </MuiToolbar>
        </AppBar>
      </>
    );
  }
);
