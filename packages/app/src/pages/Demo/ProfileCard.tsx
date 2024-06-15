import * as React from "react";
import { ReactNode } from "react";
import { Box, IconButton, styled, Typography } from "@mui/material";
import { customTheme } from "../../styles";
import { EpochUser, shortenAddress } from "@cosmic-lab/epoch-sdk";
import { observer } from "mobx-react";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";

function CopyButton({ text }: { text: string }) {
  function copy() {
    navigator.clipboard.writeText(text);
  }

  return (
    <IconButton
      sx={{
        p: 0,
        color: "inherit",
      }}
      onClick={() => copy()}
    >
      <ContentCopyOutlinedIcon />
    </IconButton>
  );
}

export const ProfileCard = observer(
  ({ epochUser }: { epochUser: EpochUser }) => {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          bgcolor: customTheme.grey,
          borderRadius: "3px",
          width: "100%",
          // m: 1,
          p: 1,
        }}
      >
        <Container>
          <div style={{ width: "100%" }}>
            <TableRow hover>
              <div>
                <Text>API KEY</Text>
              </div>
              <TextIconWrapper text={epochUser.apiKey} shorten />
            </TableRow>
            <TableRow hover>
              <div>
                <Text>PROFILE</Text>
              </div>
              <TextIconWrapper text={epochUser.profile.toString()} shorten />
            </TableRow>
            <TableRow hover>
              <div>
                <Text>VAULT</Text>
              </div>
              <TextIconWrapper text={epochUser.vault.toString()} shorten />
            </TableRow>
            <TableRow hover>
              <div>
                <Text>BALANCE</Text>
              </div>
              <TextIconWrapper text={epochUser.balance.ui_amount.toString()} />
            </TableRow>
          </div>
        </Container>
      </Box>
    );
  },
);

function Container({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        flexGrow: 1,
        bgcolor: customTheme.light,
        borderRadius: "3px",
        display: "flex",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      {children}
    </Box>
  );
}

function Text({ children }: { children: ReactNode }) {
  return (
    <Typography
      variant="body1"
      sx={{ fontFamily: customTheme.font.titilliumBold }}
    >
      {children}
    </Typography>
  );
}

function TextIconWrapper({
  text,
  shorten,
}: {
  text: string;
  shorten?: boolean;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
      }}
    >
      <Text>{shorten ? shortenAddress(text) : text}</Text>
      <CopyButton text={text} />
    </Box>
  );
}

const TableRow = styled("div")<{ hover?: boolean; header?: boolean }>(
  ({ theme, hover, header }) => ({
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    padding: "15px",
    borderRadius: "3px",
    color: customTheme.dark,
    "&:hover": {
      backgroundColor: `${hover ? customTheme.rust : "transparent"}`,
      color: customTheme.light,
    },

    ...(header && {
      borderBottom: `1px solid ${customTheme.dark}`,
      borderBottomRightRadius: "0",
      borderBottomLeftRadius: "0",
    }),
  }),
);
