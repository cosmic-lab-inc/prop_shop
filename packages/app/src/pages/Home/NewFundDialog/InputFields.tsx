import React from "react";
import {
  Box,
  FormControl,
  OutlinedInput,
  styled,
  Switch,
  SwitchProps,
  Typography,
} from "@mui/material";
import { customTheme } from "../../../styles";
import {
  CreateVaultConfig,
  PropShopClient,
  randomName,
} from "@cosmic-lab/prop-shop-sdk";
import { ActionButton, UsdcIcon } from "../../../components";
import InputAdornment from "@mui/material/InputAdornment";
import { PublicKey } from "@solana/web3.js";
import { useSnackbar } from "notistack";

const INPUT_WIDTH = "70%";
const SECONDS_PER_DAY = 60 * 60 * 24;

export function InputFields({
  client,
  onSubmit,
}: {
  client: PropShopClient;
  onSubmit: (params: CreateVaultConfig) => void;
}) {
  const defaultConfig: CreateVaultConfig = {
    name: randomName(2, 32),
    delegate: client.publicKey,
    percentProfitShare: 20,
    percentAnnualManagementFee: 2,
    maxCapacityUSDC: 100_000_000,
    minDepositUSDC: 0,
    permissioned: false,
    redeemPeriod: 60 * 60 * 24,
  };

  const [config, setConfig] = React.useState<CreateVaultConfig>(defaultConfig);

  return (
    <Box
      sx={{
        width: "100%",
        borderRadius: "10px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        flexGrow: 1,
        gap: 1,
        p: 1,
        bgcolor: customTheme.grey,
      }}
    >
      <Fields
        defaultConfig={defaultConfig}
        config={config}
        setConfig={setConfig}
      />

      <Box
        sx={{
          height: "80px",
          borderRadius: "10px",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          width: "20%",
        }}
      >
        <ActionButton onClick={() => onSubmit(config)}>Create</ActionButton>
      </Box>
    </Box>
  );
}

function Fields({
  defaultConfig,
  config,
  setConfig,
}: {
  defaultConfig: CreateVaultConfig;
  config: CreateVaultConfig;
  setConfig: (config: CreateVaultConfig) => void;
}) {
  const { enqueueSnackbar } = useSnackbar();

  function changeName(value: string) {
    if (value.length > 32) {
      enqueueSnackbar(`Name must be less than 32 characters`, {
        variant: "error",
      });
      setConfig({ ...config, name: defaultConfig.name });
    } else {
      setConfig({ ...config, name: value });
    }
  }

  function changeDelegate(value: string) {
    try {
      const delegate = new PublicKey(value);
      setConfig({ ...config, delegate });
    } catch (e: any) {
      enqueueSnackbar(`Delegate is not a valid public key`, {
        variant: "error",
      });
    }
  }

  function changeProfitShare(value: number) {
    if (value < 0 || value > 100) {
      enqueueSnackbar(`Profit share must be 0-100%`, {
        variant: "error",
      });
    } else {
      setConfig({ ...config, percentProfitShare: value });
    }
  }

  function changeAnnualFee(value: number) {
    if (value < 0 || value > 100) {
      enqueueSnackbar(`Annual fee must be 0-100%`, {
        variant: "error",
      });
    } else {
      setConfig({ ...config, percentAnnualManagementFee: value });
    }
  }

  function changeMaxFundDeposits(value: number) {
    if (value < 0) {
      enqueueSnackbar(`Max fund deposits must be positive`, {
        variant: "error",
      });
    } else {
      setConfig({ ...config, maxCapacityUSDC: value });
    }
  }

  function changeMinDepositPerUser(value: number) {
    if (value < 0) {
      enqueueSnackbar(`Min deposit per user must be positive`, {
        variant: "error",
      });
    } else {
      setConfig({ ...config, minDepositUSDC: value });
    }
  }

  function changeInviteOnly(value: boolean) {
    setConfig({ ...config, permissioned: value });
  }

  function changeRedeemPeriod(days: number) {
    if (days < 0 || days > 90) {
      enqueueSnackbar(`Redeem period must be 0-90 days`, {
        variant: "error",
      });
    } else {
      setConfig({ ...config, redeemPeriod: days * SECONDS_PER_DAY });
    }
  }

  return (
    <Box
      sx={{
        flexGrow: 1,
        bgcolor: customTheme.grey,
        borderRadius: "10px",
        display: "flex",
        flexDirection: "column",
        width: "100%",
      }}
    >
      <TableRow hover>
        <Typography variant="h4">Name</Typography>
        <TextInput
          defaultValue={defaultConfig.name}
          value={config.name}
          onChange={changeName}
        />
      </TableRow>

      <TableRow hover>
        <Typography variant="h4">Delegate (Trader)</Typography>
        <TextInput
          defaultValue={defaultConfig.delegate!.toString()}
          value={config.delegate!.toString()}
          onChange={changeDelegate}
        />
      </TableRow>

      <TableRow hover>
        <Typography variant="h4">Profit Share</Typography>
        <PercentInput
          defaultValue={defaultConfig.percentProfitShare}
          value={config.percentProfitShare}
          onChange={changeProfitShare}
        />
      </TableRow>

      <TableRow hover>
        <Typography variant="h4">Annual Fee</Typography>
        <PercentInput
          defaultValue={defaultConfig.percentAnnualManagementFee}
          value={config.percentAnnualManagementFee}
          onChange={changeAnnualFee}
        />
      </TableRow>

      <TableRow hover>
        <Typography variant="h4">Max Fund Deposits</Typography>
        <PriceInput
          defaultValue={defaultConfig.maxCapacityUSDC ?? 0}
          value={config.maxCapacityUSDC ?? 0}
          onChange={changeMaxFundDeposits}
        />
      </TableRow>

      <TableRow hover>
        <Typography variant="h4">Min Deposit per User</Typography>
        <PriceInput
          defaultValue={defaultConfig.minDepositUSDC ?? 0}
          value={config.minDepositUSDC ?? 0}
          onChange={changeMinDepositPerUser}
        />
      </TableRow>

      <TableRow hover>
        <Typography variant="h4">Invite Only</Typography>
        <Box
          sx={{
            width: INPUT_WIDTH,
            display: "flex",
            flexDirection: "row",
            justifyContent: "right",
          }}
        >
          <Toggle changeInviteOnly={changeInviteOnly} />
        </Box>
      </TableRow>

      <TableRow hover>
        <Typography variant="h4">Redeem Period</Typography>
        <DaysInput
          defaultValue={(defaultConfig.redeemPeriod ?? 0) / SECONDS_PER_DAY}
          value={(config.redeemPeriod ?? 0) / SECONDS_PER_DAY}
          onChange={changeRedeemPeriod}
        />
      </TableRow>
    </Box>
  );
}

