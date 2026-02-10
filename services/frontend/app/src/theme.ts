import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    primary: {
      main: "#0d57a4",
      contrastText: "#ffffff",
    },
    error: {
      main: "#c24130",
      contrastText: "#ffffff",
    },
  },
});

export default theme;
