import "./globals.css";
import { createTheme, Theme } from "@mui/material";

export const customTheme = {
  light: "#edefef",
  // grey: "#1f1f22",
  // grey2: "#151517",
  grey: "#1d1e22",
  grey2: "#15151a",
  dark: "#0e0907",

  secondary: "#986cb5",
  cyan: "#7ccedd",

  success: "#38aa28",
  error: "#b62b2b",

  font: {
    light: "light",
    heavy: "heavy",
  },
};

export const theme: Theme = createTheme({
  palette: {
    background: {
      default: customTheme.grey2,
      paper: customTheme.grey2,
    },
    primary: {
      light: customTheme.light,
      main: customTheme.grey2,
      contrastText: customTheme.light,
      dark: customTheme.dark,
    },
    secondary: {
      light: customTheme.light,
      main: customTheme.secondary,
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
    fontFamily: customTheme.font.light,
    fontSize: 16,
    h1: {
      fontFamily: customTheme.font.heavy,
      fontSize: 50,
      fontWeight: 700,
      lineHeight: "4rem",
    },
    h2: {
      fontSize: 30,
      fontWeight: 500,
      lineHeight: "2rem",
      letterSpacing: "2px",
      fontFamily: customTheme.font.heavy,
    },
    h3: {
      fontSize: 24,
      fontWeight: 300,
      lineHeight: "2rem",
      letterSpacing: "2px",
      fontFamily: customTheme.font.heavy,
    },
    body1: {
      fontSize: 20,
      lineHeight: "2rem",
      letterSpacing: "2px",
      fontWeight: 700,
    },
    button: {
      fontSize: 18,
      fontWeight: 700,
      textTransform: "none",
      lineHeight: "2rem",
      letterSpacing: "1px",
      fontFamily: customTheme.font.heavy,
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
