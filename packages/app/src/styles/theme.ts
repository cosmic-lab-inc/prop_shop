import "./globals.css";
import { createTheme, Theme } from "@mui/material";

export const customTheme = {
  light: "#e3e3e3",
  grey: "#1b1c1f",
  grey2: "#15151a",
  dark: "#0e0907",

  secondary: "#674d64",
  blue: "#bcc8e7",
  blue2: "#7ccedd",

  success: "#7ccedd",
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
    },
    h2: {
      fontSize: 30,
      fontWeight: 600,
      lineHeight: "2rem",
      letterSpacing: "2px",
      fontFamily: customTheme.font.heavy,
    },
    h3: {
      fontSize: 24,
      fontWeight: 600,
      lineHeight: "2rem",
      letterSpacing: "2px",
      fontFamily: customTheme.font.heavy,
    },
    h4: {
      fontSize: 20,
      fontWeight: 300,
      lineHeight: "2rem",
      letterSpacing: "2px",
      fontFamily: customTheme.font.heavy,
    },
    body1: {
      fontSize: 16,
      lineHeight: "2rem",
      letterSpacing: "2px",
      fontWeight: 500,
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
