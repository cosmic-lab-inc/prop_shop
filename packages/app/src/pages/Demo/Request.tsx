import * as React from "react";
import { ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import { HttpDisplay, ResetButton, SendButton } from "../../components";
import { EpochClient, QueryDecodedAccounts } from "@cosmic-lab/epoch-sdk";
import { observer } from "mobx-react";
import { customTheme } from "../../styles";
import IconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";
import InputBase from "@mui/material/InputBase";
import { InputBaseProps } from "@mui/material/InputBase/InputBase";

export const ExampleRequest = observer(
  ({ responseCallback }: { responseCallback: (res: Object) => void }) => {
    const defaultKey = "A8PudbQF6ALzqQLUNzYaenc6jsVE1kGPVJbjMyqixsWv";
    const defaultSlot = 217956854;
    const defaultOwner = "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH";
    const defaultDiscrim = "User";
    const defaultLimit = 10;
    const defaultOffset = 0;

    const [key, setKey] = React.useState<string>("");
    const [owner, setOwner] = React.useState<string>(defaultOwner);
    const [slot, setSlot] = React.useState<string>("");
    const [discrim, setDiscrim] = React.useState<string>(defaultDiscrim);
    const [limit, setLimit] = React.useState<string>(defaultLimit.toString());
    const [offset, setOffset] = React.useState<string>(
      defaultOffset.toString(),
    );
    const [req, setReq] = React.useState<Record<string, any>>({
      key: null,
      owner,
      slot,
      discriminant: discrim,
    });
    const [sending, setSending] = React.useState<boolean>(false);

    React.useEffect(() => {
      const newReq = req;
      newReq["key"] = key ? key : null;
      newReq["owner"] = owner ? owner : null;
      newReq["slot"] = slot ? parseInt(slot) : null;
      newReq["discriminant"] = discrim;
      setReq(newReq);
    }, [key, owner, slot, discrim, limit, offset]);

    function reset() {
      setKey("");
      setOwner(defaultOwner);
      setSlot(defaultSlot.toString());
      setDiscrim(defaultDiscrim);
      setLimit(defaultLimit.toString());
      setOffset(defaultOffset.toString());
    }

    async function send() {
      const query: QueryDecodedAccounts = {
        key: req["key"],
        slot: req["slot"],
        max_slot: null,
        min_slot: null,
        owner: req["owner"],
        discriminant: req["discriminant"],
        limit: 10,
        offset: null,
      };
      setSending(true);
      const result = await EpochClient.instance.decodedAccounts(query);
      setSending(false);
      responseCallback(result);
    }

    return (
      <Box
        sx={{
          width: "100%",
          borderRadius: "3px",
          display: "flex",
          flexDirection: "column",
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
            flexDirection: "row",
            height: "60px",
            gap: 1,
            p: 1,
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "left",
              alignItems: "center",
              flexGrow: 1,
              pb: 1,
            }}
          >
            <Typography variant="h3">Request</Typography>
          </Box>
          <Box>
            <SendButton
              onClick={() => send()}
              disabled={
                sending || !EpochClient.instance.epochUser!.balance.amount
              }
            />
          </Box>
          <Box>
            <ResetButton onClick={() => reset()} />
          </Box>
        </Box>
        <Box
          sx={{
            height: "100%",
            borderRadius: "3px",
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            bgcolor: customTheme.grey,
            display: "flex",
            flexDirection: "column",
            gap: 1,
            p: 1,
            pt: 0,
          }}
        >
          <InputsContainer>
            <Input
              placeholder={defaultKey}
              value={key}
              onChange={(e: any) => {
                setKey(e.target.value);
              }}
            />
            <Input
              placeholder={defaultOwner}
              value={defaultOwner}
              readOnly
              required
            />
            <Input
              placeholder={defaultSlot.toString()}
              value={slot}
              required
              onChange={(e: any) => {
                setSlot(e.target.value);
              }}
            />
            <Input
              placeholder={defaultDiscrim}
              value={discrim}
              required
              onChange={(e: any) => {
                setDiscrim(e.target.value);
              }}
            />
          </InputsContainer>

          <HttpDisplay
            src={req}
            collapsed={1}
            collapseStringsAfterLength={20}
          />
        </Box>
      </Box>
    );
  },
);

const InputsContainer = observer(({ children }: { children: ReactNode }) => {
  return (
    <Box
      sx={{
        width: "100%",
        // height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 1,
        flexGrow: 1,
      }}
    >
      {children}
    </Box>
  );
});

const Input = observer((props: InputBaseProps) => {
  return (
    <Box
      sx={{
        p: "2px",
        display: "flex",
        width: "100%",
        bgcolor: customTheme.light,
        borderRadius: "3px",
        flexDirection: "row",
      }}
    >
      <IconButton
        sx={{
          p: "5px",
          color: customTheme.dark,
          alignItems: "flex-end",
        }}
      >
        <MenuIcon />
      </IconButton>
      <InputBase
        sx={{
          ml: 1,
          mr: 1,
          flex: 1,
          color: customTheme.dark,
          fontFamily: customTheme.font.titilliumBold,
        }}
        onChange={(e) => {
          if (props.onChange) {
            props.onChange(e.target.value as any);
          }
        }}
        multiline
        maxRows={3}
        {...props}
      />
    </Box>
  );
});