const TableRow = styled("div")<{ hover?: boolean; header?: boolean }>(
  ({ theme, hover, header }) => ({
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px",
    borderRadius: "10px",
    color: customTheme.dark,
    "&:hover": {
      backgroundColor: `${hover ? customTheme.grey2 : "transparent"}`,
    },

    ...(header && {
      borderBottom: `1px solid ${customTheme.dark}`,
      borderBottomRightRadius: "0",
      borderBottomLeftRadius: "0",
    }),
  }),
);

function TextInput({
  defaultValue,
  value,
  onChange,
}: {
  defaultValue: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormControl
      fullWidth
      variant="outlined"
      sx={{
        width: INPUT_WIDTH,
        "& .MuiOutlinedInput-root": {
          "& fieldset": {
            border: "none",
          },
          "&:hover fieldset": {
            border: "none",
          },
          borderRadius: "10px",
        },
      }}
    >
      <OutlinedInput
        sx={{
          fontSize: 20,
        }}
        slotProps={{
          input: {
            style: {
              textAlign: "right",
            },
          },
        }}
        defaultValue={defaultValue}
        label={value}
        value={value}
        multiline={false}
        type={"text"}
        onChange={(i: any) => {
          if (i.target.value === undefined || i.target.value === null) {
            onChange(defaultValue);
            return;
          }
          onChange(i.target.value);
        }}
      />
    </FormControl>
  );
}

function PercentInput({
  defaultValue,
  value,
  onChange,
}: {
  defaultValue: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <FormControl
      variant="outlined"
      sx={{
        width: INPUT_WIDTH,
        "& .MuiOutlinedInput-root": {
          "& fieldset": {
            border: "none",
          },
          "&:hover fieldset": {
            border: "none",
          },
          borderRadius: "10px",
        },
      }}
    >
      <OutlinedInput
        sx={{
          fontSize: 20,
        }}
        slotProps={{
          input: {
            style: {
              textAlign: "right",
            },
          },
        }}
        defaultValue={defaultValue}
        label={value}
        value={value}
        multiline={false}
        endAdornment={
          <InputAdornment position="end">
            <Typography
              variant="h4"
              sx={{ color: customTheme.light, fontWeight: 300 }}
            >
              %
            </Typography>
          </InputAdornment>
        }
        type={"tel"}
        onChange={(i: any) => {
          if (i.target.value === undefined || i.target.value === null) {
            onChange(defaultValue);
            return;
          }
          const num = parseInt(i.target.value, 10);
          if (isNaN(num)) {
            onChange(defaultValue);
            return;
          }
          onChange(num);
        }}
      />
    </FormControl>
  );
}

