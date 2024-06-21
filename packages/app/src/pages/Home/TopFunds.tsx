import React from "react";
import { customTheme } from "../../styles";
import { Box, Typography } from "@mui/material";
import { FundOverviewCard } from "../../components";

export function TopFunds() {
  return (
    <Box
      sx={{
        width: "70%",
        bgcolor: customTheme.light,
        display: "flex",
        alignItems: "center",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          borderRadius: "3px",
          alignItems: "center",
          flexDirection: "row",
        }}
      >
        <Typography variant="h2" sx={{ color: customTheme.dark }}>
          Top Funds by ROI
        </Typography>
      </Box>
      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          gap: 2,
          borderRadius: "3px",
          alignItems: "center",
          flexDirection: "row",
        }}
      >
        <FundOverviewCard
          title={"W.D. Gann"}
          investors={109}
          roi={180.3}
          drawdown={9.2}
          aum={1045783}
          data={[
            1.3, 14.5, 34.9, 56.3, 79.3, 99.8, 107.2, 125.4, 141.7, 160.6,
            180.3,
          ]}
        />
        <FundOverviewCard
          title={"W.D. Gann"}
          investors={109}
          roi={180.3}
          drawdown={9.2}
          aum={1045783}
          data={[
            1.3, 14.5, 34.9, 56.3, 79.3, 99.8, 107.2, 125.4, 141.7, 160.6,
            180.3,
          ]}
        />
        <FundOverviewCard
          title={"W.D. Gann"}
          investors={109}
          roi={180.3}
          drawdown={9.2}
          aum={1045783}
          data={[
            1.3, 14.5, 34.9, 56.3, 79.3, 99.8, 107.2, 125.4, 141.7, 160.6,
            180.3,
          ]}
        />
      </Box>
    </Box>
  );
}
