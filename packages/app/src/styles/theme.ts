import "./globals.css";
import { createTheme, Theme } from "@mui/material";

const SECONDARY = "#c2a058";
const LETTER_SPACING = "0px";
const LINE_HEIGHT = "2rem";
const FONT_WEIGHT = "bolder";

export const customTheme = {
  dark: "#2c2c2c",
  grey2: "#cccccc",
  grey: "#dad8d6",
  light: "#e3e2e2",

  secondary: SECONDARY,
  blue: SECONDARY,

  success: "#44862a",
  error: "#b64747",

  font: {
    light: "abel",
    heavy: "abel",
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
    fontSize: 18,
    fontFamily: customTheme.font.light,
    fontWeightLight: 300,
    fontWeightRegular: 300,
    fontWeightBold: 700,
    h1: {
      fontSize: 46,
      letterSpacing: LETTER_SPACING,
      lineHeight: LINE_HEIGHT,
      fontWeight: FONT_WEIGHT,
      textTransform: "none",
      color: customTheme.dark,
    },
    h2: {
      fontSize: 30,
      letterSpacing: LETTER_SPACING,
      lineHeight: LINE_HEIGHT,
      fontWeight: FONT_WEIGHT,
      textTransform: "none",
      color: customTheme.dark,
    },
    h3: {
      fontSize: 24,
      letterSpacing: LETTER_SPACING,
      lineHeight: LINE_HEIGHT,
      fontWeight: FONT_WEIGHT,
      textTransform: "none",
      color: customTheme.dark,
    },
    h4: {
      fontSize: 24,
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
      fontSize: 24,
      letterSpacing: LETTER_SPACING,
      lineHeight: LINE_HEIGHT,
      fontWeight: FONT_WEIGHT,
      textTransform: "none",
      color: customTheme.dark,
    },
  },
});
