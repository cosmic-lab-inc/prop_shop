import React, { ReactNode } from "react";
import {
  Box,
  IconButton as MuiIconButton,
  styled,
  Typography,
} from "@mui/material";
import { customTheme } from "../../../styles";
import { shortenAddress } from "@cosmic-lab/prop-shop-sdk";
import { observer } from "mobx-react";
import { ContentCopyOutlined } from "@mui/icons-material";
import {
  AirdropIcon,
  IconButton,
  MinusIcon,
  PlusIcon,
} from "../../../components";

function CopyButton({ text }: { text: string }) {
  function copy() {
    navigator.clipboard.writeText(text);
  }

  return (
    <MuiIconButton
      sx={{
        p: 0,
        color: "inherit",
      }}
      onClick={() => copy()}
    >
      <ContentCopyOutlined />
    </MuiIconButton>
  );
}

const Stats = observer(() => {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        bgcolor: customTheme.grey,
        borderRadius: "3px",
        width: "100%",
        p: 1,
      }}
    >
      <Container>
        <div style={{ width: "100%" }}>
          <TableRow hover>
            <Text>API KEY</Text>
            <TextIconWrapper text={"asdfasdfasdfas"} shorten />
          </TableRow>
          <TableRow hover>
            <Text>PROFILE</Text>
            <TextIconWrapper text={";ojh;ojh;ojh"} shorten />
          </TableRow>
          <TableRow hover>
            <Text>VAULT</Text>
            <TextIconWrapper text={"asdfjhasdf;ojh"} shorten />
          </TableRow>
          <TableRow hover>
            <Text>BALANCE</Text>
            <TextIconWrapper text={"129381"} />
          </TableRow>
        </div>
      </Container>
    </Box>
  );
});

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
    padding: "10px",
    borderRadius: "3px",
    color: customTheme.dark,
    "&:hover": {
      backgroundColor: `${hover ? customTheme.secondary : "transparent"}`,
      color: customTheme.light,
    },

    ...(header && {
      borderBottom: `1px solid ${customTheme.dark}`,
      borderBottomRightRadius: "0",
      borderBottomLeftRadius: "0",
    }),
  }),
);

// todo: take VaultDepositor as param
export const InvestorStats = observer(() => {
  return (
    <Box
      sx={{
        width: "100%",
        borderRadius: "3px",
        display: "flex",
        flexDirection: "row",
        flexGrow: 1,
        p: 1,
        gap: 1,
      }}
    >
      <Stats />

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
          disabled={false}
          onClick={() => console.log("clicked button")}
        />
        <IconButton component={PlusIcon} iconSize={50} disabled={false} />
        <IconButton component={MinusIcon} iconSize={50} disabled={false} />
      </Box>
    </Box>
  );
});
