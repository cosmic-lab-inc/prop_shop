import "./globals.css";
import { createTheme, Theme } from "@mui/material";

export const customTheme = {
  light: "#e5f1f1",
  grey: "#c7c7c7",
  dark: "#0e0907",

  secondary: "#348771",
  secondaryDark: "#0a1a16",

  success: "#38aa28",
  error: "#b62b2b",

  font: {
    titillium: "titilliumLight",
    titilliumBold: "titilliumBold",
  },
};

export const theme: Theme = createTheme({
  palette: {
    background: {
      default: customTheme.grey,
      paper: customTheme.grey,
    },
    primary: {
      light: customTheme.light,
      main: customTheme.grey,
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
      fontSize: 30,
      fontWeight: 800,
      lineHeight: "2rem",
      letterSpacing: "2px",
      fontFamily: customTheme.font.titilliumBold,
    },
    h3: {
      fontSize: 24,
      fontWeight: 700,
      lineHeight: "2rem",
      letterSpacing: "2px",
      fontFamily: customTheme.font.titillium,
    },
    body1: {
      fontSize: 20,
      lineHeight: "2rem",
      letterSpacing: "2px",
      fontWeight: 700,
    },
    button: {
      fontSize: 24,
      fontWeight: 700,
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
