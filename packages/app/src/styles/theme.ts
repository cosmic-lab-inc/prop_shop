import "./globals.css";
import { createTheme, Theme } from "@mui/material";

const SECONDARY = "#c2a058";
const LETTER_SPACING = "0px";
const LINE_HEIGHT = "2rem";
const FONT_WEIGHT = "bolder";

export const customTheme = {
  light: "#2c2c2c",
  grey: "#dad8d6",
  grey2: "#cccccc",
  dark: "#e3e2e2",

  secondary: SECONDARY,
  blue: SECONDARY,

  success: SECONDARY,
  error: "#b64747",

  font: {
    // --- too soft ---
    // light: "dosisLight",
    // heavy: "dosisHeavy",
    // --- default light ---
    // light: "mulishLight",
    // heavy: "mulishHeavy",
    // --- default light ---
    // light: "titilliumLight",
    // heavy: "titilliumHeavy",
    light: "abel",
    heavy: "abel",
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
      letterSpacing: LETTER_SPACING,
      lineHeight: LINE_HEIGHT,
      fontWeight: FONT_WEIGHT,
      textTransform: "none",
      color: customTheme.light,
    },
    h2: {
      fontSize: 30,
      letterSpacing: LETTER_SPACING,
      lineHeight: LINE_HEIGHT,
      fontWeight: FONT_WEIGHT,
      textTransform: "none",
      color: customTheme.light,
    },
    h3: {
      fontSize: 24,
      letterSpacing: LETTER_SPACING,
      lineHeight: LINE_HEIGHT,
      fontWeight: FONT_WEIGHT,
      textTransform: "none",
      color: customTheme.light,
    },
    h4: {
      fontSize: 24,
      letterSpacing: LETTER_SPACING,
      lineHeight: LINE_HEIGHT,
      fontWeight: FONT_WEIGHT,
      textTransform: "none",
      color: customTheme.light,
    },
    body1: {
      fontFamily: customTheme.font.light,
      letterSpacing: LETTER_SPACING,
      lineHeight: LINE_HEIGHT,
      fontWeight: FONT_WEIGHT,
      textTransform: "none",
      color: customTheme.light,
    },
    button: {
      fontSize: 24,
      letterSpacing: LETTER_SPACING,
      lineHeight: LINE_HEIGHT,
      fontWeight: FONT_WEIGHT,
      textTransform: "none",
      color: customTheme.light,
    },
  },
});
