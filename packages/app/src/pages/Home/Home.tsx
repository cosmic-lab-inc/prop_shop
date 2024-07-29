import * as React from "react";
import { Box } from "@mui/material";
import { Funds } from "./Funds";
import { observer } from "mobx-react";
import { useClient } from "../../lib";
import { NewFund } from "./NewFund";

export const Home = observer(() => {
  const client = useClient();
  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {client && (
        <>
          <Funds client={client} />
          <NewFund client={client} />
        </>
      )}
    </Box>
  );
});
