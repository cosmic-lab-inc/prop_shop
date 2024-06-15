import * as React from "react";
import { Box, Grid } from "@mui/material";
import { ExampleRequest, ExampleResponse, ProfileDisplay } from ".";
import { EpochClient } from "@cosmic-lab/epoch-sdk";
import { observer } from "mobx-react";
import { LoginDialog } from "../../components";

// todo: once token is live, use Jup to trade tokens
export const Demo = observer(() => {
  const epochUser = EpochClient.instance.epochUser;
  const [key, setKey] = React.useState<string>("");
  const [owner, setOwner] = React.useState<string>(
    "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH",
  );
  const [slot, setSlot] = React.useState<number>(218238180);
  const [discrim, setDiscrim] = React.useState<string>("User");
  const [req, setReq] = React.useState<Record<string, any>>({
    key: null,
    owner,
    slot,
    discriminant: discrim,
  });
  const [res, setRes] = React.useState<Object>({});

  React.useEffect(() => {
    const newReq = req;
    newReq["key"] = key ? key : null;
    newReq["owner"] = owner ? owner : null;
    newReq["slot"] = slot;
    newReq["discriminant"] = discrim;
    setReq(newReq);
  }, [key, owner, slot, discrim]);

  if (!epochUser) {
    return (
      <>
        <LoginDialog open={!epochUser} />
      </>
    );
  }

  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        flexDirection: "column",
      }}
    >
      <ProfileDisplay epochUser={epochUser} />

      <Grid
        container
        sx={{
          width: "100%",
          display: "flex",
          flexDirection: "row",
          gap: 1,
          height: "630px",
          maxHeight: "630px",
        }}
      >
        <Grid
          sx={{
            width: "50%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            maxHeight: "inherit",
          }}
        >
          <ExampleRequest responseCallback={setRes} />
        </Grid>

        <Grid
          sx={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            maxHeight: "inherit",
            height: "630px",
          }}
        >
          <ExampleResponse response={res} />
        </Grid>
      </Grid>
    </Box>
  );
});
