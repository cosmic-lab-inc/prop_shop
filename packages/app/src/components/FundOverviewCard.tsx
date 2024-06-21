import React, { ReactNode } from "react";
import { Box, styled, Typography } from "@mui/material";
import { customTheme } from "../styles";
import { Line, LineChart, XAxis, YAxis } from "recharts";

export type FundOverviewProps = {
  title: string;
  investors: number;
  roi: number;
  drawdown: number;
  aum: number;
  data: number[];
};

type Data = {
  uv: number;
};

export function FundOverviewCard({
  title,
  investors,
  roi,
  drawdown,
  aum,
  data,
}: FundOverviewProps) {
  const _data = data.map((d) => ({ uv: d }));
  return (
    <Container>
      <Header title={title} investors={investors} />
      <Box
        sx={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          p: 1,
        }}
      >
        <LineChart width={400} height={200} data={_data} compact>
          <Line
            type="monotone"
            dataKey="uv"
            stroke={customTheme.secondary}
            dot={{
              r: 0,
            }}
          />
          <XAxis dataKey="name" />
          <YAxis />
        </LineChart>
      </Box>
      <tbody style={{ width: "100%" }}>
        <TableRow hover>
          <TH>
            <Typography variant="body1">ROI</Typography>
          </TH>
          <TH>
            <Typography variant="body1">{roi}%</Typography>
          </TH>
        </TableRow>
        <TableRow hover>
          <TH>
            <Typography variant="body1">Drawdown</Typography>
          </TH>
          <TH>
            <Typography variant="body1">{drawdown}%</Typography>
          </TH>
        </TableRow>
        <TableRow hover>
          <TH>
            <Typography variant="body1">AUM</Typography>
          </TH>
          <TH>
            <Typography variant="body1">${aum}</Typography>
          </TH>
        </TableRow>
      </tbody>
    </Container>
  );
}

function Container({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        width: "33.3%",
        height: "400px",
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

function Header({ title, investors }: { title: string; investors: number }) {
  return (
    <thead style={{ width: "100%" }}>
      <TableRow
        header
        style={{
          paddingTop: "20px",
          paddingBottom: "20px",
        }}
      >
        <TH>
          <Typography variant="h2">{title}</Typography>
        </TH>
        <TH>
          <Typography variant="body1">{investors} investors</Typography>
        </TH>
      </TableRow>
    </thead>
  );
}

const TH = styled("th")({
  display: "flex",
  flexDirection: "row",
});

const TableRow = styled("tr")<{ hover?: boolean; header?: boolean }>(
  ({ theme, hover, header }) => ({
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingLeft: "15px",
    paddingRight: "15px",
    "&:hover": {
      backgroundColor: `${hover ? customTheme.secondary : "transparent"}`,
    },

    ...(header && {
      borderBottom: `1px solid ${customTheme.light}`,
      borderBottomRightRadius: "0",
      borderBottomLeftRadius: "0",
    }),
  }),
);
