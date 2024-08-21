import React, { ReactNode } from "react";
import { Box, styled, Typography } from "@mui/material";
import { customTheme } from "../../styles";
import {
  formatNumber,
  FundOverview,
  prettyNumber,
  PropShopClient,
  truncateString,
  yyyymmdd,
} from "@cosmic-lab/prop-shop-sdk";
import { FundDialog } from "./FundDialog";
import { ActionButton } from "../../components";

function calcMaxDrawdown(values: number[]): number {
  let maxDrawdown = 0;
  let peak = values[0];

  for (const value of values) {
    if (value > peak) {
      peak = value;
    }
    let drawdown = ((value - peak) / Math.abs(peak)) * 100;
    // (-200 - 2) / 2 * 100 = -10100, so cap at -100%
    drawdown = Math.max(drawdown, -100);
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
  const { vault, tvl, volume30d, lifetimePNL, title, investors, birth } =
    fundOverview;

  // TVL = netDeposits + lifetimePNL, so TVL - lifetimePNL = netDeposits
  // let pnl = (lifetimePNL / (tvl - lifetimePNL)) * 100;
  // if (isNaN(pnl)) {
  //   pnl = 0;
  // }
  const pnl = lifetimePNL;

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
            width: "350px",
            flexDirection: "column",
            display: "flex",
            gap: 0,
          }}
        >
          <TableRow hover divider footer square>
            <Typography variant="h4">{pnl < 0 ? "Loss" : "Profit"}</Typography>
            <Typography
              variant="h3"
              sx={{
                color: pnl < 0 ? customTheme.error : customTheme.success,
              }}
            >
              ${prettyNumber(pnl)}
            </Typography>
          </TableRow>

          <TableRow hover square>
            <Typography variant="h4">TVL</Typography>
            <Typography variant="h4">${prettyNumber(tvl)}</Typography>
          </TableRow>

          <TableRow hover square>
            <Typography variant="h4">Volume 30d</Typography>
            <Typography variant="h4">${prettyNumber(volume30d)}</Typography>
          </TableRow>

          <TableRow hover footer>
            <Typography variant="h4">Birthday</Typography>
            <Typography variant="h4">{yyyymmdd(birth)}</Typography>
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
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <Box
      sx={{
        cursor: "pointer",
        position: "relative",
      }}
    >
      <Box
        sx={{
          width: "100%",
          bgcolor: customTheme.grey,
          borderRadius: "10px",
          display: "flex",
          alignItems: "center",
          flexDirection: "column",
          cursor: "pointer",
          p: 1,
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Box
          sx={{
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: isHovered ? 0 : -1,
            backdropFilter: "blur(4px)",
            transition: "backdrop-filter 0.2s linear",
            borderRadius: "10px",
          }}
        />
        {children}
        <Box
          sx={{
            opacity: isHovered ? 1 : 0,
            transition: "opacity 0.2s ease-in-out",
            position: "absolute",
            height: "70px",
            width: "50%",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
          }}
        >
          <ActionButton onClick={onClick}>Invest</ActionButton>
        </Box>
      </Box>
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
        <Typography variant="h2">{truncateString(title, 15)}</Typography>

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
