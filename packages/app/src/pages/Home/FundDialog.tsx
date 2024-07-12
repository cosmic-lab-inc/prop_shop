import React from "react";
import { customTheme } from "../../styles";
import { Box, Dialog, Typography } from "@mui/material";

export function FundDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const handleClose = () => {
    onClose();
  };

  return (
    <>
      <Dialog
        maxWidth="lg"
        fullWidth={true}
        fullScreen={false}
        scroll="paper"
        open={open}
        onClose={handleClose}
        PaperProps={{
          style: {
            background: customTheme.light,
            borderRadius: "3px",
            height: "500px",
          },
        }}
        sx={{
          backgroundColor: "transparent",
        }}
      >
        <Box
          sx={{
            width: "100%",
            height: "100%",
            flexDirection: "column",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Typography variant="h3" sx={{ color: customTheme.dark }}>
            Hey hey hey
          </Typography>
        </Box>
      </Dialog>
    </>
  );
}
