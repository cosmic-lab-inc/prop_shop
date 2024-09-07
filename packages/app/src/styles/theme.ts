import "./globals.css";
import { createTheme, Theme } from "@mui/material";

export const customTheme = {
  light: "#e3e3e3",
  grey: "#171515",
  grey2: "#13100f",
  dark: "#0d0908",

  secondary: "#5f8ea0",
  blue: "#5f8ea0",

  success: "#5f8ea0",
  error: "#d47755",

  font: {
    // --- yes ---
    // light: "dosisLight",
    // heavy: "dosisHeavy",
    // light: "mulishLight",
    // heavy: "mulishHeavy",
    light: "titilliumLight",
    heavy: "titilliumHeavy",
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
    fontSize: 18,
    fontFamily: customTheme.font.light,
    fontWeightLight: 300,
    fontWeightRegular: 300,
    fontWeightBold: 700,
    h1: {
      fontSize: 46,
      textTransform: "none",
      letterSpacing: "2px",
      lineHeight: "2rem",
      fontWeight: "bolder",
      color: customTheme.light,
    },
    h2: {
      fontSize: 30,
      textTransform: "none",
      letterSpacing: "2px",
      lineHeight: "2rem",
      fontWeight: "bolder",
      color: customTheme.light,
    },
    h3: {
      fontSize: 24,
      textTransform: "none",
      letterSpacing: "2px",
      lineHeight: "2rem",
      fontWeight: "bolder",
      color: customTheme.light,
    },
    h4: {
      fontSize: 24,
      textTransform: "none",
      letterSpacing: "2px",
      lineHeight: "2rem",
      fontWeight: "bolder",
      color: customTheme.light,
    },
    body1: {
      textTransform: "none",
      letterSpacing: "2px",
      lineHeight: "2rem",
      fontWeight: "bolder",
      fontFamily: customTheme.font.light,
      color: customTheme.light,
    },
    button: {
      fontSize: 24,
      textTransform: "none",
      letterSpacing: "2px",
      lineHeight: "2rem",
      fontWeight: "bolder",
      color: customTheme.light,
    },
  },
  components: {
    // MuiMenu: {
    //   styleOverrides: {
    //     list: {
    //       backgroundColor: customTheme.light,
    //     },
    //   },
    // },
    // MuiDialog: {
    //   styleOverrides: {
    //     root: {
    //       backgroundColor: customTheme.grey2,
    //     },
    //   },
    // },
    // MuiDialogContent: {
    //   styleOverrides: {
    //     root: {
    //       backgroundColor: customTheme.grey2,
    //     },
    //   },
    // },
    // MuiDialogTitle: {
    //   styleOverrides: {
    //     root: {
    //       backgroundColor: customTheme.light,
    //     },
    //   },
    // },
    // MuiDialogActions: {
    //   styleOverrides: {
    //     root: {
    //       backgroundColor: customTheme.light,
    //     },
    //   },
    // },
    // MuiDialogContentText: {
    //   styleOverrides: {
    //     root: {
    //       backgroundColor: customTheme.light,
    //     },
    //   },
    // },
    // MuiCard: {
    //   styleOverrides: {
    //     root: {
    //       backgroundColor: customTheme.light,
    //     },
    //   },
    // },
  },
});
