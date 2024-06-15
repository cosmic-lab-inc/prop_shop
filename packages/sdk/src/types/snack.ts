import { ReactNode } from 'react';

export type SnackInfo = {
  variant: 'success' | 'error';
  message: string;
};

export type SnackElement = {
  element: ReactNode;
  variant: 'success' | 'error';
};