function DaysInput({
  defaultValue,
  value,
  onChange,
}: {
  defaultValue: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <FormControl
      variant="outlined"
      sx={{
        textAlign: "right",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "right",
        width: INPUT_WIDTH,
        "& .MuiOutlinedInput-root": {
          "& fieldset": {
            border: "none",
          },
          "&:hover fieldset": {
            border: "none",
          },
          borderRadius: "10px",
        },
      }}
    >
      <OutlinedInput
        sx={{
          fontSize: 20,
        }}
        slotProps={{
          input: {
            style: {
              textAlign: "right",
            },
          },
        }}
        defaultValue={defaultValue}
        label={value}
        value={value}
        multiline={false}
        endAdornment={
          <InputAdornment position="end">
            <Typography
              variant="h4"
              sx={{ color: customTheme.light, fontWeight: 300 }}
            >
              {value === 1 ? "day" : "days"}
            </Typography>
          </InputAdornment>
        }
        type={"tel"}
        onChange={(i: any) => {
          if (i.target.value === undefined || i.target.value === null) {
            onChange(defaultValue);
            return;
          }
          const num = parseInt(i.target.value, 10);
          if (isNaN(num)) {
            onChange(defaultValue);
            return;
          }
          onChange(num);
        }}
      />
    </FormControl>
  );
}

function PriceInput({
  defaultValue,
  value,
  onChange,
}: {
  defaultValue: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <FormControl
      variant="outlined"
      sx={{
        width: INPUT_WIDTH,
        "& .MuiOutlinedInput-root": {
          "& fieldset": {
            border: "none",
          },
          "&:hover fieldset": {
            border: "none",
          },
          borderRadius: "10px",
        },
      }}
    >
      <OutlinedInput
        sx={{
          fontSize: 20,
        }}
        slotProps={{
          input: {
            style: {
              textAlign: "right",
            },
          },
        }}
        defaultValue={defaultValue}
        label={value}
        value={value}
        multiline={false}
        endAdornment={
          <InputAdornment position="end">
            <UsdcIcon />
          </InputAdornment>
        }
        type={"tel"}
        onChange={(i: any) => {
          if (i.target.value === undefined || i.target.value === null) {
            onChange(defaultValue);
            return;
          }
          const num = parseInt(i.target.value, 10);
          if (isNaN(num)) {
            onChange(defaultValue);
            return;
          }
          onChange(num);
        }}
      />
    </FormControl>
  );
}

type ToggleProps = {
  changeInviteOnly: (value: boolean) => void;
} & SwitchProps;

const Toggle = styled((props: ToggleProps) => (
  <Switch
    focusVisibleClassName=".Mui-focusVisible"
    disableRipple
    onChange={(_: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
      props.changeInviteOnly(checked);
    }}
    {...props}
  />
))(({ theme }) => ({
  width: "100px",
  height: 34,
  padding: 0,
  "& .MuiSwitch-switchBase": {
    padding: 0,
    margin: 2,
    transitionDuration: "300ms",
    "&.Mui-checked": {
      transform: "translateX(48px)",
      color: customTheme.light,
      "& + .MuiSwitch-track": {
        backgroundColor: customTheme.secondary,
        opacity: 1,
        border: 0,
      },
      "&.Mui-disabled + .MuiSwitch-track": {
        opacity: 0.5,
      },
    },
    "&.Mui-disabled .MuiSwitch-thumb": {
      color:
        theme.palette.mode === "light"
          ? theme.palette.grey[100]
          : theme.palette.grey[600],
    },
    "&.Mui-disabled + .MuiSwitch-track": {
      opacity: theme.palette.mode === "light" ? 0.7 : 0.3,
    },
  },
  "& .MuiSwitch-thumb": {
    boxSizing: "border-box",
    borderRadius: 10,
    width: 48,
    height: 30,
  },
  "& .MuiSwitch-track": {
    borderRadius: 10,
    opacity: 1,
    transition: theme.transitions.create(["background-color"], {
      duration: 500,
    }),
  },
}));
