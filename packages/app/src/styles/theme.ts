import "./globals.css";
import { createTheme, Theme } from "@mui/material";

export const customTheme = {
  light: "#EBE0D7FF",
  dark: "#0e0907",
  grey: "#413534FF",

  red: "#af5050",
  rust: "#441e1a",
  midnight: "#0f0c11",

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
      default: customTheme.dark,
      paper: customTheme.dark,
    },
    primary: {
      light: customTheme.light,
      main: customTheme.dark,
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
      paddingTop: "15px",
      paddingLeft: "10px",
      fontFamily: customTheme.font.researcher,
      fontSize: 50,
      lineHeight: "3rem",
      letterSpacing: "10px",
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
          backgroundColor: customTheme.dark,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        root: {
          backgroundColor: customTheme.dark,
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          backgroundColor: customTheme.dark,
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          backgroundColor: customTheme.dark,
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          backgroundColor: customTheme.dark,
        },
      },
    },
    MuiDialogContentText: {
      styleOverrides: {
        root: {
          backgroundColor: customTheme.dark,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: customTheme.dark,
        },
      },
    },
  },
});
