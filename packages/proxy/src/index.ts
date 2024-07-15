import express from "express";
import { handleHistoricalPnl } from "./pnl";
import cors from "cors";

const app = express();
const port = 5173;

app.use(express.json());
app.use(express.raw());

// CORS configuration
const corsOptions = {
  origin: "*",
};
app.use(cors(corsOptions));

app.post("/api/performance", async (req, res) => {
  try {
    const { vaultName, vaultUser, daysBack } = req.body; // Your React app sends the URL to request
    const data = await handleHistoricalPnl(vaultUser, daysBack);
    res.send(JSON.stringify(data));
  } catch (e: any) {
    console.error(e);
    throw new Error(e);
  }
});

app.listen(port, () => {
  console.log(`Proxy server listening at http://localhost:${port}`);
});
