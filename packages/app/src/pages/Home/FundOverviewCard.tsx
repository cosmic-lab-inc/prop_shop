import React, { ReactNode } from "react";
import { Box, styled, Typography } from "@mui/material";
import { customTheme } from "../../styles";
import { Line, LineChart, XAxis, YAxis } from "recharts";
import {
  formatNumber,
  FundOverview,
  truncateNumber,
  truncateString,
} from "@cosmic-lab/prop-shop-sdk";
import { FundDialog } from "./FundDialog";

function calcMaxDrawdown(values: number[]): number {
  let maxDrawdown = 0;
  let peak = values[0];

  for (const value of values) {
    if (value > peak) {
      peak = value;
    }
    const drawdown = ((value - peak) / peak) * 100;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}

export function FundOverviewCard({
  title,
  investors,
  aum,
  data,
}: FundOverview) {
  const roi = data[data.length - 1] - data[0];
  const drawdown = calcMaxDrawdown(data);
  const _data = data.map((d) => ({ y: d }));

  const [open, setOpen] = React.useState(false);
  const onClose = () => setOpen(false);
  const onOpen = () => setOpen(true);

  return (
    <>
      <FundDialog open={open} onClose={onClose} />
      <Container onClick={onOpen}>
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
              stroke={roi > 0 ? customTheme.secondary : customTheme.error}
              strokeWidth={5}
              dot={{
                r: 0,
              }}
            />
            <XAxis dataKey="name" hide />
            <YAxis hide />
          </LineChart>
        </Box>
        <Box
          sx={{
            width: "100%",
            flexDirection: "column",
            display: "flex",
          }}
        >
          <TableRow hover>
            <Typography variant="body1">ROI</Typography>
            <Typography
              variant="h3"
              sx={{
                color: roi > 0 ? customTheme.secondary : customTheme.error,
              }}
            >
              ${formatNumber(truncateNumber(roi, 2))}
            </Typography>
          </TableRow>
          <TableRow hover>
            <Typography variant="body1">Drawdown</Typography>
            <Typography variant="body1">
              {truncateNumber(drawdown, 2)}%
            </Typography>
          </TableRow>
          <TableRow hover>
            <Typography variant="body1">AUM</Typography>
            <Typography variant="body1">
              ${formatNumber(truncateNumber(aum, 2))}
            </Typography>
          </TableRow>
        </Box>
      </Container>
    </>
  );
}

function Container({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        width: "100%",
        height: "400px",
        bgcolor: customTheme.grey,
        borderRadius: "10px",
        border: `2px solid ${customTheme.light}`,
        display: "flex",
        alignItems: "center",
        flexDirection: "column",
      }}
      onClick={onClick}
    >
      {children}
    </Box>
  );
}

function Header({ title, investors }: { title: string; investors: number }) {
  return (
    <Box sx={{ width: "100%" }}>
      <TableRow
        header
        style={{
          paddingTop: "10px",
          paddingBottom: "10px",
          flexDirection: "column",
          display: "flex",
        }}
      >
        <Typography variant="h2">{truncateString(title, 18)}</Typography>

        <Typography variant="body1">
          {formatNumber(investors)} investors
        </Typography>
      </TableRow>
    </Box>
  );
}

const TableRow = styled("div")<{ hover?: boolean; header?: boolean }>(
  ({ theme, hover, header }) => ({
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingLeft: "10px",
    paddingRight: "10px",
    "&:hover": {
      backgroundColor: `${hover ? customTheme.grey2 : "transparent"}`,
    },

    ...(header && {
      borderBottom: `1px solid ${customTheme.grey}`,
      borderBottomRightRadius: "0",
      borderBottomLeftRadius: "0",
    }),
  }),
);
