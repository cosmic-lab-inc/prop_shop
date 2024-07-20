import React, { ReactNode } from "react";
import { Box, styled, Typography } from "@mui/material";
import { customTheme } from "../../styles";
import { Line, LineChart, XAxis, YAxis } from "recharts";
import {
  formatNumber,
  FundOverview,
  PropShopClient,
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
    // const drawdown = ((value - peak) / peak) * 100;
    const drawdown = value - peak;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}

function calcRoi(data: number[]): number {
  if (data[data.length - 1] && data[0]) {
    const roi = data[data.length - 1] - data[0];
    return roi;
  } else {
    return 0;
  }
}

export function FundOverviewCard({
  client,
  fundOverview,
}: {
  client: PropShopClient;
  fundOverview: FundOverview;
}) {
  const { vault, title, investors, aum, data } = fundOverview;

  const roi = calcRoi(data);
  const drawdown = calcMaxDrawdown(data);
  const _data = data.map((d) => ({ y: d }));

  const [open, setOpen] = React.useState(false);

  return (
    <>
      <FundDialog
        client={client}
        vault={vault}
        open={open}
        onClose={() => setOpen(false)}
      />
      <Container onClick={() => setOpen(true)}>
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
          <LineChart width={400} height={160} data={_data} compact>
            <Line
              type="monotone"
              dataKey="y"
              stroke={roi < 0 ? customTheme.error : customTheme.secondary}
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
            gap: 1,
          }}
        >
          <TableRow hover divider footer square>
            <Typography variant="h3">Profit</Typography>
            <Typography
              variant="h2"
              sx={{
                color: roi < 0 ? customTheme.error : customTheme.secondary,
              }}
            >
              ${formatNumber(truncateNumber(roi, 2))}
            </Typography>
          </TableRow>
          <TableRow hover square>
            <Typography variant="h3">Drawdown</Typography>
            <Typography variant="h3">${truncateNumber(drawdown, 2)}</Typography>
          </TableRow>
          <TableRow hover footer>
            <Typography variant="h3">TVL</Typography>
            <Typography variant="h3">
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
        bgcolor: customTheme.grey,
        borderRadius: "10px",
        border: `2px solid ${customTheme.light}`,
        display: "flex",
        alignItems: "center",
        flexDirection: "column",

        transition: `box-shadow 0.2s ease`,
        boxShadow: "none",

        "&:hover": {
          boxShadow: `0px 5px 20px ${customTheme.light}`,
          transition: `box-shadow 0.2s ease`,
        },
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
        divider
        style={{
          paddingTop: "10px",
          paddingBottom: "10px",
          flexDirection: "column",
          display: "flex",
          gap: 5,
        }}
      >
        <Typography variant="h2">{truncateString(title, 18)}</Typography>

        <Typography variant="body1">
          {formatNumber(investors)} {investors === 1 ? "investor" : "investors"}
        </Typography>
      </TableRow>
    </Box>
  );
}

const TableRow = styled("div")<{
  // darken on hover
  hover?: boolean;
  // top border radius is rounded
  header?: boolean;
  // bottom border radius is rounded
  footer?: boolean;
  // if header divider on bottom, if footer divider on top
  divider?: boolean;
  // no border radius anywhere
  square?: boolean;
}>(({ theme, hover, header, footer, divider, square }) => ({
  display: "flex",
  flexDirection: "row",
  justifyContent: "space-between",

  "&:hover": {
    backgroundColor: `${hover ? customTheme.grey2 : "transparent"}`,
  },

  paddingLeft: "15px",
  paddingRight: "15px",

  borderRadius: "10px",
  ...(square && {
    borderRadius: "0",
  }),

  paddingTop: "5px",
  paddingBottom: "5px",

  ...(header && {
    borderBottomRightRadius: "0",
    borderBottomLeftRadius: "0",
    ...(divider && {
      borderBottom: `1px solid ${customTheme.grey2}`,
    }),
  }),

  ...(footer && {
    borderTopRightRadius: "0",
    borderTopLeftRadius: "0",
    ...(divider && {
      borderTop: `1px solid ${customTheme.grey2}`,
    }),
  }),
}));
