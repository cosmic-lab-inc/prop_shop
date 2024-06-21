import "./globals.css";
import { createTheme, Theme } from "@mui/material";

export const customTheme = {
  light: "#EBE0D7FF",
  dark: "#0e0907",
  // grey: "#413534FF",
  grey: "#0a1a16",

  red: "#af5050",
  // secondary: "#441e1a",
  secondary: "#348771",

  success: "#79B77AFF",
  error: "#d27272",

  font: {
    titillium: "titilliumLight",
    titilliumBold: "titilliumBold",
    researcher: "researcherBold",
  },
};

export const theme: Theme = createTheme({
  palette: {
    background: {
      default: customTheme.light,
      paper: customTheme.light,
    },
    primary: {
      light: customTheme.light,
      main: customTheme.light,
      contrastText: customTheme.light,
      dark: customTheme.dark,
    },
    secondary: {
      light: customTheme.light,
      main: customTheme.light,
      dark: customTheme.dark,
    },
    text: {
      primary: customTheme.light,
      secondary: customTheme.light,
    },
    success: {
      main: customTheme.success,
    },
    error: {
      main: customTheme.error,
    },
  },
  typography: {
    fontFamily: customTheme.font.titillium,
    fontSize: 16,
    h1: {
      paddingBottom: "20px",
      fontFamily: customTheme.font.titilliumBold,
      fontSize: 50,
      fontWeight: 800,
      lineHeight: "2rem",
    },
    h2: {
      fontSize: 40,
      fontWeight: 800,
      lineHeight: "3.5rem",
      letterSpacing: "2px",
      fontFamily: customTheme.font.titilliumBold,
    },
    h3: {
      fontSize: 26,
      fontWeight: 600,
      lineHeight: "2rem",
      letterSpacing: "2px",
      fontFamily: customTheme.font.titilliumBold,
    },
    h4: {
      fontSize: 20,
      fontWeight: 600,
      lineHeight: "2.5rem",
      letterSpacing: "2px",
    },
    body1: {
      fontSize: 18,
      lineHeight: "1.5rem",
      letterSpacing: "2px",
      fontWeight: 500,
    },
    button: {
      fontSize: 24,
      fontWeight: 600,
      textTransform: "none",
      lineHeight: "2rem",
      letterSpacing: "1px",
    },
  },
  components: {
    MuiMenu: {
      styleOverrides: {
        list: {
          backgroundColor: customTheme.light,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        root: {
          backgroundColor: customTheme.light,
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          backgroundColor: customTheme.light,
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          backgroundColor: customTheme.light,
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          backgroundColor: customTheme.light,
        },
      },
    },
    MuiDialogContentText: {
      styleOverrides: {
        root: {
          backgroundColor: customTheme.light,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: customTheme.light,
        },
      },
    },
  },
});
