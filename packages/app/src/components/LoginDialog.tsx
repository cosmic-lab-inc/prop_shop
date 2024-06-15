import * as React from "react";
import {
  Avatar,
  Box,
  Dialog,
  IconButton,
  styled,
  Typography,
} from "@mui/material";
import "../styles/globals.css";
import { observer } from "mobx-react";
import { customTheme } from "../styles";
import { useWallet } from "@solana/wallet-adapter-react";
import { EpochClient } from "@cosmic-lab/epoch-sdk";
import { ActionButton, WalletButton } from ".";

const Container = styled("div")(({ theme }) => ({
  [theme.breakpoints.up("md")]: {
    borderRadius: "3px",
  },
  [theme.breakpoints.down("md")]: {
    borderRadius: "0px",
  },
  backgroundColor: customTheme.dark,
  width: "100%",
  height: "100%",
  padding: "40px 0px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
}));

const BrandWrapper = styled("div")`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-bottom: 30px;
`;

const BrandNameContainer = styled("div")`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const LoginDialog = observer(({ open }: { open: boolean }) => {
  const wallet = useWallet();

  async function handleConnect() {
    const signer = EpochClient.walletAdapterToAsyncSigner(wallet);
    const user = await EpochClient.instance.connect(signer);
    console.debug("connected:", user);
  }

  return (
    <>
      <Dialog
        maxWidth="xs"
        fullWidth
        scroll="paper"
        open={open}
        PaperProps={{
          style: {
            background: "transparent",
            borderRadius: "3px",
            border: `2px solid ${customTheme.grey}`,
          },
        }}
        sx={{
          background: customTheme.dark,
        }}
      >
        <Container>
          <BrandWrapper>
            <IconButton>
              <Avatar
                sx={{ width: "15vh", height: "15vh" }}
                alt="Logo"
                src="https://cosmic-lab-inc.github.io/logo/epoch_logo.png"
              />
            </IconButton>
            <BrandNameContainer>
              <Typography variant="h1">EPOCH</Typography>
            </BrandNameContainer>
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                width: "50%",
                height: "70px",
                textAlign: "center",
                m: 2,
              }}
            >
              <Typography variant="body1" sx={{ fontSize: 20 }}>
                Connect, log in or sign up, and start exploring!
              </Typography>
            </Box>
          </BrandWrapper>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              width: "50%",
              height: "70px",
            }}
          >
            {wallet.connected ? (
              <ActionButton onClick={() => handleConnect()}>
                Log In
              </ActionButton>
            ) : (
              <WalletButton />
            )}
          </Box>
        </Container>
      </Dialog>
    </>
  );
});
