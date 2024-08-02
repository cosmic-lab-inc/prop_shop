import React, { useMemo, useState } from "react";
import {
  FileCopy as CopyIcon,
  LinkOff as DisconnectIcon,
  SwapHoriz as SwitchIcon,
} from "@mui/icons-material";
import type { ButtonProps, Theme } from "@mui/material";
import { Fade, ListItemIcon, Menu, MenuItem, styled } from "@mui/material";
import { useWalletMultiButton } from "@solana/wallet-adapter-base-ui";
import { BaseWalletConnectionButton } from "./BaseWalletConnectionButton";
import { useWalletDialog } from "@solana/wallet-adapter-material-ui";
import { customTheme } from "../../../styles";
import Box from "@mui/material/Box";
import { darken } from "@mui/system/colorManipulator";

const StyledMenu = styled(Menu)(({ theme }: { theme: Theme }) => ({
  "& .MuiList-root": {
    padding: 0,
  },
  "& .MuiListItemIcon-root": {
    width: "unset",
    "& .MuiSvgIcon-root": {
      width: 20,
      color: customTheme.light,
    },
  },
  "& .MuiMenu-paper": {
    width: "inherit",
    position: "absolute",
  },
}));

const WalletActionMenuItem = styled(MenuItem)(
  ({ theme }: { theme: Theme }) => ({
    width: "100%",
    backgroundColor: customTheme.grey,
    "&:hover": {
      backgroundColor: customTheme.grey2,
    },
  }),
);

type Props = ButtonProps & {
  labels: Omit<
    {
      [TButtonState in ReturnType<
        typeof useWalletMultiButton
      >["buttonState"]]: string;
    },
    "connected" | "disconnecting"
  > & {
    "copy-address": string;
    "change-wallet": string;
    disconnect: string;
  };
};

export function BaseWalletMultiButton({ children, labels, ...props }: Props) {
  const { setOpen: setModalVisible } = useWalletDialog();
  const anchorRef = React.createRef<HTMLButtonElement>();
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    buttonState,
    onConnect,
    onDisconnect,
    publicKey,
    walletIcon,
    walletName,
  } = useWalletMultiButton({
    onSelectWallet() {
      setModalVisible(true);
    },
  });
  const content = useMemo(() => {
    if (children) {
      return children;
    } else if (publicKey) {
      const base58 = publicKey.toBase58();
      return base58.slice(0, 4) + ".." + base58.slice(-4);
    } else if (buttonState === "connecting" || buttonState === "has-wallet") {
      return labels[buttonState];
    } else {
      return labels["no-wallet"];
    }
  }, [buttonState, children, labels, publicKey]);
  return (
    <Box
      sx={{
        width: "100%",
      }}
    >
      <BaseWalletConnectionButton
        fullWidth
        variant="contained"
        aria-controls="wallet-menu"
        aria-haspopup="true"
        onClick={() => {
          switch (buttonState) {
            case "no-wallet":
              setModalVisible(true);
              break;
            case "has-wallet":
              if (onConnect) {
                onConnect();
              }
              break;
            case "connected":
              setMenuOpen(true);
              break;
          }
        }}
        ref={anchorRef}
        walletIcon={walletIcon}
        walletName={walletName}
        sx={{
          width: "100%",
          bgcolor: customTheme.secondary,
          borderRadius: "10px",
          "&:hover": {
            bgcolor: darken(customTheme.secondary, 0.2),
          },
        }}
      >
        {content}
      </BaseWalletConnectionButton>
      <StyledMenu
        id="wallet-menu"
        anchorEl={
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          () => anchorRef.current!
        }
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        marginThreshold={0}
        TransitionComponent={Fade}
        transitionDuration={250}
        keepMounted
      >
        {/*<Collapse in={menuOpen}>*/}
        {publicKey && (
          <WalletActionMenuItem
            onClick={async () => {
              setMenuOpen(false);
              await navigator.clipboard.writeText(publicKey.toBase58());
            }}
          >
            <ListItemIcon>
              <CopyIcon />
            </ListItemIcon>
            {labels["copy-address"]}
          </WalletActionMenuItem>
        )}
        <WalletActionMenuItem
          onClick={() => {
            setMenuOpen(false);
            setModalVisible(true);
          }}
        >
          <ListItemIcon>
            <SwitchIcon />
          </ListItemIcon>
          {labels["change-wallet"]}
        </WalletActionMenuItem>
        {onDisconnect && (
          <WalletActionMenuItem
            onClick={() => {
              setMenuOpen(false);
              onDisconnect();
            }}
          >
            <ListItemIcon>
              <DisconnectIcon />
            </ListItemIcon>
            {labels["disconnect"]}
          </WalletActionMenuItem>
        )}
        {/*</Collapse>*/}
      </StyledMenu>
    </Box>
  );
}
