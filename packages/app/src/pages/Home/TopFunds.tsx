import React, { ReactNode } from "react";
import { customTheme } from "../../styles";
import { Box, styled, Typography } from "@mui/material";
import { HistorianIcon } from "../../components";

export function TopFunds() {
  return (
    <Box
      sx={{
        width: "70%",
        bgcolor: customTheme.light,
        display: "flex",
        alignItems: "center",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          borderRadius: "3px",
          alignItems: "center",
          flexDirection: "row",
        }}
      >
        <Typography variant="h2" sx={{ color: customTheme.dark }}>
          Top Funds by ROI
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
        <FundOverviewCard />
        <FundOverviewCard />
        <FundOverviewCard />
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

function FundOverviewCard() {
  return (
    <Container>
      <Header
        icon={<HistorianIcon size={35} color={customTheme.secondary} />}
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

const TableRow = styled("tr")<{ hover?: boolean; header?: boolean }>(
  ({ theme, hover, header }) => ({
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    padding: "20px",
    borderRadius: "3px",
    "&:hover": {
      backgroundColor: `${hover ? customTheme.secondary : "transparent"}`,
    },

    ...(header && {
      borderBottom: `1px solid ${customTheme.dark}`,
      borderBottomRightRadius: "0",
      borderBottomLeftRadius: "0",
    }),
  }),
);
