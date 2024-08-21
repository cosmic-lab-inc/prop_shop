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
    light: "light",
    heavy: "heavy",
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
    fontFamily: customTheme.font.light,

    fontSize: 16,
    h1: {
      fontFamily: customTheme.font.heavy,
      fontSize: 46,
      fontWeight: 900,
      lineHeight: "4rem",
      color: customTheme.light,
    },
    h2: {
      fontSize: 30,
      fontWeight: 600,
      lineHeight: "2rem",
      letterSpacing: "2px",
      fontFamily: customTheme.font.heavy,
      color: customTheme.light,
    },
    h3: {
      fontSize: 24,
      fontWeight: 600,
      lineHeight: "2rem",
      letterSpacing: "2px",
      fontFamily: customTheme.font.heavy,
      color: customTheme.light,
    },
    h4: {
      fontSize: 20,
      lineHeight: "2rem",
      letterSpacing: "2px",
      color: customTheme.light,
    },
    body1: {
      fontSize: 16,
      lineHeight: "2rem",
      letterSpacing: "2px",
      color: customTheme.light,
    },
    button: {
      fontSize: 18,
      fontWeight: 700,
      textTransform: "none",
      lineHeight: "2rem",
      letterSpacing: "1px",
      fontFamily: customTheme.font.heavy,
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
