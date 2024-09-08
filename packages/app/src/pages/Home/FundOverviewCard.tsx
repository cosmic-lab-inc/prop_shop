import React, { ReactNode } from "react";
import { Box, styled, Typography } from "@mui/material";
import { customTheme } from "../../styles";
import {
  formatNumber,
  FundOverview,
  fundPctPnl,
  prettyNumber,
  PropShopClient,
  truncateString,
  yyyymmdd,
} from "@cosmic-lab/prop-shop-sdk";
import { FundDialog } from "./FundDialog";
import { ActionButton, CakeIcon, UsdcIcon } from "../../components";
import MovingIcon from "@mui/icons-material/Moving";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";

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
        <Header title={title} />
        <Box
          sx={{
            width: "100%",
            flexDirection: "column",
            display: "flex",
          }}
        >
          <TableRow hover divider footer square>
            <PnlIcon />
            <Typography
              variant="h3"
              sx={{
                color: pnl < 0 ? customTheme.error : customTheme.success,
              }}
            >
              {prettyNumber(fundPctPnl(fundOverview))}%
            </Typography>
          </TableRow>

          <TableRow hover square>
            <UsdcIcon />
            <Typography variant="h4">${prettyNumber(tvl)}</Typography>
          </TableRow>

          <TableRow hover square>
            <PeopleAltIcon htmlColor={customTheme.dark} fontSize={"medium"} />
            <Typography variant="h4">{formatNumber(investors)}</Typography>
          </TableRow>

          <TableRow hover footer>
            <CakeIcon />
            <Typography variant="h4">{yyyymmdd(birth)}</Typography>
          </TableRow>
        </Box>
      </Container>
    </>
  );
}

function PnlIcon({ invert }: { invert?: boolean }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <MovingIcon
        htmlColor={invert ? customTheme.error : customTheme.success}
        fontSize={"medium"}
        sx={{
          transform: invert ? "rotate(180deg)" : "none",
        }}
      />
    </Box>
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
        width: "100%",
        cursor: "pointer",
        position: "relative",
        minWidth: 0,
        borderRadius: "10px",
        flex: `0 0 var(calc(100% / 3))`,
        paddingLeft: `var(calc(100% / 3))`,
      }}
    >
      <Box
        sx={{
          bgcolor: customTheme.grey,
          borderRadius: "10px",
          display: "flex",
          flexDirection: "column",
          cursor: "pointer",
          ml: 1,
          mr: 1,
          boxShadow: isHovered ? "none" : `0px 0px 5px 0px ${customTheme.dark}`,
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
            // ml: 1,
            // mr: 1,
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
            ml: 1,
            mr: 1,
            transform: "translate(-50%, -50%)",
          }}
        >
          <ActionButton onClick={onClick}>Invest</ActionButton>
        </Box>
      </Box>
    </Box>
  );
}

function Header({ title }: { title: string }) {
  return (
    <Box>
      <TableRow square>
        <Typography variant="h2">{truncateString(title, 10)}</Typography>
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

  paddingLeft: 20,
  paddingRight: 20,
  paddingTop: 10,
  paddingBottom: 10,

  "&:hover": {
    backgroundColor: `${hover ? customTheme.grey2 : "transparent"}`,
  },

  borderRadius: "10px",
  ...(square && {
    borderRadius: "0",
  }),

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
