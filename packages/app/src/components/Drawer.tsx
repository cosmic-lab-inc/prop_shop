import * as React from "react";
import { ReactNode } from "react";
import { Box, Button, Drawer as MuiDrawer, Typography } from "@mui/material";
import Toolbar from "@mui/material/Toolbar";
import List from "@mui/material/List";
import Divider from "@mui/material/Divider";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import DataObjectIcon from "@mui/icons-material/DataObject";
import { WalletButton } from "../components";
import { customTheme } from "../styles";
import { DRAWER_WIDTH, TOOLBAR_HEIGHT } from "../constants";
import HourglassBottomOutlinedIcon from "@mui/icons-material/HourglassBottomOutlined";
import HomeIcon from "@mui/icons-material/Home";
import { Link } from "react-router-dom";
import HandymanOutlinedIcon from "@mui/icons-material/HandymanOutlined";
import MonetizationOnOutlinedIcon from "@mui/icons-material/MonetizationOnOutlined";

function Redirect({
  path,
  type,
  children,
}: {
  path: string;
  type: "link" | "button";
  children: ReactNode;
}) {
  if (type === "link") {
    return (
      <Link
        to={path}
        style={{
          display: "flex",
          width: "100%",
          textDecoration: "none",
        }}
      >
        {children}
      </Link>
    );
  } else {
    return (
      <Button
        onClick={() => window.open(path)}
        sx={{
          display: "flex",
          width: "100%",
          textDecoration: "none",
          p: 0,
          m: 0,
        }}
      >
        {children}
      </Button>
    );
  }
}

const TABS: {
  name: string;
  icon: ReactNode;
  path: string;
  type: "link" | "button";
}[] = [
  {
    name: "Home",
    icon: <HomeIcon />,
    path: "/",
    type: "link",
  },
  {
    name: "Covest",
    icon: <MonetizationOnOutlinedIcon />,
    path: "/covest",
    type: "link",
  },
  {
    name: "Demo",
    icon: <HandymanOutlinedIcon />,
    path: "/demo",
    type: "link",
  },
  {
    name: "API Docs",
    icon: <DataObjectIcon />,
    path: "https://docs.epoch.fm/",
    type: "button",
  },
  {
    name: "EpochAI",
    icon: <HourglassBottomOutlinedIcon />,
    path: "/chat",
    type: "link",
  },
];

export function Drawer() {
  return (
    <MuiDrawer
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: DRAWER_WIDTH,
          boxSizing: "border-box",
          borderRight: `1px solid ${customTheme.dark}`,
        },
      }}
      variant="permanent"
      anchor="left"
    >
      <Toolbar
        disableGutters
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: TOOLBAR_HEIGHT,
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            width: "100%",
            height: "70%",
          }}
        >
          <WalletButton />
        </Box>
      </Toolbar>
      <Divider
        sx={{
          bgcolor: customTheme.dark,
        }}
      />
      <List sx={{ p: 2 }}>
        {TABS.map(({ name, icon, path, type }, index) => {
          const [color, setColor] = React.useState(customTheme.light);
          return (
            <ListItem key={name} disablePadding>
              <Redirect path={path} type={type}>
                <ListItemButton
                  sx={{
                    ml: 1,
                    mr: 1,
                    borderRadius: "2px",
                    "&:hover": {
                      bgcolor: customTheme.light,
                    },
                  }}
                  onMouseEnter={() => {
                    setColor(customTheme.rust);
                  }}
                  onMouseLeave={() => {
                    setColor(customTheme.light);
                  }}
                >
                  <ListItemIcon sx={{ color }}>{icon}</ListItemIcon>
                  <ListItemText>
                    <Typography variant="h4" sx={{ color }}>
                      {name}
                    </Typography>
                  </ListItemText>
                </ListItemButton>
              </Redirect>
            </ListItem>
          );
        })}
      </List>
    </MuiDrawer>
  );
}
