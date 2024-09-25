import {Button, ListItem, ListItemProps} from '@mui/material';
import type {Wallet} from '@solana/wallet-adapter-react';
import type {FC, MouseEventHandler} from 'react';
import React from 'react';
import {WalletIcon} from '../Buttons/WalletButton/WalletIcon';

interface WalletListItemProps
  extends Omit<ListItemProps, 'onClick' | 'button'> {
  onClick: MouseEventHandler<HTMLButtonElement>;
  wallet: Wallet;
}

export const WalletListItem: FC<WalletListItemProps> = ({
                                                          onClick,
                                                          wallet,
                                                          ...props
                                                        }) => {
  return (
    <ListItem {...props}>
      <Button onClick={onClick} endIcon={<WalletIcon wallet={wallet}/>}>
        {wallet.adapter.name}
      </Button>
    </ListItem>
  );
};
