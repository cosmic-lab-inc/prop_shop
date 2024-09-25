import type {FC, ReactElement, SyntheticEvent} from 'react';
import React, {useCallback, useMemo, useState} from 'react';
import {ExpandLess as CollapseIcon, ExpandMore as ExpandIcon,} from '@mui/icons-material';
import type {DialogProps, Theme} from '@mui/material';
import {Button, Collapse, Dialog, DialogContent, List, ListItem, styled,} from '@mui/material';
import type {WalletName} from '@solana/wallet-adapter-base';
import {WalletReadyState} from '@solana/wallet-adapter-base';
import {useWallet, type Wallet} from '@solana/wallet-adapter-react';
import {WalletListItem} from './WalletListItem';
import {useWalletDialog} from '@solana/wallet-adapter-material-ui';
import {customTheme} from '../../styles';

const RootDialog = styled(Dialog)(({theme}: { theme: Theme }) => ({
  '& .MuiDialog-paper': {
    width: theme.spacing(40),
  },
  '& .MuiDialogTitle-root': {
    backgroundColor: theme.palette.primary.main,
    display: 'flex',
    justifyContent: 'space-between',
    lineHeight: theme.spacing(5),
    '& .MuiIconButton-root': {
      flexShrink: 1,
      padding: theme.spacing(),
      marginRight: theme.spacing(-1),
      color: theme.palette.grey[500],
    },
  },
  '& .MuiDialogContent-root': {
    padding: 0,
    '& .MuiCollapse-root': {
      '& .MuiList-root': {
        background: theme.palette.primary.main,
      },
    },
    '& .MuiList-root': {
      background: theme.palette.primary.main,
      padding: 0,
    },
    '& .MuiListItem-root': {
      boxShadow: 'inset 0 1px 0 0 ' + 'rgba(255, 255, 255, 0.1)',
      '&:hover': {
        boxShadow:
          'inset 0 1px 0 0 ' +
          'rgba(255, 255, 255, 0.1)' +
          ', 0 1px 0 0 ' +
          'rgba(255, 255, 255, 0.05)',
      },
      padding: 0,
      '& .MuiButton-endIcon': {
        margin: 0,
      },
      '& .MuiButton-root': {
        color: theme.palette.text.primary,
        flexGrow: 1,
        justifyContent: 'space-between',
        padding: 10,
        fontSize: theme.typography.h4.fontSize,
        fontWeight: theme.typography.h4.fontWeight,
        fontFamily: theme.typography.h4.fontFamily,
      },
      '& .MuiSvgIcon-root': {
        color: theme.palette.grey[500],
      },
    },
  },
}));

export interface WalletDialogProps extends Omit<DialogProps, 'title' | 'open'> {
  featuredWallets?: number;
  title?: ReactElement;
}

export const WalletDialog: FC<WalletDialogProps> = ({
                                                      title = 'Choose a wallet',
                                                      featuredWallets = 3,
                                                      onClose,
                                                      ...props
                                                    }) => {
  const {wallets, select} = useWallet();
  const {open, setOpen} = useWalletDialog();
  const [expanded, setExpanded] = useState(false);

  const [featured, more] = useMemo(() => {
    const installed: Wallet[] = [];
    const notInstalled: Wallet[] = [];

    for (const wallet of wallets) {
      if (wallet.readyState === WalletReadyState.Installed) {
        installed.push(wallet);
      } else {
        notInstalled.push(wallet);
      }
    }

    const orderedWallets = [...installed, ...notInstalled];
    return [
      orderedWallets.slice(0, featuredWallets),
      orderedWallets.slice(featuredWallets),
    ];
  }, [wallets, featuredWallets]);

  const handleClose = useCallback(
    (event: SyntheticEvent, reason?: 'backdropClick' | 'escapeKeyDown') => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (onClose) onClose(event, reason!);
      if (!event.defaultPrevented) setOpen(false);
    },
    [setOpen, onClose]
  );

  const handleWalletClick = useCallback(
    (event: SyntheticEvent, walletName: WalletName) => {
      select(walletName);
      handleClose(event);
    },
    [select, handleClose]
  );

  const handleExpandClick = useCallback(
    () => setExpanded(!expanded),
    [setExpanded, expanded]
  );

  return (
    <RootDialog open={open} onClose={handleClose} {...props}>
      <DialogContent>
        <List sx={{m: 1}}>
          {featured.map((wallet) => (
            <WalletListItem
              key={wallet.adapter.name}
              onClick={(event) => handleWalletClick(event, wallet.adapter.name)}
              wallet={wallet}
              sx={{
                bgcolor: customTheme.light,
                '&:hover': {
                  bgcolor: customTheme.grey,
                },
                display: 'flex',
                justifyContent: 'right',
                textAlign: 'right',
                borderRadius: '3px'
              }}
            />
          ))}
          {more.length ? (
            <>
              <Collapse in={expanded} timeout="auto" unmountOnExit>
                <List>
                  {more.map((wallet) => (
                    <WalletListItem
                      key={wallet.adapter.name}
                      onClick={(event) =>
                        handleWalletClick(event, wallet.adapter.name)
                      }
                      wallet={wallet}
                    />
                  ))}
                </List>
              </Collapse>
              <ListItem>
                <Button onClick={handleExpandClick}>
                  {expanded ? 'Less' : 'More'} options
                  {expanded ? <CollapseIcon/> : <ExpandIcon/>}
                </Button>
              </ListItem>
            </>
          ) : null}
        </List>
      </DialogContent>
    </RootDialog>
  );
};
