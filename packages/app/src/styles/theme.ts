import "./globals.css";
import { createTheme, Theme } from "@mui/material";

const SECONDARY = "#e82e2e";
const LETTER_SPACING = "0px";
const LINE_HEIGHT = "2rem";
const FONT_WEIGHT = 700;

export const customTheme = {
  dark: "#2c2c2c",
  shadow: "#a6a6a6",
  grey2: "#e7e6e6",
  grey: "#f5f5f5",
  light: "#ffffff",

  secondary: SECONDARY,
  blue: SECONDARY,

  success: "#44862a",
  error: "#b64747",

  font: {
    light: "libreLight",
    heavy: "libreHeavy",
  },
};

export const theme: Theme = createTheme({
  palette: {
    background: {
      default: customTheme.light,
      paper: customTheme.light,
    },
    primary: {
      light: customTheme.dark,
      main: customTheme.light,
      contrastText: customTheme.dark,
      dark: customTheme.light,
    },
    secondary: {
      light: customTheme.dark,
      main: customTheme.secondary,
      dark: customTheme.light,
    },
    text: {
      primary: customTheme.dark,
      secondary: customTheme.dark,
    },
    success: {
      main: customTheme.success,
    },
    error: {
      main: customTheme.error,
    },
  },
  typography: {
    fontSize: 20,
    fontFamily: customTheme.font.light,
    fontWeightLight: 700,
    fontWeightRegular: 700,
    fontWeightBold: 700,
    h1: {
      fontSize: 80,
      fontFamily: customTheme.font.heavy,
      letterSpacing: LETTER_SPACING,
      lineHeight: LINE_HEIGHT,
      fontWeight: FONT_WEIGHT,
      textTransform: "none",
      color: customTheme.dark,
    },
    h2: {
      fontSize: 42,
      letterSpacing: LETTER_SPACING,
      lineHeight: LINE_HEIGHT,
      fontWeight: FONT_WEIGHT,
      textTransform: "none",
      color: customTheme.dark,
    },
    h3: {
      fontSize: 34,
      letterSpacing: LETTER_SPACING,
      lineHeight: LINE_HEIGHT,
      fontWeight: FONT_WEIGHT,
      textTransform: "none",
      color: customTheme.dark,
    },
    h4: {
      fontSize: 26,
      letterSpacing: LETTER_SPACING,
      lineHeight: LINE_HEIGHT,
      fontWeight: FONT_WEIGHT,
      textTransform: "none",
      color: customTheme.dark,
    },
    body1: {
      fontFamily: customTheme.font.light,
      letterSpacing: LETTER_SPACING,
      lineHeight: LINE_HEIGHT,
      fontWeight: FONT_WEIGHT,
      textTransform: "none",
      color: customTheme.dark,
    },
    button: {
      fontSize: 26,
      letterSpacing: LETTER_SPACING,
      lineHeight: LINE_HEIGHT,
      fontWeight: FONT_WEIGHT,
      textTransform: "none",
      color: customTheme.light,
    },
  },
});
