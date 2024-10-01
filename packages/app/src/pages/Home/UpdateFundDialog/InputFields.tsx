import React from 'react';
import {Box, FormControl, OutlinedInput, styled, Typography,} from '@mui/material';
import {customTheme} from '../../../styles';
import {
  formatNumber,
  FundOverview,
  PROP_SHOP_PERCENT_ANNUAL_FEE,
  PROP_SHOP_PERCENT_PROFIT_SHARE,
  PropShopClient,
  UpdateVaultConfig,
} from '@cosmic-lab/prop-shop-sdk';
import {ActionButton, Toggle, UsdcIcon} from '../../../components';
import InputAdornment from '@mui/material/InputAdornment';
import {PublicKey} from '@solana/web3.js';
import {useSnackbar} from 'notistack';

const INPUT_WIDTH = '70%';
const SECONDS_PER_DAY = 60 * 60 * 24;

export function InputFields({
                              client,
                              fund,
                              onSubmit,
                            }: {
  client: PropShopClient;
  fund: FundOverview;
  onSubmit: (params: UpdateVaultConfig) => void;
}) {
  const defaultConfig = client.defaultUpdateVaultConfig({
    vault: fund.vault,
    venue: fund.venue,
  });

  const [config, setConfig] = React.useState<UpdateVaultConfig>(defaultConfig);

  return (
    <Box
      sx={{
        width: '100%',
        borderRadius: '10px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
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
          height: '80px',
          borderRadius: '10px',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          width: '20%',
        }}
      >
        <ActionButton onClick={() => onSubmit(config)}>Update</ActionButton>
      </Box>
    </Box>
  );
}

function Fields({
                  defaultConfig,
                  config,
                  setConfig,
                }: {
  defaultConfig: UpdateVaultConfig;
  config: UpdateVaultConfig;
  setConfig: (config: UpdateVaultConfig) => void;
}) {
  const {enqueueSnackbar} = useSnackbar();

  function changeDelegate(value: string) {
    try {
      const delegate = new PublicKey(value);
      setConfig({...config, delegate});
    } catch (e: any) {
      enqueueSnackbar(`Delegate is not a valid public key`, {
        variant: 'error',
      });
    }
  }

  function changeProfitShare(value: number) {
    if (value >= (defaultConfig.percentProfitShare ?? 0)) {
      enqueueSnackbar(
        `Profit share must be less than current value ${defaultConfig.percentProfitShare}%`,
        {
          variant: 'error',
        }
      );
      return;
    }
    const max = 100 - PROP_SHOP_PERCENT_PROFIT_SHARE;
    if (value < 0 || value > max) {
      enqueueSnackbar(`Profit share must be 0-${max}%`, {
        variant: 'error',
      });
      return;
    }
    setConfig({...config, percentProfitShare: value});
  }

  function changeAnnualFee(value: number) {
    if (value >= (defaultConfig.percentAnnualManagementFee ?? 0)) {
      enqueueSnackbar(
        `Annual management fee must be less than current value ${defaultConfig.percentAnnualManagementFee}%`,
        {
          variant: 'error',
        }
      );
      return;
    }
    const max = 100 - PROP_SHOP_PERCENT_ANNUAL_FEE;
    if (value < 0 || value > max) {
      enqueueSnackbar(`Annual fee must be 0-${max}%`, {
        variant: 'error',
      });
      return;
    }
    setConfig({...config, percentAnnualManagementFee: value});
  }

  function changeMaxFundDeposits(value: number) {
    if (value >= (defaultConfig.maxCapacityUSDC ?? 0)) {
      enqueueSnackbar(
        `Fund capacity must be less than current value $${formatNumber(defaultConfig.maxCapacityUSDC ?? 0)}`,
        {
          variant: 'error',
        }
      );
      return;
    }
    if (value < 0) {
      enqueueSnackbar(`Maximum fund deposits must be positive`, {
        variant: 'error',
      });
      return;
    }
    setConfig({...config, maxCapacityUSDC: value});
  }

  function changeMinDepositPerUser(value: number) {
    if (value >= (defaultConfig.percentAnnualManagementFee ?? 0)) {
      enqueueSnackbar(
        `Minimum deposit per user must be less than current value $${formatNumber(defaultConfig.minDepositUSDC ?? 0)}`,
        {
          variant: 'error',
        }
      );
      return;
    }
    if (value < 0) {
      enqueueSnackbar(`Minimum deposit per user must be positive`, {
        variant: 'error',
      });
      return;
    }
    setConfig({...config, minDepositUSDC: value});
  }

  function changeInviteOnly(value: boolean) {
    setConfig({...config, permissioned: value});
  }

  function changeRedeemPeriod(days: number) {
    const seconds = days * SECONDS_PER_DAY;
    const currentDays = (defaultConfig.redeemPeriod ?? 0) / SECONDS_PER_DAY;
    if (seconds >= (defaultConfig.redeemPeriod ?? 0)) {
      const dayPlural = currentDays === 1 ? 'day' : 'days';
      enqueueSnackbar(
        `Redeem period must be less than current value: ${currentDays} ${dayPlural}`,
        {
          variant: 'error',
        }
      );
      return;
    }
    if (days < 0 || days > 90) {
      enqueueSnackbar(`Redeem period must be less than 90 days`, {
        variant: 'error',
      });
      return;
    }
    setConfig({...config, redeemPeriod: days * SECONDS_PER_DAY});
  }

  return (
    <Box
      sx={{
        flexGrow: 1,
        bgcolor: customTheme.grey,
        borderRadius: '10px',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
      }}
    >
      <TableRow hover>
        <Typography variant="h4">Delegate (Trader)</Typography>
        <TextInput
          defaultValue={defaultConfig.delegate?.toString() ?? ''}
          value={config.delegate?.toString() ?? ''}
          onChange={changeDelegate}
        />
      </TableRow>

      <TableRow hover>
        <Typography variant="h4">Profit Share</Typography>
        <PercentInput
          defaultValue={defaultConfig.percentProfitShare ?? 0}
          value={config.percentProfitShare ?? 0}
          onChange={changeProfitShare}
        />
      </TableRow>

      <TableRow hover>
        <Typography variant="h4">Annual Fee</Typography>
        <PercentInput
          defaultValue={defaultConfig.percentAnnualManagementFee ?? 0}
          value={config.percentAnnualManagementFee ?? 0}
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
        <Typography variant="h4">Minimum Investment</Typography>
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
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'right',
          }}
        >
          <Toggle changeInviteOnly={changeInviteOnly}/>
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

