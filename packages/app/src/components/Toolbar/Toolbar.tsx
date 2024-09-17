import React from "react";
import {AppBar, Box, Toolbar as MuiToolbar, Typography} from "@mui/material";
import {TOOLBAR_HEIGHT} from "../../constants";
import {WalletButton} from "../Buttons";
import {customTheme} from "../../styles";
import {SearchBar} from "../SearchBar";
import {driftVaults, PropShopClient, Searchable,} from "@cosmic-lab/prop-shop-sdk";
import {FundDialog} from "../../pages";
import {PublicKey} from "@solana/web3.js";
import {observer} from "mobx-react";
import {PropShopIcon} from "../Icons/PropShopIcon";

export const Toolbar = observer(
  ({client}: { client: PropShopClient | undefined }) => {
    const [searchInput, setSearchInput] = React.useState("");
    const [showSearch, setShowSearch] = React.useState(false);
    const [vaults, setVaults] = React.useState<Searchable<driftVaults.Vault>[]>(
      [],
    );
    const [dialogVault, setDialogVault] = React.useState<PublicKey | undefined>(
      undefined,
    );
    const [openDialog, setOpenDialog] = React.useState<boolean>(false);

    React.useEffect(() => {
      if (!client) {
        setVaults([]);
        return;
      }
      const managedVaults = client
        .vaults({
          managed: true,
        })
        .map((data) => {
          const entry: Searchable<driftVaults.Vault> = {
            title: driftVaults.decodeName(data.data.name),
            data: data.data,
          };
          return entry;
        });
      const investedVaults = client
        .vaults({
          invested: true,
        })
        .map((data) => {
          const entry: Searchable<driftVaults.Vault> = {
            title: driftVaults.decodeName(data.data.name),
            data: data.data,
          };
          return entry;
        });
      setVaults([...managedVaults, ...investedVaults]);
    }, [client, client?.vaults]);

    const changeSearchInput = (input: string) => {
      setSearchInput(input.toLowerCase());
    };

    const clickSearchItem = (value: Searchable<driftVaults.Vault>) => {
      setDialogVault(value.data.pubkey);
      setShowSearch(false);
      setSearchInput("");
      setOpenDialog(true);
    };

    return (
      <>
        {client && dialogVault && (
          <FundDialog
            client={client}
            vault={dialogVault}
            open={openDialog}
            onClose={() => setOpenDialog(false)}
          />
        )}
        <AppBar
          position="fixed"
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            boxShadow: "none",
            height: TOOLBAR_HEIGHT,
          }}
        >
          <MuiToolbar
            disableGutters
            sx={{
              p: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexDirection: "row",
              height: TOOLBAR_HEIGHT,
              width: "80%",
              bgcolor: customTheme.light,
              gap: 2,
            }}
          >
            <Box
              sx={{
                display: "flex",
                flexDirection: "row",
                justifyContent: "left",
                alignItems: "center",
                gap: 2,
              }}
            >
              <PropShopIcon size={60}/>
              <Box
                sx={{
                  gap: 0,
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "left",
                  alignItems: "center",
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
                width: "25%",
              }}
            >
              <SearchBar
                search={searchInput}
                changeSearch={changeSearchInput}
                placeholder="Search your vaults"
                options={vaults}
                show={showSearch}
                setShow={setShowSearch}
                onClick={clickSearchItem}
              />
            </Box>

            <Box
              sx={{
                display: "flex",
                width: "20%",
                height: "100%",
                p: 1,
              }}
            >
              <WalletButton client={client}/>
            </Box>
          </MuiToolbar>
        </AppBar>
      </>
    );
  },
);
