import React, { ReactNode } from "react";
import { Box, styled, Typography } from "@mui/material";
import { customTheme } from "../styles";
import { Line, LineChart, XAxis, YAxis } from "recharts";
import { formatNumber, trunc } from "@cosmic-lab/prop-shop-sdk";

export type FundOverviewProps = {
  title: string;
  investors: number;
  aum: number;
  data: number[];
};

export function FundOverviewCard({
  title,
  investors,
  aum,
  data,
}: FundOverviewProps) {
  const roi = ((data[data.length - 1] - data[0]) / data[0]) * 100;
  const drawdown = Math.min(...data.map((d) => (d - data[0]) / data[0]));
  const _data = data.map((d) => ({ y: d }));
  return (
    <Container>
      <Header title={title} investors={investors} />
      <Box
        sx={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 1,
        }}
      >
        <LineChart width={350} height={200} data={_data} compact>
          <Line
            type="monotone"
            dataKey="y"
            stroke={roi > 0 ? customTheme.success : customTheme.error}
            strokeWidth={5}
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
            <Typography
              variant="h2"
              sx={{ color: roi > 0 ? customTheme.success : customTheme.error }}
            >
              {formatNumber(trunc(roi, 2))}%
            </Typography>
          </TH>
        </TableRow>
        <TableRow hover>
          <TH>
            <Typography variant="body1">Drawdown</Typography>
          </TH>
          <TH>
            <Typography variant="body1">{trunc(drawdown, 2)}%</Typography>
          </TH>
        </TableRow>
        <TableRow hover>
          <TH>
            <Typography variant="body1">AUM</Typography>
          </TH>
          <TH>
            <Typography variant="body1">
              ${formatNumber(trunc(aum, 2))}
            </Typography>
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
          <Typography variant="body1">
            {formatNumber(investors)} investors
          </Typography>
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