const TableRow = styled('div')<{ hover?: boolean; header?: boolean }>(
  ({theme: _theme, hover, header}) => ({
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px',
    borderRadius: '10px',
    color: customTheme.light,
    '&:hover': {
      backgroundColor: `${hover ? customTheme.grey2 : 'transparent'}`,
    },

    ...(header && {
      borderBottom: `1px solid ${customTheme.light}`,
      borderBottomRightRadius: '0',
      borderBottomLeftRadius: '0',
    }),
  })
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
        '& .MuiOutlinedInput-root': {
          '& fieldset': {
            border: 'none',
          },
          '&:hover fieldset': {
            border: 'none',
          },
          borderRadius: '10px',
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
              textAlign: 'right',
            },
          },
        }}
        label={value}
        value={value}
        multiline={false}
        type={'text'}
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
        '& .MuiOutlinedInput-root': {
          '& fieldset': {
            border: 'none',
          },
          '&:hover fieldset': {
            border: 'none',
          },
          borderRadius: '10px',
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
              textAlign: 'right',
            },
          },
        }}
        label={value}
        value={value}
        multiline={false}
        endAdornment={
          <InputAdornment position="end">
            <Typography
              variant="h4"
              sx={{color: customTheme.dark, fontWeight: 300}}
            >
              %
            </Typography>
          </InputAdornment>
        }
        type={'tel'}
        onChange={(i: any) => {
          // if (i.target.value === undefined || i.target.value === null) {
          //   onChange(defaultValue);
          //   return;
          // }
          const num = parseInt(i.target.value, 10);
          if (isNaN(num)) {
            onChange(0);
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
        textAlign: 'right',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'right',
        width: INPUT_WIDTH,
        '& .MuiOutlinedInput-root': {
          '& fieldset': {
            border: 'none',
          },
          '&:hover fieldset': {
            border: 'none',
          },
          borderRadius: '10px',
        },
      }}
    >
      <OutlinedInput
        slotProps={{
          input: {
            style: {
              textAlign: 'right',
            },
          },
        }}
        label={value}
        value={value}
        multiline={false}
        endAdornment={
          <InputAdornment position="end">
            <Typography variant="h4">{value === 1 ? 'day' : 'days'}</Typography>
          </InputAdornment>
        }
        type={'tel'}
        onChange={(i: any) => {
          // if (i.target.value === undefined || i.target.value === null) {
          //   onChange(defaultValue);
          //   return;
          // }
          const num = parseInt(i.target.value, 10);
          if (isNaN(num)) {
            onChange(0);
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
        '& .MuiOutlinedInput-root': {
          '& fieldset': {
            border: 'none',
          },
          '&:hover fieldset': {
            border: 'none',
          },
          borderRadius: '10px',
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
              textAlign: 'right',
            },
          },
        }}
        // defaultValue={defaultValue}
        label={value}
        value={value}
        multiline={false}
        endAdornment={
          <InputAdornment position="end">
            <UsdcIcon/>
          </InputAdornment>
        }
        type={'tel'}
        onChange={(i: any) => {
          // if (i.target.value === undefined || i.target.value === null) {
          //   onChange(defaultValue);
          //   return;
          // }
          const num = parseInt(i.target.value, 10);
          if (isNaN(num)) {
            onChange(0);
            return;
          }
          onChange(num);
        }}
      />
    </FormControl>
  );
}
