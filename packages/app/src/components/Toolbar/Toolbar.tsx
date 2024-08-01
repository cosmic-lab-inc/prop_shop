import React from "react";
import { AppBar, Box, Toolbar as MuiToolbar, Typography } from "@mui/material";
import { TOOLBAR_HEIGHT } from "../../constants";
import { WalletButton } from "../Buttons";
import { customTheme } from "../../styles";
import { PropShopIcon } from "../Icons";
import { SearchBar } from "./SearchBar";
import {
  FundOverview,
  PropShopClient,
  Searchable,
} from "@cosmic-lab/prop-shop-sdk";

export function Toolbar({ client }: { client: PropShopClient | undefined }) {
  const [searchInput, setSearchInput] = React.useState("");
  const handleSearchInput = (input: string) => {
    setSearchInput(input.toLowerCase());
  };
  const [showSearch, setShowSearch] = React.useState(false);

  const [funds, setFunds] = React.useState<Searchable<FundOverview>[]>([]);

  React.useEffect(() => {
    if (!client) {
      setFunds([]);
      return;
    }
    const _funds: Searchable<FundOverview>[] = client.fundOverviews.map(
      (data) => {
        const entry: Searchable<FundOverview> = {
          title: data.title,
          data,
        };
        return entry;
      },
    );
    setFunds(_funds);
  }, [client, client?.fundOverviews]);

  return (
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
            flexGrow: 1,
            gap: 2,
          }}
        >
          <PropShopIcon size={70} />
          <Typography variant="h2">Prop Shop</Typography>
        </Box>

        <SearchBar
          search={searchInput}
          changeSearch={handleSearchInput}
          placeholder="My vaults"
          show={showSearch}
          setShow={setShowSearch}
          options={funds}
        />

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
  );
}
