import * as React from "react";
import { Box, Typography } from "@mui/material";
import { HttpDisplay } from "../../components";
import { observer } from "mobx-react";
import { customTheme } from "../../styles";

export const ExampleResponse = observer(
  ({ response }: { response: Object }) => {
    return (
      <Box
        sx={{
          width: "100%",
          borderRadius: "3px",
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          height: "100%",
        }}
      >
        <Box
          sx={{
            borderRadius: "3px",
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            bgcolor: customTheme.grey,
            display: "flex",
            justifyContent: "left",
            alignItems: "center",
            overflowY: "auto",
            height: "60px",
            gap: 1,
            p: 1,
          }}
        >
          <Typography variant="h3">Response</Typography>
        </Box>
        <Box
          sx={{
            borderRadius: "3px",
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            bgcolor: customTheme.grey,
            maxHeight: "inherit",
            height: "100%",
            p: 1,
            flexGrow: 1,
            overflowY: "auto",
            scrollbarWidth: "none" /* For Firefox */,
            msOverflowStyle: "none" /* For Internet Explorer and Edge */,
            "&::-webkit-scrollbar": {
              display: "none" /* For Chrome, Safari, and Opera */,
            },
          }}
        >
          <HttpDisplay src={response} collapsed={2} />
        </Box>
      </Box>
    );
  },
);
