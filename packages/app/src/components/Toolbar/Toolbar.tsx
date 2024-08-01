import React from "react";
import { AppBar, Box, Toolbar as MuiToolbar, Typography } from "@mui/material";
import { TOOLBAR_HEIGHT } from "../../constants";
import { WalletButton } from "../Buttons";
import { customTheme } from "../../styles";
import { PropShopIcon } from "../Icons";
import { SearchBar } from "./SearchBar";
import {
  driftVaults,
  PropShopClient,
  Searchable,
} from "@cosmic-lab/prop-shop-sdk";
import { FundDialog } from "../../pages";
import { PublicKey } from "@solana/web3.js";

export function Toolbar({ client }: { client: PropShopClient | undefined }) {
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
            width: "70%",
            bgcolor: customTheme.dark,
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
            <PropShopIcon size={70} />
            <Typography variant="h2">Prop Shop</Typography>
          </Box>

          <Box
            sx={{
              width: "25%",
            }}
          >
            <SearchBar
              search={searchInput}
              changeSearch={changeSearchInput}
              placeholder="My vaults"
              options={vaults}
              show={showSearch}
              setShow={setShowSearch}
              onClick={clickSearchItem}
            />
          </Box>

          <Box
            sx={{
              display: "flex",
              justifyContent: "right",
              width: "20%",
              height: "100%",
              p: 1,
            }}
          >
            <WalletButton />
          </Box>
        </MuiToolbar>
      </AppBar>
    </>
  );
}
