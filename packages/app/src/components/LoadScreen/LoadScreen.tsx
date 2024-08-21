import React from "react";
import { Box, Dialog, Typography } from "@mui/material";
import { customTheme } from "../../styles";
import { observer } from "mobx-react";
import { IconSpinner, PropShopIcon } from "../Icons";
import { ProgressBar } from "./ProgressBar";

// const messages = [randomName(5), randomName(7), randomName(4), randomName(6)];
const messages = [
  "Mining for alpha...",
  "Hunting for hedge funds...",
  "Loading money printers...",
  "Searching for yield...",
];

export const LoadScreen = observer(({ open }: { open: boolean }) => {
  const [progress, setProgress] = React.useState(0);
  const [text, setText] = React.useState(messages[0]);

  React.useEffect(() => {
    if (open) {
      const startIntervals = () => {
        const progressSeconds = 10;
        let progressInterval = setInterval(() => {
          setProgress((prev) => Math.min(prev + 1, 100));
          if (progress >= 100) {
            clearInterval(progressInterval);
          }
        }, progressSeconds * 10);

        let messageInterval = setInterval(() => {
          setText(messages[Math.floor(Math.random() * messages.length)]);
        }, 2000);

        return () => {
          clearInterval(progressInterval);
          clearInterval(messageInterval);
        };
      };
      startIntervals();
    }
  }, [open]);

  return (
    <>
      <Dialog
        maxWidth="xs"
        fullWidth={true}
        fullScreen={false}
        scroll="paper"
        open={open}
        PaperProps={{
          style: {
            borderRadius: "10px",
          },
        }}
        sx={{
          bgcolor: customTheme.grey,
        }}
      >
        <Box
          sx={{
            flexDirection: "column",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: customTheme.grey,
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "left",
              alignItems: "center",
              p: 2,
              gap: 2,
              width: "80%",
            }}
          >
            <IconSpinner>
              <PropShopIcon size={150} />
            </IconSpinner>

            <Typography variant="h4">{text}</Typography>

            <ProgressBar progress={progress} />
          </Box>
        </Box>
      </Dialog>
    </>
  );
});
