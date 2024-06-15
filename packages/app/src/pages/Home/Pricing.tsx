import React, { ReactNode } from "react";
import { customTheme } from "../../styles";
import { Box, styled, Typography } from "@mui/material";
import {
  ArrowsIcon,
  DataMinerIcon,
  HistorianIcon,
  TimelessIcon,
} from "../../components";

export function Pricing() {
  return (
    <Box
      sx={{
        width: "90%",
        bgcolor: customTheme.light,
        display: "flex",
        p: 3,
        mt: 10,
        mb: 10,
        borderRadius: "3px",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          mb: 2,
          borderRadius: "3px",
          alignItems: "center",
          flexDirection: "row",
        }}
      >
        <Typography variant="h2" sx={{ color: customTheme.dark }}>
          Purchase what you need, or sell what you don't.
        </Typography>
      </Box>
      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          gap: 2,
          borderRadius: "3px",
          alignItems: "center",
          flexDirection: "row",
        }}
      >
        <HistorianTier />
        <DataMinerTier />
        <TimelessTier />
      </Box>
      <Box
        sx={{
          width: "100%",
          display: "flex",
          alignItems: "flex-start",
          flexDirection: "column",
          mt: 1,
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <ArrowsIcon />
          <Typography variant="h4" sx={{ color: customTheme.dark }}>
            Historical API credits are EPOCH tokens and can be bought on a DEX
            just like USDC.
          </Typography>
        </Box>
        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <ArrowsIcon />
          <Typography variant="h4" sx={{ color: customTheme.dark }}>
            If you need more credits than the base subscription, simply buy more
            from other users.
          </Typography>
        </Box>
        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <ArrowsIcon />
          <Typography variant="h4" sx={{ color: customTheme.dark }}>
            If you have unused credits you can sell them!
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

function Container({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        width: "33.3%",
        height: "100%",
        bgcolor: customTheme.dark,
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

function Header({
  icon,
  title,
  price,
}: {
  icon: ReactNode;
  title: string;
  price: number;
}) {
  return (
    <thead style={{ width: "100%" }}>
      <TableRow header>
        <th scope="col" style={{ display: "flex", flexDirection: "row" }}>
          <Box
            sx={{
              borderRadius: "3px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              pr: 1,
            }}
          >
            {icon}
          </Box>
          <Typography variant="h3" sx={{ ml: 1 }}>
            {title}
          </Typography>
        </th>
        <th scope="col" style={{ display: "flex", flexDirection: "row" }}>
          <Typography variant="h3">${price}</Typography>
          <Typography variant="body1" sx={{ pt: 1 }}>
            /mo
          </Typography>
        </th>
      </TableRow>
    </thead>
  );
}

function HistorianTier() {
  return (
    <Container>
      <Header
        icon={<HistorianIcon size={35} color={customTheme.red} />}
        title={"Historian"}
        price={0}
      />
      <tbody style={{ width: "100%" }}>
        <TableRow hover>
          <th scope="row">
            <Typography variant="body1">500 API credits</Typography>
          </th>
        </TableRow>
        <TableRow hover>
          <th scope="row">
            <Typography variant="body1">10 AI queries</Typography>
          </th>
        </TableRow>
      </tbody>
    </Container>
  );
}

function DataMinerTier() {
  return (
    <Container>
      <Header
        icon={<DataMinerIcon size={35} />}
        title={"Data Miner"}
        price={50}
      />
      <tbody style={{ width: "100%" }}>
        <TableRow hover>
          <th scope="row">
            <Typography variant="body1">5,000 API credits</Typography>
          </th>
        </TableRow>
        <TableRow hover>
          <th scope="row">
            <Typography variant="body1">100 AI queries</Typography>
          </th>
        </TableRow>
      </tbody>
    </Container>
  );
}

function TimelessTier() {
  return (
    <Container>
      <Header
        icon={<TimelessIcon size={35} color={customTheme.light} />}
        title={"Timeless"}
        price={500}
      />
      <tbody style={{ width: "100%" }}>
        <TableRow hover>
          <th scope="row">
            <Typography variant="body1">50,000 API credits</Typography>
          </th>
        </TableRow>
        <TableRow hover>
          <th scope="row">
            <Typography variant="body1">1,000 AI queries</Typography>
          </th>
        </TableRow>
      </tbody>
    </Container>
  );
}

const TableRow = styled("tr")<{ hover?: boolean; header?: boolean }>(
  ({ theme, hover, header }) => ({
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    padding: "20px",
    borderRadius: "3px",
    "&:hover": {
      backgroundColor: `${hover ? customTheme.rust : "transparent"}`,
    },

    ...(header && {
      borderBottom: `1px solid ${customTheme.dark}`,
      borderBottomRightRadius: "0",
      borderBottomLeftRadius: "0",
    }),
  }),
);
