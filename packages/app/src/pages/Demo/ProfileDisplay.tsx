import { EpochClient, EpochUser } from "@cosmic-lab/epoch-sdk";
import { Box } from "@mui/material";
import { ProfileCard } from "./ProfileCard";
import * as React from "react";
import { observer } from "mobx-react";
import { AirdropIcon, IconButton, MinusIcon, PlusIcon } from "../../components";

export const ProfileDisplay = observer(
  ({ epochUser }: { epochUser: EpochUser }) => {
    async function handleAirdrop(): Promise<void> {
      if (!epochUser) {
        console.error("EpochUser undefined for airdrop");
        return;
      }
      await EpochClient.instance.airdrop(epochUser.vault);
    }

    return (
      <Box
        sx={{
          width: "50%",
          borderRadius: "3px",
          display: "flex",
          flexDirection: "row",
          flexGrow: 1,
          m: 1,
          ml: 0,
          gap: 1,
        }}
      >
        <ProfileCard epochUser={epochUser} />

        <Box
          sx={{
            borderRadius: "3px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
          }}
        >
          <IconButton
            component={AirdropIcon}
            iconSize={50}
            disabled={!epochUser}
            onClick={() => handleAirdrop()}
          />
          <IconButton component={PlusIcon} iconSize={50} disabled />
          <IconButton component={MinusIcon} iconSize={50} disabled />
        </Box>
      </Box>
    );
  },
);
